import { randomBytes } from "node:crypto";
import { z } from "zod";

import {
  createContactPreview,
  createContactSubject,
  normalizeContactText,
  storefrontContactReasonLabels,
  storefrontContactReasons,
} from "@/features/commerce/contact";
import { getPublicStorefront } from "@/features/commerce/data";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const contactIpRateLimit = {
  limit: 30,
  windowMs: 60 * 1000,
};
const contactEmailRateLimit = {
  limit: 6,
  windowMs: 60 * 1000,
};

const storefrontContactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  reason: z.enum(storefrontContactReasons),
  orderId: z.string().trim().max(80).optional(),
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10).max(1200),
});

function createDemoTicketId() {
  return `demo-contact-${randomBytes(6).toString("hex")}`;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Contact request rate limit exceeded." },
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
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const clientRateLimit = consumeRateLimit(
    `store-contact:${slug}:${getClientFingerprint(request)}`,
    contactIpRateLimit,
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

  const parsed = storefrontContactSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the contact request details." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailRateLimit = consumeRateLimit(
    `store-contact:email:${slug}:${email}`,
    contactEmailRateLimit,
  );

  if (!emailRateLimit.ok) {
    return rateLimitedResponse(emailRateLimit.retryAfterSeconds);
  }

  const storefront = await getPublicStorefront(slug);

  if (!storefront) {
    return Response.json(
      { ok: false, error: "Storefront is not available." },
      { status: 404 },
    );
  }

  const orderId = normalizeContactText(parsed.data.orderId || "");
  const subject = createContactSubject({
    reason: parsed.data.reason,
    storeName: storefront.store.name,
    subject: parsed.data.subject,
  });
  const message = normalizeContactText(parsed.data.message);
  const preview = createContactPreview(message);
  const metadata = {
    message,
    orderId: orderId || null,
    reason: parsed.data.reason,
    reasonLabel: storefrontContactReasonLabels[parsed.data.reason],
    source: "storefront_contact",
  };
  const isDemoStorefront = storefront.store.id.startsWith("demo-");

  if (!isSupabaseConfigured() || isDemoStorefront) {
    return Response.json({
      ok: true,
      demo: true,
      ticketId: createDemoTicketId(),
    });
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("store_notifications")
    .insert({
      store_id: storefront.store.id,
      type: "customer_message",
      status: "pending",
      recipient_email: email,
      recipient_name: parsed.data.name.trim(),
      subject,
      preview,
      resource_type: orderId ? "order" : "customer_message",
      resource_id: orderId || null,
      metadata,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { ok: false, error: "Contact request could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    ticketId: (data as { id: string }).id,
  });
}
