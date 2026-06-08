import { z } from "zod";

import {
  calculateCheckoutTotals,
  calculateDiscountCents,
  normalizeCartLines,
} from "@/features/commerce/business-rules";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  calculateGiftCardRedemptionAmount,
  canRedeemGiftCard,
  normalizeGiftCardCode,
} from "@/features/commerce/gift-cards";
import {
  mockCustomerProfiles,
  mockDiscounts,
  mockGiftCards,
} from "@/features/commerce/mock-data";
import type { Discount, GiftCard, Product } from "@/features/commerce/types";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprint,
  readLimitedJsonBody,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const checkoutPreviewRateLimit = {
  limit: 90,
  windowMs: 60 * 1000,
};

const checkoutPreviewLineSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(1).max(99),
});

const checkoutPreviewSchema = z.object({
  cart: z.array(checkoutPreviewLineSchema).min(1).max(50),
  customerEmail: z.string().trim().email().max(120).optional(),
  discountCode: z.string().trim().max(32).optional(),
  giftCardCode: z.string().trim().max(40).optional(),
  shippingCountry: z.string().trim().min(2).max(80),
});

type DiscountRow = {
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_subtotal_cents: number;
  usage_limit: number | null;
  redemption_count: number;
  status: Discount["status"];
  starts_at: string | null;
  ends_at: string | null;
};

type GiftCardRow = {
  code: string;
  balance_cents: number;
  currency: string;
  status: GiftCard["status"];
  expires_at: string | null;
};

function normalizeDiscountCode(value: string | undefined) {
  return value?.trim().toUpperCase() || null;
}

function normalizeCustomerEmail(value: string | undefined) {
  return value?.trim().toLowerCase() || null;
}

function getCartSubtotal(input: {
  cart: z.infer<typeof checkoutPreviewSchema>["cart"];
  products: Product[];
}) {
  const productsById = new Map(
    input.products.map((product) => [product.id, product]),
  );
  let subtotalCents = 0;

  for (const line of normalizeCartLines(input.cart)) {
    const product = productsById.get(line.productId);

    if (!product) {
      return { error: "One or more cart items are unavailable.", subtotalCents: 0 };
    }

    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );
    const variant = line.variantId
      ? activeVariants.find((item) => item.id === line.variantId)
      : undefined;

    if (activeVariants.length > 0 && !variant) {
      return {
        error: `Choose an available variant for ${product.name}.`,
        subtotalCents: 0,
      };
    }

    if (line.variantId && activeVariants.length === 0) {
      return {
        error: "One or more cart variants are unavailable.",
        subtotalCents: 0,
      };
    }

    const inventoryCount = variant?.inventoryCount ?? product.inventoryCount;

    if (inventoryCount < line.quantity) {
      const stockLabel = variant
        ? `${product.name} ${variant.optionValue}`
        : product.name;

      return {
        error: `${stockLabel} only has ${inventoryCount} in stock.`,
        subtotalCents: 0,
      };
    }

    subtotalCents += (variant?.priceCents ?? product.priceCents) * line.quantity;
  }

  if (subtotalCents <= 0) {
    return { error: "Cart needs at least one priced item.", subtotalCents: 0 };
  }

  return { error: null, subtotalCents };
}

function validateDiscount(input: {
  code: string | null;
  discount: Discount | null;
  subtotalCents: number;
}) {
  if (!input.code) {
    return { cents: 0, code: null, error: null };
  }

  if (!input.discount) {
    return { cents: 0, code: null, error: "Discount code was not found." };
  }

  const now = Date.now();

  if (input.discount.status !== "active") {
    return { cents: 0, code: null, error: "Discount code is not active." };
  }

  if (
    input.discount.startsAt &&
    new Date(input.discount.startsAt).getTime() > now
  ) {
    return { cents: 0, code: null, error: "Discount code is not active yet." };
  }

  if (
    input.discount.endsAt &&
    new Date(input.discount.endsAt).getTime() < now
  ) {
    return { cents: 0, code: null, error: "Discount code has expired." };
  }

  if (
    input.discount.usageLimit &&
    input.discount.redemptionCount >= input.discount.usageLimit
  ) {
    return {
      cents: 0,
      code: null,
      error: "Discount code has reached its usage limit.",
    };
  }

  if (input.subtotalCents < input.discount.minSubtotalCents) {
    return {
      cents: 0,
      code: null,
      error: "Order subtotal does not meet this discount minimum.",
    };
  }

  return {
    cents: calculateDiscountCents(input.discount, input.subtotalCents),
    code: input.discount.code,
    error: null,
  };
}

function validateGiftCard(input: {
  code: string | null;
  currency: string;
  giftCard: GiftCard | null;
  orderTotalCents: number;
}) {
  if (!input.code) {
    return { cents: 0, code: null, error: null };
  }

  if (!input.giftCard) {
    return { cents: 0, code: null, error: "Gift card was not found." };
  }

  if (input.giftCard.currency !== input.currency) {
    return {
      cents: 0,
      code: null,
      error: "Gift card currency does not match this store.",
    };
  }

  if (!canRedeemGiftCard(input.giftCard)) {
    return { cents: 0, code: null, error: "Gift card is not redeemable." };
  }

  return {
    cents: calculateGiftCardRedemptionAmount({
      balanceCents: input.giftCard.balanceCents,
      orderTotalCents: input.orderTotalCents,
    }),
    code: input.giftCard.code,
    error: null,
  };
}

async function findLiveDiscount(input: {
  code: string | null;
  storeId: string;
}) {
  if (!input.code) {
    return null;
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("discount_codes")
    .select(
      "code, type, value, min_subtotal_cents, usage_limit, redemption_count, status, starts_at, ends_at",
    )
    .eq("store_id", input.storeId)
    .eq("code", input.code)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as DiscountRow;

  return {
    code: row.code,
    createdAt: "",
    endsAt: row.ends_at || undefined,
    id: "",
    minSubtotalCents: row.min_subtotal_cents,
    redemptionCount: row.redemption_count,
    startsAt: row.starts_at || undefined,
    status: row.status,
    storeId: input.storeId,
    type: row.type,
    usageLimit: row.usage_limit || undefined,
    value: row.value,
  } satisfies Discount;
}

async function findLiveGiftCard(input: {
  code: string | null;
  storeId: string;
}) {
  if (!input.code) {
    return null;
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_cards")
    .select("code, balance_cents, currency, status, expires_at")
    .eq("store_id", input.storeId)
    .eq("code", input.code)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const row = data as GiftCardRow;

  return {
    balanceCents: row.balance_cents,
    code: row.code,
    createdAt: "",
    currency: row.currency,
    expiresAt: row.expires_at || undefined,
    id: "",
    initialBalanceCents: row.balance_cents,
    redemptions: [],
    status: row.status,
    storeId: input.storeId,
    updatedAt: "",
  } satisfies GiftCard;
}

async function findLiveCustomerTaxExempt(input: {
  customerEmail: string | null;
  storeId: string;
}) {
  if (!input.customerEmail) {
    return false;
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("customer_profiles")
    .select("tax_exempt")
    .eq("store_id", input.storeId)
    .eq("email", input.customerEmail)
    .maybeSingle();

  if (error) {
    console.warn("Checkout preview customer tax profile lookup failed", error);
    return false;
  }

  return Boolean((data as { tax_exempt: boolean | null } | null)?.tax_exempt);
}

function findDemoDiscount(input: { code: string | null; storeId: string }) {
  return input.code
    ? mockDiscounts.find(
        (discount) =>
          discount.storeId === input.storeId && discount.code === input.code,
      ) || null
    : null;
}

function findDemoGiftCard(input: { code: string | null; storeId: string }) {
  return input.code
    ? mockGiftCards.find(
        (giftCard) =>
          giftCard.storeId === input.storeId && giftCard.code === input.code,
      ) || null
    : null;
}

function findDemoCustomerTaxExempt(input: {
  customerEmail: string | null;
  storeId: string;
}) {
  if (!input.customerEmail) {
    return false;
  }

  return Boolean(
    mockCustomerProfiles.find(
      (profile) =>
        profile.storeId === input.storeId &&
        profile.email.trim().toLowerCase() === input.customerEmail,
    )?.taxExempt,
  );
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    { ok: false, error: "Checkout preview rate limit exceeded." },
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
    `checkout-preview:${slug}:${getClientFingerprint(request)}`,
    checkoutPreviewRateLimit,
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

  const parsed = checkoutPreviewSchema.safeParse(body.value);

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Check the checkout preview details." },
      { status: 400 },
    );
  }

  const storefront = await getPublicStorefront(slug);

  if (!storefront) {
    return Response.json(
      { ok: false, error: "Storefront is not available." },
      { status: 404 },
    );
  }

  const subtotal = getCartSubtotal({
    cart: parsed.data.cart,
    products: storefront.products,
  });

  if (subtotal.error) {
    return Response.json(
      { ok: false, error: subtotal.error },
      { status: 400 },
    );
  }

  const discountCode = normalizeDiscountCode(parsed.data.discountCode);
  const customerEmail = normalizeCustomerEmail(parsed.data.customerEmail);
  const giftCardCode = normalizeGiftCardCode(parsed.data.giftCardCode) || null;
  const isDemoStorefront = storefront.store.id.startsWith("demo-");
  let discount: Discount | null = null;
  let giftCard: GiftCard | null = null;
  let customerTaxExempt = false;

  try {
    if (isSupabaseConfigured() && !isDemoStorefront) {
      [discount, giftCard, customerTaxExempt] = await Promise.all([
        findLiveDiscount({ code: discountCode, storeId: storefront.store.id }),
        findLiveGiftCard({ code: giftCardCode, storeId: storefront.store.id }),
        findLiveCustomerTaxExempt({
          customerEmail,
          storeId: storefront.store.id,
        }),
      ]);
    } else {
      discount = findDemoDiscount({
        code: discountCode,
        storeId: storefront.store.id,
      });
      giftCard = findDemoGiftCard({
        code: giftCardCode,
        storeId: storefront.store.id,
      });
      customerTaxExempt = findDemoCustomerTaxExempt({
        customerEmail,
        storeId: storefront.store.id,
      });
    }
  } catch {
    return Response.json(
      { ok: false, error: "Checkout incentives are not available." },
      { status: 503 },
    );
  }

  const checkoutDiscount = validateDiscount({
    code: discountCode,
    discount,
    subtotalCents: subtotal.subtotalCents,
  });

  if (checkoutDiscount.error) {
    return Response.json(
      { ok: false, error: checkoutDiscount.error, field: "discountCode" },
      { status: 400 },
    );
  }

  const totalsBeforeGiftCard = calculateCheckoutTotals({
    discountCents: checkoutDiscount.cents,
    freeShippingThresholdCents: storefront.store.freeShippingThresholdCents,
    shippingCountry: parsed.data.shippingCountry,
    shippingRateCents: storefront.store.shippingRateCents,
    shippingZones: storefront.shippingZones,
    subtotalCents: subtotal.subtotalCents,
    taxExempt: customerTaxExempt,
    taxRateBps: storefront.store.taxRateBps,
  });
  const checkoutGiftCard = validateGiftCard({
    code: giftCardCode,
    currency: storefront.store.currency,
    giftCard,
    orderTotalCents: totalsBeforeGiftCard.totalCents,
  });

  if (checkoutGiftCard.error) {
    return Response.json(
      { ok: false, error: checkoutGiftCard.error, field: "giftCardCode" },
      { status: 400 },
    );
  }

  const totals = calculateCheckoutTotals({
    discountCents: checkoutDiscount.cents,
    freeShippingThresholdCents: storefront.store.freeShippingThresholdCents,
    giftCardCents: checkoutGiftCard.cents,
    shippingCountry: parsed.data.shippingCountry,
    shippingRateCents: storefront.store.shippingRateCents,
    shippingZones: storefront.shippingZones,
    subtotalCents: subtotal.subtotalCents,
    taxExempt: customerTaxExempt,
    taxRateBps: storefront.store.taxRateBps,
  });

  return Response.json({
    ok: true,
    discountCode: checkoutDiscount.code,
    giftCardCode: checkoutGiftCard.code,
    taxExempt: customerTaxExempt,
    totals,
  });
}
