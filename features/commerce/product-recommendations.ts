import type { Product, ProductCollection } from "@/features/commerce/types";

export type RelatedProduct = {
  product: Product;
  reason: string;
};

type RelatedProductsInput = {
  collections: ProductCollection[];
  limit?: number;
  product: Product;
  products: Product[];
};

function getProductInventory(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );
  const stockedVariant = activeVariants.find(
    (variant) => variant.inventoryCount > 0,
  );

  return stockedVariant?.inventoryCount ?? product.inventoryCount;
}

function getSharedCollections(
  product: Product,
  candidate: Product,
  collections: ProductCollection[],
) {
  return collections.filter(
    (collection) =>
      collection.status === "active" &&
      collection.productIds.includes(product.id) &&
      collection.productIds.includes(candidate.id),
  );
}

function getRecommendationReason({
  candidate,
  product,
  sharedCollections,
}: {
  candidate: Product;
  product: Product;
  sharedCollections: ProductCollection[];
}) {
  if (sharedCollections[0]) {
    return `Pairs from ${sharedCollections[0].title}`;
  }

  if (product.category && candidate.category === product.category) {
    return `More ${product.category}`;
  }

  return "Recommended add-on";
}

export function getRelatedProducts({
  collections,
  limit = 3,
  product,
  products,
}: RelatedProductsInput): RelatedProduct[] {
  return products
    .filter((candidate) => candidate.id !== product.id)
    .filter((candidate) => candidate.status === "active")
    .map((candidate) => {
      const sharedCollections = getSharedCollections(product, candidate, collections);
      const sameCategory =
        product.category && candidate.category === product.category ? 1 : 0;
      const inventoryScore = getProductInventory(candidate) > 0 ? 1 : 0;

      return {
        candidate,
        reason: getRecommendationReason({
          candidate,
          product,
          sharedCollections,
        }),
        score:
          sharedCollections.length * 100 +
          sameCategory * 40 +
          inventoryScore * 10,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.candidate.name.localeCompare(b.candidate.name);
    })
    .slice(0, limit)
    .map((item) => ({
      product: item.candidate,
      reason: item.reason,
    }));
}
