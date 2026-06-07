import { randomBytes } from "node:crypto";
import { z } from "zod";

import { captureAbandonedCheckoutLines } from "@/features/commerce/abandoned-checkouts";
import {
  getLivePublicStorefront,
  getPublicStorefront,
} from "@/features/commerce/data";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const abandonedCheckoutIpRateLimit = {
  limit: 90,
  windowMs: 60 * 1000,
};
const abandonedCheckoutEmailRateLimit = {
  limit: 24,
  windowMs: 60 * 1000,
};

const abandonedCheckoutLineSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).max(99),
});

const abandonedCheckoutCaptureSchema = z.object({
  customerEmail: z.string().trim().email(),
  customerName: z.string().trim().max(80).optional(),
  recoveryToken: z.string().trim().min(16).max(96).optional(),
  cart: z.array(abandonedCheckoutLineSchema).min(1).max(50),
});

function createRecoveryToken() {
  return randomBytes(24).toString("hex");
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Checkout recovery capture rate limit exceeded." },
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
    `abandoned-checkout:capture:${slug}:${getClientFingerprint(request)}`,
    abandonedCheckoutIpRateLimit,
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

  const parsed = abandonedCheckoutCaptureSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the checkout recovery details." },
      { status: 400 },
    );
  }

  const emailRateLimit = consumeRateLimit(
    `abandoned-checkout:email:${slug}:${parsed.data.customerEmail.trim().toLowerCase()}`,
    abandonedCheckoutEmailRateLimit,
  );

  if (!emailRateLimit.ok) {
    return rateLimitedResponse(emailRateLimit.retryAfterSeconds);
  }

  if (!isSupabaseConfigured()) {
    const storefront = await getPublicStorefront(slug);

    if (!storefront) {
      return Response.json(
        { ok: false, error: "Storefront is not available." },
        { status: 404 },
      );
    }

    const captured = captureAbandonedCheckoutLines({
      cart: parsed.data.cart,
      products: storefront.products,
    });

    if (captured.error || captured.lines.length === 0) {
      return Response.json(
        { ok: false, error: captured.error || "Cart is empty." },
        { status: 400 },
      );
    }

    const summary = captured.lines.reduce(
      (subtotalCents, item) =>
        subtotalCents + item.line.unitPriceCents * item.line.quantity,
      0,
    );

    if (summary <= 0) {
      return Response.json(
        { ok: false, error: "Cart needs at least one priced item." },
        { status: 400 },
      );
    }

    return Response.json({
      ok: true,
      demo: true,
      recoveryToken: parsed.data.recoveryToken || createRecoveryToken(),
    });
  }

  const storefront = await getLivePublicStorefront(slug);

  if (!storefront) {
    return Response.json(
      { ok: false, error: "Storefront is not available." },
      { status: 404 },
    );
  }

  const captured = captureAbandonedCheckoutLines({
    cart: parsed.data.cart,
    products: storefront.products,
  });

  if (captured.error || captured.lines.length === 0) {
    return Response.json(
      { ok: false, error: captured.error || "Cart is empty." },
      { status: 400 },
    );
  }

  const lines = captured.lines.map((item) => item.line);
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );

  if (subtotalCents <= 0) {
    return Response.json(
      { ok: false, error: "Cart needs at least one priced item." },
      { status: 400 },
    );
  }

  const db = getSupabaseAdmin();
  const requestedToken = parsed.data.recoveryToken?.trim();
  let recoveryToken = requestedToken || createRecoveryToken();
  let existingCheckoutId: string | null = null;

  if (requestedToken) {
    const { data: existingCheckout, error } = await db
      .from("abandoned_checkouts")
      .select("id, status")
      .eq("store_id", storefront.store.id)
      .eq("recovery_token", requestedToken)
      .maybeSingle();

    if (error) {
      return Response.json(
        { ok: false, error: "Checkout recovery storage is not ready." },
        { status: 503 },
      );
    }

    if (
      existingCheckout &&
      (existingCheckout as { status?: string }).status === "open"
    ) {
      existingCheckoutId = (existingCheckout as { id: string }).id;
    } else if (existingCheckout) {
      recoveryToken = createRecoveryToken();
    }
  }

  const now = new Date().toISOString();
  const payload = {
    customer_email: parsed.data.customerEmail.trim().toLowerCase(),
    customer_name: parsed.data.customerName?.trim() || null,
    recovery_token: recoveryToken,
    status: "open",
    cart: lines,
    subtotal_cents: subtotalCents,
    currency: storefront.store.currency,
    last_seen_at: now,
  };
  const result = existingCheckoutId
    ? await db
        .from("abandoned_checkouts")
        .update(payload)
        .eq("id", existingCheckoutId)
        .eq("store_id", storefront.store.id)
    : await db.from("abandoned_checkouts").insert({
        ...payload,
        store_id: storefront.store.id,
      });

  if (result.error) {
    return Response.json(
      { ok: false, error: "Checkout recovery could not be saved." },
      { status: 500 },
    );
  }

  return Response.json({
    ok: true,
    recoveryToken,
  });
}
