import { getStorefrontProductInventory } from "@/features/commerce/storefront-search";
import type { Product } from "@/features/commerce/types";

export type ProductCompareMetric = {
  id: string;
  label: string;
  values: Record<string, string>;
};

export function parseCompareProductKeys(
  value: string | string[] | undefined,
  limit = 4,
) {
  const rawValue = Array.isArray(value) ? value.join(",") : value || "";

  return [
    ...new Set(
      rawValue
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

export function getCompareProducts({
  fallbackLimit = 3,
  keys,
  products,
}: {
  fallbackLimit?: number;
  keys: string[];
  products: Product[];
}) {
  const activeProducts = products.filter((product) => product.status === "active");

  if (keys.length === 0) {
    return activeProducts.slice(0, fallbackLimit);
  }

  const productsByKey = new Map<string, Product>();

  for (const product of activeProducts) {
    productsByKey.set(product.id.toLowerCase(), product);
    productsByKey.set(product.slug.toLowerCase(), product);
  }

  const selectedProducts = keys
    .map((key) => productsByKey.get(key))
    .filter((product): product is Product => Boolean(product));
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const fallbackProducts = activeProducts.filter(
    (product) => !selectedIds.has(product.id),
  );

  return [...selectedProducts, ...fallbackProducts].slice(0, fallbackLimit);
}

export function getProductCompareMetrics(products: Product[]) {
  const metrics: ProductCompareMetric[] = [
    {
      id: "category",
      label: "Category",
      values: {},
    },
    {
      id: "price",
      label: "Price",
      values: {},
    },
    {
      id: "inventory",
      label: "Available stock",
      values: {},
    },
    {
      id: "variants",
      label: "Options",
      values: {},
    },
    {
      id: "sku",
      label: "SKU",
      values: {},
    },
  ];

  for (const product of products) {
    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );
    const optionNames = [
      ...new Set(activeVariants.map((variant) => variant.optionName)),
    ];

    metrics[0].values[product.id] = product.category || "Uncategorized";
    metrics[1].values[product.id] = String(product.priceCents);
    metrics[2].values[product.id] = String(getStorefrontProductInventory(product));
    metrics[3].values[product.id] =
      optionNames.length > 0 ? optionNames.join(", ") : "Single option";
    metrics[4].values[product.id] = product.sku || "Not set";
  }

  return metrics;
}
