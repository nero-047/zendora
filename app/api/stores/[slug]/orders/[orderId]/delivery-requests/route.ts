import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getPublicOrderReceipt } from "@/features/commerce/data";
import {
  createDeliveryRequestPreview,
  createDeliveryRequestSubject,
  getOrderDeliveryRequestEligibility,
  normalizeDeliveryRequestText,
  orderDeliveryRequestTypeLabels,
  orderDeliveryRequestTypes,
} from "@/features/commerce/order-delivery-request";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const deliveryRequestIpRateLimit = {
  limit: 20,
  windowMs: 60 * 1000,
};
const deliveryRequestOrderRateLimit = {
  limit: 4,
  windowMs: 60 * 1000,
};

const deliveryRequestSchema = z.object({
  message: z.string().trim().min(8).max(1200),
  requestType: z.enum(orderDeliveryRequestTypes),
  token: z.string().trim().min(8).max(160),
});

function createDemoDeliveryRequestId() {
  return `demo-delivery-${randomBytes(6).toString("hex")}`;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Delivery request rate limit exceeded." },
    {
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
      status: 429,
    },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string; orderId: string }> },
) {
  const { slug, orderId } = await context.params;
  const clientRateLimit = consumeRateLimit(
    `order-delivery:${slug}:${orderId}:${getClientFingerprint(request)}`,
    deliveryRequestIpRateLimit,
  );

  if (!clientRateLimit.ok) {
    return rateLimitedResponse(clientRateLimit.retryAfterSeconds);
  }

  const body = await readLimitedJsonBody(request);

  if (!body.ok) {
    return Response.json(
      { ok: false, error: body.error },
      { status: body.status },
    );
  }

  const parsed = deliveryRequestSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the delivery request details." },
      { status: 400 },
    );
  }

  const orderRateLimit = consumeRateLimit(
    `order-delivery:order:${slug}:${orderId}`,
    deliveryRequestOrderRateLimit,
  );

  if (!orderRateLimit.ok) {
    return rateLimitedResponse(orderRateLimit.retryAfterSeconds);
  }

  const receipt = await getPublicOrderReceipt({
    slug,
    orderId,
    token: parsed.data.token,
  });

  if (!receipt) {
    return Response.json(
      { ok: false, error: "Order is not available." },
      { status: 404 },
    );
  }

  const eligibility = getOrderDeliveryRequestEligibility(receipt.order);

  if (!eligibility.eligible) {
    return Response.json(
      { ok: false, error: eligibility.message },
      { status: 400 },
    );
  }

  const message = normalizeDeliveryRequestText(parsed.data.message);
  const subject = createDeliveryRequestSubject({
    requestType: parsed.data.requestType,
    storeName: receipt.store.name,
  });
  const preview = createDeliveryRequestPreview({
    message,
    orderId: receipt.order.id,
    requestType: parsed.data.requestType,
  });
  const isDemoStorefront = receipt.store.id.startsWith("demo-");

  if (!isSupabaseConfigured() || isDemoStorefront) {
    return Response.json({
      ok: true,
      demo: true,
      requestId: createDemoDeliveryRequestId(),
    });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("store_notifications")
    .insert({
      store_id: receipt.store.id,
      type: "customer_message",
      status: "pending",
      recipient_email: receipt.order.customerEmail,
      recipient_name: receipt.order.customerName,
      subject,
      preview,
      resource_type: "customer_delivery_request",
      resource_id: receipt.order.id,
      metadata: {
        customerEmail: receipt.order.customerEmail,
        message,
        orderId: receipt.order.id,
        requestType: parsed.data.requestType,
        requestTypeLabel:
          orderDeliveryRequestTypeLabels[parsed.data.requestType],
        source: "storefront_order_delivery_request",
      },
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { ok: false, error: "Delivery request could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    requestId: (data as { id: string }).id,
  });
}
