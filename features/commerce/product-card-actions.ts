import type { Product } from "@/features/commerce/types";

export function getProductCardCompareHref({
  products,
  product,
  storeSlug,
  limit = 3,
}: {
  limit?: number;
  product: Product;
  products: Product[];
  storeSlug: string;
}) {
  const compareProductSlugs = [
    product,
    ...products.filter((candidate) => candidate.id !== product.id),
  ]
    .slice(0, limit)
    .map((item) => encodeURIComponent(item.slug));

  return `/stores/${storeSlug}/compare?products=${compareProductSlugs.join(",")}`;
}
