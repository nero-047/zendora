export type CartPermalinkLine = {
  productId: string;
  variantId?: string;
  quantity: number;
};

const MAX_CART_PERMALINK_BYTES = 4096;
const MAX_CART_PERMALINK_LINES = 50;

function readFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeCartPermalinkLines(lines: unknown): CartPermalinkLine[] {
  if (!Array.isArray(lines)) {
    return [];
  }

  const quantitiesByLine = new Map<string, CartPermalinkLine>();

  for (const line of lines.slice(0, MAX_CART_PERMALINK_LINES)) {
    if (
      typeof line !== "object" ||
      !line ||
      !("productId" in line) ||
      !("quantity" in line)
    ) {
      continue;
    }

    const productId = String(line.productId || "").trim();
    const variantId =
      "variantId" in line && line.variantId
        ? String(line.variantId).trim()
        : undefined;
    const quantity = Number(line.quantity);

    if (!productId || !Number.isInteger(quantity) || quantity <= 0) {
      continue;
    }

    const key = `${productId}:${variantId || ""}`;
    const existing = quantitiesByLine.get(key);

    quantitiesByLine.set(key, {
      productId,
      variantId,
      quantity: Math.min((existing?.quantity || 0) + quantity, 99),
    });
  }

  return [...quantitiesByLine.values()];
}

export function parseCartPermalinkLines(
  value: string | string[] | undefined,
): CartPermalinkLine[] {
  const rawValue = readFirstParam(value)?.trim();

  if (!rawValue || rawValue.length > MAX_CART_PERMALINK_BYTES) {
    return [];
  }

  try {
    return normalizeCartPermalinkLines(JSON.parse(rawValue));
  } catch {
    return [];
  }
}

export function serializeCartPermalinkLines(lines: CartPermalinkLine[]) {
  const normalizedLines = normalizeCartPermalinkLines(lines);

  return normalizedLines.length > 0 ? JSON.stringify(normalizedLines) : "";
}

export function getCheckoutPermalink(storeSlug: string, lines: CartPermalinkLine[]) {
  const cartPayload = serializeCartPermalinkLines(lines);
  const checkoutHref = `/stores/${storeSlug}/checkout`;

  return cartPayload
    ? `${checkoutHref}?cart=${encodeURIComponent(cartPayload)}`
    : checkoutHref;
}
