import type { Product } from "@/features/commerce/types";
import {
  parseStorefrontFilterPriceCents,
  type StorefrontCatalogFilters,
} from "@/features/commerce/catalog-filters";

export function getStorefrontProductCategories(products: Product[]) {
  return [
    ...new Set(
      products
        .map((product) => product.category)
        .filter((category): category is string => Boolean(category)),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function getStorefrontProductInventory(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );

  return activeVariants.length > 0
    ? activeVariants.reduce((sum, variant) => sum + variant.inventoryCount, 0)
    : product.inventoryCount;
}

export function isStorefrontProductOnSale(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );

  if (activeVariants.length > 0) {
    return activeVariants.some(
      (variant) =>
        typeof variant.compareAtCents === "number" &&
        variant.compareAtCents > variant.priceCents,
    );
  }

  return (
    typeof product.compareAtCents === "number" &&
    product.compareAtCents > product.priceCents
  );
}

function getStorefrontProductSearchText(product: Product) {
  return [
    product.name,
    product.description,
    product.category,
    product.sku,
    ...product.variants.map((variant) => variant.sku),
    ...product.variants.map((variant) => variant.optionValue),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterStorefrontProducts(input: {
  filters: StorefrontCatalogFilters;
  products: Product[];
}) {
  const normalizedQuery = input.filters.query.trim().toLowerCase();
  const minPriceCents = input.filters.minPrice
    ? parseStorefrontFilterPriceCents(input.filters.minPrice)
    : null;
  const maxPriceCents = input.filters.maxPrice
    ? parseStorefrontFilterPriceCents(input.filters.maxPrice)
    : null;

  const filtered = input.products.filter((product) => {
    const inventory = getStorefrontProductInventory(product);
    const matchesCategory =
      input.filters.category === "all" ||
      product.category === input.filters.category;
    const matchesAvailability =
      input.filters.availability === "all" ||
      (input.filters.availability === "available" && inventory > 0) ||
      (input.filters.availability === "sold-out" && inventory === 0);
    const matchesPrice =
      (minPriceCents === null || product.priceCents >= minPriceCents) &&
      (maxPriceCents === null || product.priceCents <= maxPriceCents);
    const matchesSale =
      !input.filters.saleOnly || isStorefrontProductOnSale(product);

    return (
      matchesCategory &&
      matchesAvailability &&
      matchesPrice &&
      matchesSale &&
      getStorefrontProductSearchText(product).includes(normalizedQuery)
    );
  });

  return [...filtered].sort((a, b) => {
    if (input.filters.sort === "price-asc") {
      return a.priceCents - b.priceCents || a.name.localeCompare(b.name);
    }

    if (input.filters.sort === "price-desc") {
      return b.priceCents - a.priceCents || a.name.localeCompare(b.name);
    }

    if (input.filters.sort === "name-asc") {
      return a.name.localeCompare(b.name);
    }

    if (input.filters.sort === "newest") {
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
        a.name.localeCompare(b.name)
      );
    }

    return 0;
  });
}
