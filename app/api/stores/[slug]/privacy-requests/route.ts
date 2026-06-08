import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getPublicStorefront } from "@/features/commerce/data";
import {
  createPrivacyRequestPreview,
  createPrivacyRequestSubject,
  mergePrivacyRequestTags,
  normalizePrivacyRequestText,
  privacyRequestTypeLabels,
  privacyRequestTypes,
} from "@/features/commerce/privacy-requests";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const privacyRequestIpRateLimit = {
  limit: 30,
  windowMs: 60 * 1000,
};
const privacyRequestEmailRateLimit = {
  limit: 4,
  windowMs: 60 * 1000,
};

const privacyRequestSchema = z.object({
  email: z.string().trim().email().max(120),
  message: z.string().trim().max(1200).optional(),
  name: z.string().trim().max(80).optional(),
  orderId: z.string().trim().max(80).optional(),
  requestType: z.enum(privacyRequestTypes),
});

type CustomerProfileLookupRow = {
  id: string;
  accepts_marketing: boolean | null;
  name: string | null;
  note: string | null;
  tags: string[] | null;
  tax_exempt: boolean | null;
};

function createDemoRequestId() {
  return `demo-privacy-${randomBytes(6).toString("hex")}`;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Privacy request rate limit exceeded." },
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
    `privacy-request:${slug}:${getClientFingerprint(request)}`,
    privacyRequestIpRateLimit,
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

  const parsed = privacyRequestSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the privacy request details." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailRateLimit = consumeRateLimit(
    `privacy-request:email:${slug}:${email}`,
    privacyRequestEmailRateLimit,
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

  const isDemoStorefront = storefront.store.id.startsWith("demo-");

  if (!isSupabaseConfigured() || isDemoStorefront) {
    return Response.json({
      ok: true,
      demo: true,
      requestId: createDemoRequestId(),
    });
  }

  const db = getSupabaseAdmin();
  const { data: existingProfile, error: lookupError } = await db
    .from("customer_profiles")
    .select("id, accepts_marketing, name, note, tags, tax_exempt")
    .eq("store_id", storefront.store.id)
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    return Response.json(
      { ok: false, error: "Privacy request is not available." },
      { status: 503 },
    );
  }

  const existing = existingProfile as CustomerProfileLookupRow | null;
  const name =
    normalizePrivacyRequestText(parsed.data.name) ||
    normalizePrivacyRequestText(existing?.name);
  const message = normalizePrivacyRequestText(parsed.data.message);
  const acceptsMarketing =
    parsed.data.requestType === "marketing_opt_out"
      ? false
      : Boolean(existing?.accepts_marketing);
  const { data: profile, error: profileError } = await db
    .from("customer_profiles")
    .upsert(
      {
        store_id: storefront.store.id,
        email,
        name: name || null,
        note:
          normalizePrivacyRequestText(existing?.note) ||
          `Privacy request: ${privacyRequestTypeLabels[parsed.data.requestType]}.`,
        tags: mergePrivacyRequestTags(existing?.tags || []),
        accepts_marketing: acceptsMarketing,
        tax_exempt: Boolean(existing?.tax_exempt),
      },
      { onConflict: "store_id,email" },
    )
    .select("id")
    .single();

  if (profileError) {
    return Response.json(
      { ok: false, error: "Privacy request could not be saved." },
      { status: 500 },
    );
  }

  const profileId = (profile as { id: string }).id;
  const orderId = normalizePrivacyRequestText(parsed.data.orderId);
  const { data: notification, error: notificationError } = await db
    .from("store_notifications")
    .insert({
      store_id: storefront.store.id,
      type: "customer_message",
      status: "pending",
      recipient_email: email,
      recipient_name: name || null,
      subject: createPrivacyRequestSubject({
        requestType: parsed.data.requestType,
        storeName: storefront.store.name,
      }),
      preview: createPrivacyRequestPreview({
        email,
        message,
        requestType: parsed.data.requestType,
      }),
      resource_type: "customer_privacy_request",
      resource_id: profileId,
      metadata: {
        customerEmail: email,
        message,
        orderId: orderId || null,
        requestType: parsed.data.requestType,
        requestTypeLabel: privacyRequestTypeLabels[parsed.data.requestType],
        source: "storefront_privacy_request",
      },
    })
    .select("id")
    .single();

  if (notificationError) {
    return Response.json(
      { ok: false, error: "Privacy request could not be queued." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    requestId: (notification as { id: string }).id,
  });
}
