import type { Product, ProductVariant } from "@/features/commerce/types";

export type ProductHealthStatus = "ready" | "needs_attention" | "not_listed";
export type ProductHealthIssueSeverity = "blocking" | "warning" | "info";

export type ProductHealthIssue = {
  id: string;
  label: string;
  severity: ProductHealthIssueSeverity;
  detail: string;
};

export type ProductHealth = {
  status: ProductHealthStatus;
  label: string;
  issues: ProductHealthIssue[];
  sellableInventoryCount: number;
  activeVariantCount: number;
  hasPurchasableStock: boolean;
  nextAction: string;
};

export const defaultProductLowStockThreshold = 12;

export const productHealthStatusLabels: Record<ProductHealthStatus, string> = {
  ready: "Ready to sell",
  needs_attention: "Needs attention",
  not_listed: "Not listed",
};

function getActiveVariants(product: Product) {
  return product.variants.filter((variant) => variant.status === "active");
}

function getVariantSellableInventory(variant: ProductVariant) {
  return variant.priceCents > 0 ? Math.max(0, variant.inventoryCount) : 0;
}

export function getProductSellableInventoryCount(product: Product) {
  const activeVariants = getActiveVariants(product);

  if (activeVariants.length > 0) {
    return activeVariants.reduce(
      (sum, variant) => sum + getVariantSellableInventory(variant),
      0,
    );
  }

  return product.priceCents > 0 ? Math.max(0, product.inventoryCount) : 0;
}

function getNextAction(issues: ProductHealthIssue[], status: ProductHealthStatus) {
  if (status === "not_listed") {
    return "Set the product active when it is ready for the storefront.";
  }

  const firstBlocking = issues.find((issue) => issue.severity === "blocking");
  const firstWarning = issues.find((issue) => issue.severity === "warning");

  return (
    firstBlocking?.detail ||
    firstWarning?.detail ||
    "Product is sellable and ready for customer traffic."
  );
}

export function getProductHealth(
  product: Product,
  options: {
    lowStockThreshold?: number;
  } = {},
): ProductHealth {
  const lowStockThreshold =
    options.lowStockThreshold ?? defaultProductLowStockThreshold;
  const activeVariants = getActiveVariants(product);
  const sellableInventoryCount = getProductSellableInventoryCount(product);
  const issues: ProductHealthIssue[] = [];

  if (product.status !== "active") {
    issues.push({
      id: "not_active",
      label: product.status === "archived" ? "Archived" : "Draft",
      severity: "info",
      detail: "Inactive products are hidden from the public storefront.",
    });
  }

  if (!product.slug.trim()) {
    issues.push({
      id: "missing_slug",
      label: "Missing URL slug",
      severity: "blocking",
      detail: "Add a storefront URL slug before publishing.",
    });
  }

  if (!product.imageUrl.trim()) {
    issues.push({
      id: "missing_image",
      label: "Missing image",
      severity: "blocking",
      detail: "Add a product image so customers can inspect the item.",
    });
  }

  if (product.description.trim().length < 20) {
    issues.push({
      id: "short_description",
      label: "Short description",
      severity: "warning",
      detail: "Add a clearer description for SEO and customer confidence.",
    });
  }

  if (!product.category?.trim()) {
    issues.push({
      id: "missing_category",
      label: "Missing category",
      severity: "warning",
      detail: "Add a category so the catalog is easier to manage and filter.",
    });
  }

  if (
    !product.sku?.trim() &&
    activeVariants.every((variant) => !variant.sku?.trim())
  ) {
    issues.push({
      id: "missing_sku",
      label: "Missing SKU",
      severity: "warning",
      detail: "Add a SKU for fulfillment, inventory, and support workflows.",
    });
  }

  if (activeVariants.length > 0) {
    const unpricedActiveVariants = activeVariants.filter(
      (variant) => variant.priceCents <= 0,
    );
    const outOfStockActiveVariants = activeVariants.filter(
      (variant) => variant.inventoryCount <= 0,
    );
    const pausedVariants = product.variants.filter(
      (variant) => variant.status !== "active",
    );

    if (unpricedActiveVariants.length > 0) {
      issues.push({
        id: "variant_missing_price",
        label: "Variant missing price",
        severity: "blocking",
        detail: "Every active variant needs a positive price before it can sell.",
      });
    }

    if (outOfStockActiveVariants.length > 0) {
      issues.push({
        id: "variant_out_of_stock",
        label: "Variant out of stock",
        severity: sellableInventoryCount > 0 ? "warning" : "blocking",
        detail: "Restock active variants so customers can buy each option.",
      });
    }

    if (pausedVariants.length > 0) {
      issues.push({
        id: "paused_variants",
        label: "Paused variants",
        severity: "info",
        detail: "Review paused variants before seasonal or replenishment launches.",
      });
    }
  } else if (product.priceCents <= 0) {
    issues.push({
      id: "missing_price",
      label: "Missing price",
      severity: "blocking",
      detail: "Add a positive price before this product can sell.",
    });
  }

  if (sellableInventoryCount <= 0) {
    issues.push({
      id: "out_of_stock",
      label: "Out of stock",
      severity: "blocking",
      detail: "Add inventory before this product can be purchased.",
    });
  } else if (sellableInventoryCount <= lowStockThreshold) {
    issues.push({
      id: "low_stock",
      label: "Low stock",
      severity: "warning",
      detail: `Restock soon; only ${sellableInventoryCount} sellable units remain.`,
    });
  }

  const status =
    product.status !== "active"
      ? "not_listed"
      : issues.length > 0
        ? "needs_attention"
        : "ready";

  return {
    status,
    label: productHealthStatusLabels[status],
    issues,
    sellableInventoryCount,
    activeVariantCount: activeVariants.length,
    hasPurchasableStock: sellableInventoryCount > 0,
    nextAction: getNextAction(issues, status),
  };
}
