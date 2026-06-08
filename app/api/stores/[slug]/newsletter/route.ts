import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getPublicStorefront } from "@/features/commerce/data";
import {
  createNewsletterNote,
  mergeNewsletterTags,
  normalizeNewsletterText,
} from "@/features/commerce/newsletter";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const newsletterIpRateLimit = {
  limit: 45,
  windowMs: 60 * 1000,
};
const newsletterEmailRateLimit = {
  limit: 8,
  windowMs: 60 * 1000,
};

const newsletterSignupSchema = z.object({
  email: z.string().trim().email().max(120),
  name: z.string().trim().max(80).optional(),
  source: z.string().trim().max(80).optional(),
  acceptsMarketing: z.literal(true),
});

type CustomerProfileLookupRow = {
  id: string;
  name: string | null;
  note: string | null;
  tags: string[] | null;
  tax_exempt: boolean | null;
};

function createDemoProfileId() {
  return `demo-newsletter-${randomBytes(6).toString("hex")}`;
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Newsletter signup rate limit exceeded." },
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
    `newsletter:${slug}:${getClientFingerprint(request)}`,
    newsletterIpRateLimit,
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

  const parsed = newsletterSignupSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the newsletter signup details." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailRateLimit = consumeRateLimit(
    `newsletter:email:${slug}:${email}`,
    newsletterEmailRateLimit,
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
      profileId: createDemoProfileId(),
    });
  }

  const db = getSupabaseAdmin();
  const { data: existingProfile, error: lookupError } = await db
    .from("customer_profiles")
    .select("id, name, note, tags, tax_exempt")
    .eq("store_id", storefront.store.id)
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    return Response.json(
      { ok: false, error: "Newsletter signup is not available." },
      { status: 503 },
    );
  }

  const existing = existingProfile as CustomerProfileLookupRow | null;
  const name =
    normalizeNewsletterText(parsed.data.name) ||
    normalizeNewsletterText(existing?.name);
  const { data: profile, error } = await db
    .from("customer_profiles")
    .upsert(
      {
        store_id: storefront.store.id,
        email,
        name: name || null,
        note: createNewsletterNote({
          existingNote: existing?.note,
          source: parsed.data.source || "storefront",
        }),
        tags: mergeNewsletterTags(existing?.tags || []),
        accepts_marketing: true,
        tax_exempt: Boolean(existing?.tax_exempt),
      },
      { onConflict: "store_id,email" },
    )
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { ok: false, error: "Newsletter signup could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    profileId: (profile as { id: string }).id,
  });
}
