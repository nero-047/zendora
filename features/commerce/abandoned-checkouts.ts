import type {
  AbandonedCheckout,
  AbandonedCheckoutLine,
  AbandonedCheckoutStatus,
  Product,
  ProductVariant,
} from "@/features/commerce/types";
import {
  type CheckoutLineInput,
  normalizeCartLines,
} from "@/features/commerce/business-rules";

export type CapturedAbandonedCheckoutLine = {
  product: Product;
  variant?: ProductVariant;
  line: AbandonedCheckoutLine;
};

export const abandonedCheckoutStatusLabels: Record<
  AbandonedCheckoutStatus,
  string
> = {
  open: "Open",
  recovered: "Recovered",
  dismissed: "Dismissed",
};

export function getAbandonedCheckoutRecoveryHref(input: {
  storeSlug: string;
  recoveryToken: string;
}) {
  return `/stores/${encodeURIComponent(input.storeSlug)}/checkout?recovery=${encodeURIComponent(input.recoveryToken)}`;
}

export function summarizeAbandonedCheckoutLines(
  lines: AbandonedCheckoutLine[],
) {
  return lines.reduce(
    (summary, line) => ({
      lineCount: summary.lineCount + 1,
      itemCount: summary.itemCount + line.quantity,
      subtotalCents:
        summary.subtotalCents + line.unitPriceCents * line.quantity,
    }),
    {
      lineCount: 0,
      itemCount: 0,
      subtotalCents: 0,
    },
  );
}

export function captureAbandonedCheckoutLines(input: {
  cart: CheckoutLineInput[];
  products: Product[];
}): { lines: CapturedAbandonedCheckoutLine[]; error?: string } {
  const productsById = new Map(
    input.products.map((product) => [product.id, product]),
  );
  const capturedLines: CapturedAbandonedCheckoutLine[] = [];

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

export function canQueueAbandonedCheckoutRecovery(
  checkout: Pick<
    AbandonedCheckout,
    "customerEmail" | "recoveryToken" | "status" | "lines"
  >,
) {
  return Boolean(
    checkout.status === "open" &&
      checkout.customerEmail.trim() &&
      checkout.recoveryToken.trim() &&
      checkout.lines.length > 0,
  );
}
