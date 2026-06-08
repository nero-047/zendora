import type { DiscountType, ShippingZone } from "@/features/commerce/types";

export type CheckoutLineInput = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

export function normalizeShippingCountry(value: string) {
  return value.trim().toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ");
}

export function parseShippingCountries(value: string) {
  const countries = value
    .split(/[\n,]+/)
    .map((country) => country.trim())
    .filter(Boolean);

  return [...new Set(countries)];
}

export function getMatchingShippingZone(zones: ShippingZone[], country: string) {
  const normalizedCountry = normalizeShippingCountry(country);

  if (!normalizedCountry) {
    return undefined;
  }

  return zones.find(
    (zone) =>
      zone.status === "active" &&
      zone.countries.some(
        (zoneCountry) =>
          normalizeShippingCountry(zoneCountry) === normalizedCountry,
      ),
  );
}

export function calculateDiscountCents(
  discount: {
    type: DiscountType;
    value: number;
  },
  subtotalCents: number,
) {
  if (discount.type === "percent") {
    return Math.min(
      subtotalCents,
      Math.floor((subtotalCents * discount.value) / 100),
    );
  }

  return Math.min(subtotalCents, discount.value);
}

export function calculateShippingQuote(input: {
  discountedSubtotalCents: number;
  freeShippingThresholdCents: number;
  shippingCountry: string;
  shippingRateCents: number;
  shippingZones: ShippingZone[];
}) {
  const zone = getMatchingShippingZone(input.shippingZones, input.shippingCountry);
  const freeShippingThresholdCents =
    zone?.freeShippingThresholdCents ?? input.freeShippingThresholdCents;
  const shippingRateCents = zone?.rateCents ?? input.shippingRateCents;

  if (input.discountedSubtotalCents <= 0) {
    return {
      shippingCents: 0,
      zone,
    };
  }

  if (
    freeShippingThresholdCents > 0 &&
    input.discountedSubtotalCents >= freeShippingThresholdCents
  ) {
    return {
      shippingCents: 0,
      zone,
    };
  }

  return {
    shippingCents: shippingRateCents,
    zone,
  };
}

export function calculateTaxCents(
  discountedSubtotalCents: number,
  taxRateBps: number,
  taxExempt = false,
) {
  if (taxExempt || discountedSubtotalCents <= 0 || taxRateBps <= 0) {
    return 0;
  }

  return Math.round((discountedSubtotalCents * taxRateBps) / 10000);
}

export function calculateCheckoutTotals(input: {
  discountCents?: number;
  freeShippingThresholdCents: number;
  giftCardCents?: number;
  shippingCountry: string;
  shippingRateCents: number;
  shippingZones: ShippingZone[];
  subtotalCents: number;
  taxExempt?: boolean;
  taxRateBps: number;
}) {
  const subtotalCents = Math.max(0, input.subtotalCents);
  const discountCents = Math.min(
    subtotalCents,
    Math.max(0, input.discountCents || 0),
  );
  const discountedSubtotalCents = subtotalCents - discountCents;
  const shippingQuote = calculateShippingQuote({
    discountedSubtotalCents,
    freeShippingThresholdCents: input.freeShippingThresholdCents,
    shippingCountry: input.shippingCountry,
    shippingRateCents: Math.max(0, input.shippingRateCents),
    shippingZones: input.shippingZones,
  });
  const shippingCents = Math.max(0, shippingQuote.shippingCents);
  const taxCents = calculateTaxCents(
    discountedSubtotalCents,
    Math.max(0, input.taxRateBps),
    Boolean(input.taxExempt),
  );
  const totalCents = discountedSubtotalCents + shippingCents + taxCents;
  const giftCardCents = Math.min(
    totalCents,
    Math.max(0, input.giftCardCents || 0),
  );

  return {
    subtotalCents,
    discountCents,
    discountedSubtotalCents,
    shippingCents,
    shippingZone: shippingQuote.zone,
    taxCents,
    totalCents,
    giftCardCents,
    amountDueCents: totalCents - giftCardCents,
  };
}

export function normalizeCartLines(lines: CheckoutLineInput[]) {
  const quantitiesByLine = new Map<
    string,
    { productId: string; variantId?: string; quantity: number }
  >();

  for (const line of lines) {
    const variantId = line.variantId?.trim() || undefined;
    const key = `${line.productId}:${variantId || ""}`;
    const existing = quantitiesByLine.get(key);

    quantitiesByLine.set(key, {
      productId: line.productId,
      variantId,
      quantity: (existing?.quantity || 0) + line.quantity,
    });
  }

  return [...quantitiesByLine.values()];
}

export function normalizeCheckoutSessionId(value: string | undefined | null) {
  const sessionId = value?.trim() || "";

  if (!/^[a-zA-Z0-9_-]{16,96}$/.test(sessionId)) {
    return null;
  }

  return sessionId;
}
