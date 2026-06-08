"use client";

import { Heart } from "lucide-react";

import { useStoreWishlist } from "@/features/commerce/components/wishlist-store";
import type { Product } from "@/features/commerce/types";

export function WishlistButton({
  product,
  products,
  storeSlug,
}: {
  product: Product;
  products: Product[];
  storeSlug: string;
}) {
  const { isWishlisted, toggleWishlistProduct } = useStoreWishlist(
    storeSlug,
    products,
  );
  const saved = isWishlisted(product.id);

  return (
    <button
      aria-pressed={saved}
      className="secondary-button w-full px-4"
      onClick={() => toggleWishlistProduct(product.id)}
      type="button"
    >
      <Heart
        aria-hidden="true"
        className={saved ? "fill-slate-950 text-slate-950" : undefined}
        size={16}
      />
      {saved ? "Saved" : "Save to wishlist"}
    </button>
  );
}
