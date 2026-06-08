import { randomBytes } from "node:crypto";
import { z } from "zod";

import { getPublicStorefront } from "@/features/commerce/data";
import {
  createRestockAlertNote,
  mergeRestockAlertTags,
  normalizeRestockAlertText,
} from "@/features/commerce/restock-alerts";
import type { Product, ProductVariant } from "@/features/commerce/types";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const restockAlertIpRateLimit = {
  limit: 45,
  windowMs: 60 * 1000,
};
const restockAlertEmailRateLimit = {
  limit: 8,
  windowMs: 60 * 1000,
};

const restockAlertSchema = z.object({
  acceptsMarketing: z.literal(true),
  email: z.string().trim().email().max(120),
  name: z.string().trim().max(80).optional(),
  productId: z.string().trim().min(1).max(120),
  variantId: z.string().trim().max(120).optional(),
});

type CustomerProfileLookupRow = {
  id: string;
  name: string | null;
  note: string | null;
  tags: string[] | null;
  tax_exempt: boolean | null;
};

function createDemoAlertId() {
  return `demo-restock-${randomBytes(6).toString("hex")}`;
}

function getProductVariant(input: {
  product: Product;
  variantId?: string;
}): ProductVariant | null {
  if (!input.variantId) {
    return null;
  }

  return (
    input.product.variants.find(
      (variant) =>
        variant.id === input.variantId && variant.status === "active",
    ) || null
  );
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Restock alert rate limit exceeded." },
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
    `restock-alert:${slug}:${getClientFingerprint(request)}`,
    restockAlertIpRateLimit,
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

  const parsed = restockAlertSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the restock alert details." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const emailRateLimit = consumeRateLimit(
    `restock-alert:email:${slug}:${email}`,
    restockAlertEmailRateLimit,
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

  const product =
    storefront.products.find((item) => item.id === parsed.data.productId) ||
    null;

  if (!product) {
    return Response.json(
      { ok: false, error: "Product is not available." },
      { status: 404 },
    );
  }

  const variant = getProductVariant({
    product,
    variantId: parsed.data.variantId,
  });

  if (parsed.data.variantId && !variant) {
    return Response.json(
      { ok: false, error: "Product variant is not available." },
      { status: 400 },
    );
  }

  const isDemoStorefront = storefront.store.id.startsWith("demo-");

  if (!isSupabaseConfigured() || isDemoStorefront) {
    return Response.json({
      ok: true,
      alertId: createDemoAlertId(),
      demo: true,
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
      { ok: false, error: "Restock alert is not available." },
      { status: 503 },
    );
  }

  const existing = existingProfile as CustomerProfileLookupRow | null;
  const name =
    normalizeRestockAlertText(parsed.data.name) ||
    normalizeRestockAlertText(existing?.name);
  const { data: profile, error } = await db
    .from("customer_profiles")
    .upsert(
      {
        store_id: storefront.store.id,
        email,
        name: name || null,
        note: createRestockAlertNote({
          existingNote: existing?.note,
          product,
          variant,
        }),
        tags: mergeRestockAlertTags(existing?.tags || []),
        accepts_marketing: true,
        tax_exempt: Boolean(existing?.tax_exempt),
      },
      { onConflict: "store_id,email" },
    )
    .select("id")
    .single();

  if (error) {
    return Response.json(
      { ok: false, error: "Restock alert could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    alertId: (profile as { id: string }).id,
  });
}
