import { getCheckoutPermalink } from "@/features/commerce/cart-permalinks";
import type { Order, Product } from "@/features/commerce/types";

export function getReorderCartLines(order: Order, products: Product[]) {
  const activeProductIds = new Set(
    products
      .filter((product) => product.status === "active")
      .map((product) => product.id),
  );
  const activeVariantIds = new Set(
    products.flatMap((product) =>
      product.variants
        .filter((variant) => variant.status === "active")
        .map((variant) => variant.id),
    ),
  );

  return (order.items || [])
    .filter((item) => item.productId && activeProductIds.has(item.productId))
    .map((item) => ({
      productId: item.productId || "",
      quantity: item.quantity,
      variantId:
        item.productVariantId && activeVariantIds.has(item.productVariantId)
          ? item.productVariantId
          : undefined,
    }))
    .filter((line) => line.productId && line.quantity > 0);
}

export function getReorderCheckoutHref({
  order,
  products,
  storeSlug,
}: {
  order: Order;
  products: Product[];
  storeSlug: string;
}) {
  return getCheckoutPermalink(storeSlug, getReorderCartLines(order, products));
}
