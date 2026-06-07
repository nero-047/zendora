import { randomBytes } from "node:crypto";
import { z } from "zod";

import { normalizeCartLines } from "@/features/commerce/business-rules";
import { getLivePublicStorefront } from "@/features/commerce/data";
import type {
  AbandonedCheckoutLine,
  Product,
  ProductVariant,
} from "@/features/commerce/types";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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

type CapturedLine = {
  product: Product;
  variant?: ProductVariant;
  line: AbandonedCheckoutLine;
};

function createRecoveryToken() {
  return randomBytes(24).toString("hex");
}

function getCapturedLines(input: {
  cart: z.infer<typeof abandonedCheckoutLineSchema>[];
  products: Product[];
}): { lines: CapturedLine[]; error?: string } {
  const productsById = new Map(
    input.products.map((product) => [product.id, product]),
  );
  const capturedLines: CapturedLine[] = [];

  for (const cartLine of normalizeCartLines(input.cart)) {
    const product = productsById.get(cartLine.productId);

    if (!product) {
      return { lines: [], error: "One or more cart items are unavailable." };
    }

    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );
    const variant = cartLine.variantId
      ? activeVariants.find((item) => item.id === cartLine.variantId)
      : undefined;

    if (activeVariants.length > 0 && !variant) {
      return { lines: [], error: `Choose an available variant for ${product.name}.` };
    }

    if (cartLine.variantId && activeVariants.length === 0) {
      return { lines: [], error: "One or more cart variants are unavailable." };
    }

    const inventoryCount = variant?.inventoryCount ?? product.inventoryCount;

    if (inventoryCount <= 0) {
      return { lines: [], error: `${product.name} is out of stock.` };
    }

    const quantity = Math.min(cartLine.quantity, inventoryCount, 99);
    const unitPriceCents = variant?.priceCents ?? product.priceCents;

    capturedLines.push({
      product,
      variant,
      line: {
        productId: product.id,
        productVariantId: variant?.id,
        productName: product.name,
        variantName: variant
          ? `${variant.optionName}: ${variant.optionValue}`
          : undefined,
        unitPriceCents,
        quantity,
        imageUrl: product.imageUrl,
      },
    });
  }

  return { lines: capturedLines };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = abandonedCheckoutCaptureSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the checkout recovery details." },
      { status: 400 },
    );
  }

  if (!isSupabaseConfigured()) {
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

  const captured = getCapturedLines({
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
