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

export const abandonedCheckoutStatusFilters = [
  "all",
  "open",
  "recovered",
  "dismissed",
] as const;

export type AbandonedCheckoutStatusFilter =
  (typeof abandonedCheckoutStatusFilters)[number];

export const abandonedCheckoutSortOptions = [
  "recovery_priority",
  "last_seen_desc",
  "value_desc",
  "emails_asc",
  "customer_asc",
] as const;

export type AbandonedCheckoutSortOption =
  (typeof abandonedCheckoutSortOptions)[number];

export const abandonedCheckoutStatusFilterLabels: Record<
  AbandonedCheckoutStatusFilter,
  string
> = {
  all: "All statuses",
  open: abandonedCheckoutStatusLabels.open,
  recovered: abandonedCheckoutStatusLabels.recovered,
  dismissed: abandonedCheckoutStatusLabels.dismissed,
};

export const abandonedCheckoutSortLabels: Record<
  AbandonedCheckoutSortOption,
  string
> = {
  recovery_priority: "Recovery priority",
  last_seen_desc: "Latest activity",
  value_desc: "Highest value",
  emails_asc: "Fewest emails",
  customer_asc: "Customer A-Z",
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

function getSortTime(value?: string) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) ? time : 0;
}

function getCustomerLabel(checkout: AbandonedCheckout) {
  return checkout.customerName || checkout.customerEmail || "Guest customer";
}

function getAbandonedCheckoutSearchText(checkout: AbandonedCheckout) {
  const summary = summarizeAbandonedCheckoutLines(checkout.lines);

  return [
    checkout.id,
    checkout.customerEmail,
    checkout.customerName,
    checkout.recoveryToken,
    abandonedCheckoutStatusLabels[checkout.status],
    checkout.status,
    String(summary.itemCount),
    String(summary.lineCount),
    ...checkout.lines.flatMap((line) => [
      line.productId,
      line.productVariantId,
      line.productName,
      line.variantName,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function readAbandonedCheckoutSearchParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function parseAbandonedCheckoutStatusFilter(
  value: string | string[] | undefined,
) {
  const status = Array.isArray(value) ? value[0] : value;

  if (
    abandonedCheckoutStatusFilters.includes(
      status as AbandonedCheckoutStatusFilter,
    )
  ) {
    return status as AbandonedCheckoutStatusFilter;
  }

  return "all";
}

export function parseAbandonedCheckoutSortOption(
  value: string | string[] | undefined,
) {
  const sort = Array.isArray(value) ? value[0] : value;

  if (abandonedCheckoutSortOptions.includes(sort as AbandonedCheckoutSortOption)) {
    return sort as AbandonedCheckoutSortOption;
  }

  return "recovery_priority";
}

export function getAbandonedCheckoutStats(checkouts: AbandonedCheckout[]) {
  const recoverable = checkouts.filter((checkout) =>
    canQueueAbandonedCheckoutRecovery(checkout),
  );

  return {
    total: checkouts.length,
    open: checkouts.filter((checkout) => checkout.status === "open").length,
    recoverable: recoverable.length,
    recovered: checkouts.filter((checkout) => checkout.status === "recovered")
      .length,
    dismissed: checkouts.filter((checkout) => checkout.status === "dismissed")
      .length,
    recoverableValueCents: recoverable.reduce(
      (sum, checkout) => sum + checkout.subtotalCents,
      0,
    ),
    recoveredValueCents: checkouts
      .filter((checkout) => checkout.status === "recovered")
      .reduce((sum, checkout) => sum + checkout.subtotalCents, 0),
  };
}

export function filterAbandonedCheckouts(input: {
  checkouts: AbandonedCheckout[];
  query: string;
  status: AbandonedCheckoutStatusFilter;
  sort?: AbandonedCheckoutSortOption;
}) {
  const normalizedQuery = input.query.trim().toLowerCase();
  const selectedSort = input.sort || "recovery_priority";

  return input.checkouts
    .filter((checkout) => {
      const statusMatches =
        input.status === "all" || checkout.status === input.status;
      const queryMatches =
        !normalizedQuery ||
        getAbandonedCheckoutSearchText(checkout).includes(normalizedQuery);

      return statusMatches && queryMatches;
    })
    .sort((a, b) => {
      if (selectedSort === "value_desc") {
        return b.subtotalCents - a.subtotalCents || getCustomerLabel(a).localeCompare(getCustomerLabel(b));
      }

      if (selectedSort === "emails_asc") {
        return (
          a.recoveryEmailCount - b.recoveryEmailCount ||
          getSortTime(b.lastSeenAt) - getSortTime(a.lastSeenAt)
        );
      }

      if (selectedSort === "customer_asc") {
        return getCustomerLabel(a).localeCompare(getCustomerLabel(b));
      }

      if (selectedSort === "last_seen_desc") {
        return (
          getSortTime(b.lastSeenAt) - getSortTime(a.lastSeenAt) ||
          b.subtotalCents - a.subtotalCents
        );
      }

      const aRecoverable = canQueueAbandonedCheckoutRecovery(a) ? 0 : 1;
      const bRecoverable = canQueueAbandonedCheckoutRecovery(b) ? 0 : 1;

      return (
        aRecoverable - bRecoverable ||
        a.recoveryEmailCount - b.recoveryEmailCount ||
        b.subtotalCents - a.subtotalCents ||
        getSortTime(b.lastSeenAt) - getSortTime(a.lastSeenAt)
      );
    });
}
