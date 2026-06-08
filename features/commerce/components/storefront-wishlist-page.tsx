"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Heart, ShoppingBag, Trash2 } from "lucide-react";

import { useStoreCart } from "@/features/commerce/components/cart-store";
import { useStoreWishlist } from "@/features/commerce/components/wishlist-store";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type StorefrontWishlistPageProps = {
  products: Product[];
  storeName: string;
  storeSlug: string;
};

function getDefaultVariant(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );

  return (
    activeVariants.find((variant) => variant.inventoryCount > 0) ||
    activeVariants[0]
  );
}

export function StorefrontWishlistPage({
  products,
  storeName,
  storeSlug,
}: StorefrontWishlistPageProps) {
  const {
    clearWishlist,
    toggleWishlistProduct,
    wishlistItems,
    wishlistProductIds,
  } = useStoreWishlist(storeSlug, products);
  const { cart, updateQuantity } = useStoreCart(storeSlug, products);

  function addProduct(product: Product) {
    const variant = getDefaultVariant(product);
    const current = cart.find(
      (line) =>
        line.productId === product.id &&
        (line.variantId || "") === (variant?.id || ""),
    );

    updateQuantity(product.id, (current?.quantity || 0) + 1, variant?.id);
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <section className="glass-panel p-5 sm:p-6">
        <span className="status-pill mb-4">
          <Heart aria-hidden="true" size={14} />
          {wishlistProductIds.length} saved
        </span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold leading-tight text-slate-950">
              Wishlist
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Saved products from {storeName} stay in this browser until you move
              them to cart or clear the list.
            </p>
          </div>
          {wishlistItems.length > 0 ? (
            <button className="secondary-button px-3 text-sm" onClick={clearWishlist}>
              <Trash2 aria-hidden="true" size={16} />
              Clear wishlist
            </button>
          ) : null}
        </div>
      </section>

      {wishlistItems.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {wishlistItems.map((product) => {
            const variant = getDefaultVariant(product);
            const inventoryCount = variant?.inventoryCount ?? product.inventoryCount;
            const isSoldOut = inventoryCount <= 0;

            return (
              <article className="soft-panel overflow-hidden" key={product.id}>
                <Link href={`/stores/${storeSlug}/products/${product.slug}`}>
                  <Image
                    alt={product.name}
                    className="aspect-[4/3] w-full object-cover"
                    height={420}
                    sizes="(max-width: 640px) 100vw, 33vw"
                    src={product.imageUrl}
                    width={560}
                  />
                </Link>
                <div className="grid gap-3 p-4">
                  <div>
                    <Link
                      className="text-base font-semibold text-slate-950 hover:text-sky-700"
                      href={`/stores/${storeSlug}/products/${product.slug}`}
                    >
                      {product.name}
                    </Link>
                    <p className="mt-1 text-sm font-semibold text-slate-700">
                      {formatCurrency(
                        variant?.priceCents ?? product.priceCents,
                        product.currency,
                      )}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {isSoldOut ? "Sold out" : `${inventoryCount} in stock`}
                    </p>
                  </div>
                  <div className="grid gap-2">
                    <button
                      className="primary-button min-h-10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"
                      disabled={isSoldOut}
                      onClick={() => addProduct(product)}
                      type="button"
                    >
                      <ShoppingBag aria-hidden="true" size={15} />
                      Add to cart
                    </button>
                    <button
                      className="secondary-button min-h-10 px-3 text-sm"
                      onClick={() => toggleWishlistProduct(product.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" size={15} />
                      Remove
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="soft-panel p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Saved products
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Save products while browsing and return here when you are ready to
            compare or add them to cart.
          </p>
          <Link
            className="primary-button mt-4 w-fit px-4 text-sm"
            href={`/stores/${storeSlug}`}
          >
            Continue shopping
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </section>
      )}
    </section>
  );
}
