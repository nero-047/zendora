import type { Product, ProductStatus } from "@/features/commerce/types";

export const productStatusFilters = [
  "all",
  "draft",
  "active",
  "archived",
] as const;

export type ProductStatusFilter = (typeof productStatusFilters)[number];

export const lowStockThreshold = 12;

export const productStatusLabels: Record<ProductStatus, string> = {
  draft: "Draft",
  active: "Active",
  archived: "Archived",
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
  const lowStockProducts = products.filter(
    (product) => product.inventoryCount <= lowStockThreshold,
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
    draftProducts: products.filter((product) => product.status === "draft")
      .length,
    archivedProducts: products.filter((product) => product.status === "archived")
      .length,
    lowStockProducts: lowStockProducts.length,
    totalInventory: products.reduce(
      (sum, product) => sum + product.inventoryCount,
      0,
    ),
    inventoryValueCents,
  };
}

function getProductSearchText(product: Product) {
  return [
    product.name,
    product.slug,
    product.sku,
    product.category,
    product.description,
    product.status,
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
}) {
  const normalizedQuery = input.query.trim().toLowerCase();
  const normalizedCategory = input.category.trim().toLowerCase();

  return input.products.filter((product) => {
    const statusMatches =
      input.status === "all" || product.status === (input.status as ProductStatus);
    const categoryMatches =
      !normalizedCategory ||
      (product.category || "").toLowerCase() === normalizedCategory;
    const queryMatches =
      !normalizedQuery || getProductSearchText(product).includes(normalizedQuery);

    return statusMatches && categoryMatches && queryMatches;
  });
}
