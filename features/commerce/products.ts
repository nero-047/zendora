import {
  defaultProductLowStockThreshold,
  getProductHealth,
  getProductSellableInventoryCount,
  type ProductHealthStatus,
  productHealthStatusLabels,
} from "@/features/commerce/product-health";
import {
  type InventoryPlanningSignal,
  type InventoryReorderUrgency,
  inventoryReorderUrgencyLabels,
} from "@/features/commerce/inventory-planning";
import type { Product, ProductStatus } from "@/features/commerce/types";

export const productStatusFilters = [
  "all",
  "draft",
  "active",
  "archived",
] as const;

export type ProductStatusFilter = (typeof productStatusFilters)[number];

export const productHealthFilters = [
  "all",
  "ready",
  "needs_attention",
  "not_listed",
] as const;

export type ProductHealthFilter = (typeof productHealthFilters)[number];

export const productInventoryUrgencyFilters = [
  "all",
  "out_of_stock",
  "reorder_now",
  "watch",
  "healthy",
  "not_tracked",
] as const;

export type ProductInventoryUrgencyFilter =
  (typeof productInventoryUrgencyFilters)[number];

export const productSortOptions = [
  "reorder_priority",
  "health_priority",
  "inventory_asc",
  "value_desc",
  "price_desc",
  "name_asc",
  "created_desc",
] as const;

export type ProductSortOption = (typeof productSortOptions)[number];

export const lowStockThreshold = defaultProductLowStockThreshold;

export const productStatusLabels: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
};

export const productHealthFilterLabels: Record<ProductHealthFilter, string> = {
  all: "All health",
  ready: productHealthStatusLabels.ready,
  needs_attention: productHealthStatusLabels.needs_attention,
  not_listed: productHealthStatusLabels.not_listed,
};

export const productInventoryUrgencyFilterLabels: Record<
  ProductInventoryUrgencyFilter,
  string
> = {
  all: "All inventory",
  out_of_stock: inventoryReorderUrgencyLabels.out_of_stock,
  reorder_now: inventoryReorderUrgencyLabels.reorder_now,
  watch: inventoryReorderUrgencyLabels.watch,
  healthy: inventoryReorderUrgencyLabels.healthy,
  not_tracked: inventoryReorderUrgencyLabels.not_tracked,
};

export const productSortLabels: Record<ProductSortOption, string> = {
  reorder_priority: "Reorder priority",
  health_priority: "Health priority",
  inventory_asc: "Lowest stock",
  value_desc: "Highest value",
  price_desc: "Highest price",
  name_asc: "Name A-Z",
  created_desc: "Newest first",
};

const productHealthRank: Record<ProductHealthStatus, number> = {
  needs_attention: 0,
  not_listed: 1,
  ready: 2,
};

const inventoryUrgencyRank: Record<InventoryReorderUrgency, number> = {
  out_of_stock: 0,
  reorder_now: 1,
  watch: 2,
  healthy: 3,
  not_tracked: 4,
};

export function getProductEditHref(
  storeId: string,
  productId: string,
) {
  return `/dashboard/stores/${storeId}/products/${productId}/edit`;
}

export function parseProductStatusFilter(value: string | string[] | undefined) {
  const status = Array.isArray(value) ? value[0] : value;

  if (productStatusFilters.includes(status as ProductStatusFilter)) {
    return status as ProductStatusFilter;
  }

  return "all";
}

export function parseProductHealthFilter(value: string | string[] | undefined) {
  const health = Array.isArray(value) ? value[0] : value;

  if (productHealthFilters.includes(health as ProductHealthFilter)) {
    return health as ProductHealthFilter;
  }

  return "all";
}

export function parseProductInventoryUrgencyFilter(
  value: string | string[] | undefined,
) {
  const inventory = Array.isArray(value) ? value[0] : value;

  if (
    productInventoryUrgencyFilters.includes(
      inventory as ProductInventoryUrgencyFilter,
    )
  ) {
    return inventory as ProductInventoryUrgencyFilter;
  }

  return "all";
}

export function parseProductSortOption(value: string | string[] | undefined) {
  const sort = Array.isArray(value) ? value[0] : value;

  if (productSortOptions.includes(sort as ProductSortOption)) {
    return sort as ProductSortOption;
  }

  return "reorder_priority";
}

export function readProductSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function getProductCategories(products: Product[]) {
  return [
    ...new Set(
      products
        .map((product) => product.category)
        .filter((category): category is string => Boolean(category)),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function getProductStats(products: Product[]) {
  const activeProducts = products.filter((product) => product.status === "active");
  const healthByProduct = products.map((product) => ({
    product,
    health: getProductHealth(product),
  }));
  const lowStockProducts = healthByProduct.filter(({ health }) =>
    health.issues.some((issue) => issue.id === "low_stock"),
  );
  const outOfStockProducts = healthByProduct.filter(({ health }) =>
    health.issues.some((issue) => issue.id === "out_of_stock"),
  );
  const inventoryValueCents = products.reduce((sum, product) => {
    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );

    if (activeVariants.length === 0) {
      return sum + product.priceCents * product.inventoryCount;
    }

    return (
      sum +
      activeVariants.reduce(
        (variantSum, variant) =>
          variantSum + variant.priceCents * variant.inventoryCount,
        0,
      )
    );
  }, 0);

  return {
    totalProducts: products.length,
    activeProducts: activeProducts.length,
    readyProducts: healthByProduct.filter(
      ({ health }) => health.status === "ready",
    ).length,
    needsAttentionProducts: healthByProduct.filter(
      ({ health }) => health.status === "needs_attention",
    ).length,
    draftProducts: products.filter((product) => product.status === "draft")
      .length,
    archivedProducts: products.filter((product) => product.status === "archived")
      .length,
    lowStockProducts: lowStockProducts.length,
    outOfStockProducts: outOfStockProducts.length,
    totalInventory: products.reduce(
      (sum, product) => sum + product.inventoryCount,
      0,
    ),
    sellableInventory: products.reduce(
      (sum, product) => sum + getProductSellableInventoryCount(product),
      0,
    ),
    inventoryValueCents,
  };
}

function getProductInventoryValueCents(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );

  if (activeVariants.length === 0) {
    return product.priceCents * product.inventoryCount;
  }

  return activeVariants.reduce(
    (sum, variant) => sum + variant.priceCents * variant.inventoryCount,
    0,
  );
}

function getProductSearchText(product: Product) {
  const health = getProductHealth(product);

  return [
    product.name,
    product.slug,
    product.sku,
    product.category,
    product.description,
    product.status,
    health.label,
    productHealthStatusLabels[health.status],
    ...health.issues.flatMap((issue) => [issue.label, issue.detail]),
    ...product.variants.flatMap((variant) => [
      variant.optionName,
      variant.optionValue,
      variant.sku,
      variant.status,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterProducts(input: {
  products: Product[];
  query: string;
  status: ProductStatusFilter;
  category: string;
  health?: ProductHealthFilter;
  inventory?: ProductInventoryUrgencyFilter;
  sort?: ProductSortOption;
  inventorySignalsByProduct?: Map<string, InventoryPlanningSignal>;
}) {
  const normalizedQuery = input.query.trim().toLowerCase();
  const normalizedCategory = input.category.trim().toLowerCase();
  const selectedHealth = input.health || "all";
  const selectedInventory = input.inventory || "all";
  const selectedSort = input.sort || "reorder_priority";
  const getInventorySignal = (product: Product) =>
    input.inventorySignalsByProduct?.get(product.id);

  return input.products
    .filter((product) => {
      const health = getProductHealth(product);
      const inventorySignal = getInventorySignal(product);
      const urgency = inventorySignal?.urgency || "not_tracked";
      const statusMatches =
        input.status === "all" || product.status === (input.status as ProductStatus);
      const categoryMatches =
        !normalizedCategory ||
        (product.category || "").toLowerCase() === normalizedCategory;
      const healthMatches =
        selectedHealth === "all" || health.status === selectedHealth;
      const inventoryMatches =
        selectedInventory === "all" || urgency === selectedInventory;
      const queryMatches =
        !normalizedQuery || getProductSearchText(product).includes(normalizedQuery);

      return (
        statusMatches &&
        categoryMatches &&
        healthMatches &&
        inventoryMatches &&
        queryMatches
      );
    })
    .sort((a, b) => {
      const aHealth = getProductHealth(a);
      const bHealth = getProductHealth(b);
      const aSignal = getInventorySignal(a);
      const bSignal = getInventorySignal(b);
      const aUrgency = aSignal?.urgency || "not_tracked";
      const bUrgency = bSignal?.urgency || "not_tracked";

      if (selectedSort === "name_asc") {
        return a.name.localeCompare(b.name);
      }

      if (selectedSort === "price_desc") {
        return b.priceCents - a.priceCents || a.name.localeCompare(b.name);
      }

      if (selectedSort === "value_desc") {
        return (
          getProductInventoryValueCents(b) - getProductInventoryValueCents(a) ||
          a.name.localeCompare(b.name)
        );
      }

      if (selectedSort === "inventory_asc") {
        return (
          aHealth.sellableInventoryCount - bHealth.sellableInventoryCount ||
          a.name.localeCompare(b.name)
        );
      }

      if (selectedSort === "health_priority") {
        return (
          productHealthRank[aHealth.status] - productHealthRank[bHealth.status] ||
          bHealth.issues.length - aHealth.issues.length ||
          a.name.localeCompare(b.name)
        );
      }

      if (selectedSort === "created_desc") {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          a.name.localeCompare(b.name)
        );
      }

      return (
        inventoryUrgencyRank[aUrgency] - inventoryUrgencyRank[bUrgency] ||
        (aSignal?.estimatedDaysUntilStockout ?? Number.POSITIVE_INFINITY) -
          (bSignal?.estimatedDaysUntilStockout ?? Number.POSITIVE_INFINITY) ||
        b.priceCents - a.priceCents ||
        a.name.localeCompare(b.name)
      );
    });
}
