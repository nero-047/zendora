import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getPublicOrderReceipt } from "@/features/commerce/data";
import {
  createCancellationPreview,
  createCancellationSubject,
  getOrderCancellationEligibility,
  normalizeCancellationText,
  orderCancellationReasonLabels,
  orderCancellationReasons,
} from "@/features/commerce/order-cancellation";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const cancellationRequestIpRateLimit = {
  limit: 20,
  windowMs: 60 * 1000,
};
const cancellationRequestOrderRateLimit = {
  limit: 3,
  windowMs: 60 * 1000,
};

const cancellationRequestSchema = z.object({
  message: z.string().trim().max(1200).optional(),
  reason: z.enum(orderCancellationReasons),
  token: z.string().trim().min(8).max(160),
});

function createDemoCancellationRequestId() {
  return `demo-cancellation-${randomBytes(6).toString("hex")}`;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Cancellation request rate limit exceeded." },
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
    `order-cancellation:${slug}:${orderId}:${getClientFingerprint(request)}`,
    cancellationRequestIpRateLimit,
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

  const parsed = cancellationRequestSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the cancellation request details." },
      { status: 400 },
    );
  }

  const orderRateLimit = consumeRateLimit(
    `order-cancellation:order:${slug}:${orderId}`,
    cancellationRequestOrderRateLimit,
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

  const eligibility = getOrderCancellationEligibility(receipt.order);

  if (!eligibility.eligible) {
    return Response.json(
      { ok: false, error: eligibility.message },
      { status: 400 },
    );
  }

  const message = normalizeCancellationText(parsed.data.message || "");
  const subject = createCancellationSubject({
    reason: parsed.data.reason,
    storeName: receipt.store.name,
  });
  const preview = createCancellationPreview({
    message,
    orderId: receipt.order.id,
    reason: parsed.data.reason,
  });
  const isDemoStorefront = receipt.store.id.startsWith("demo-");

  if (!isSupabaseConfigured() || isDemoStorefront) {
    return Response.json({
      ok: true,
      demo: true,
      requestId: createDemoCancellationRequestId(),
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
      resource_type: "customer_cancellation_request",
      resource_id: receipt.order.id,
      metadata: {
        customerEmail: receipt.order.customerEmail,
        message,
        orderId: receipt.order.id,
        reason: parsed.data.reason,
        reasonLabel: orderCancellationReasonLabels[parsed.data.reason],
        source: "storefront_order_cancellation_request",
      },
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { ok: false, error: "Cancellation request could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    requestId: (data as { id: string }).id,
  });
}
