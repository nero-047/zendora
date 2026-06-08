import type { Product } from "@/features/commerce/types";

export function getWishlistStorageKey(storeSlug: string) {
  return `zendora-wishlist:${storeSlug}`;
}

export function normalizeWishlistProductIds(
  value: unknown,
  products: Pick<Product, "id">[],
  limit = 50,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const productIds = new Set(products.map((product) => product.id));
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value) {
    const productId = String(item || "");

    if (!productIds.has(productId) || seen.has(productId)) {
      continue;
    }

    seen.add(productId);
    normalized.push(productId);

    if (normalized.length >= limit) {
      break;
    }
  }

  return normalized;
}
