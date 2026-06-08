"use client";

import Link from "next/link";
import { ArrowRight, Minus, Plus, ShoppingBag } from "lucide-react";
import { useMemo, useState } from "react";

import { getCheckoutPermalink } from "@/features/commerce/cart-permalinks";
import { useStoreCart } from "@/features/commerce/components/cart-store";
import { WishlistButton } from "@/features/commerce/components/wishlist-button";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export function ProductDetailActions({
  product,
  products,
  storeSlug,
}: {
  product: Product;
  products: Product[];
  storeSlug: string;
}) {
  const activeVariants = useMemo(
    () => product.variants.filter((variant) => variant.status === "active"),
    [product.variants],
  );
  const defaultVariant =
    activeVariants.find((variant) => variant.inventoryCount > 0) || activeVariants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(
    defaultVariant?.id || "",
  );
  const selectedVariant =
    activeVariants.find((variant) => variant.id === selectedVariantId) ||
    defaultVariant;
  const { cart, updateQuantity } = useStoreCart(storeSlug, products);
  const checkoutHref = getCheckoutPermalink(storeSlug, cart);
  const selectedQuantity =
    cart.find(
      (line) =>
        line.productId === product.id &&
        (line.variantId || "") === (selectedVariant?.id || ""),
    )?.quantity || 0;
  const inventoryCount = selectedVariant?.inventoryCount ?? product.inventoryCount;
  const priceCents = selectedVariant?.priceCents ?? product.priceCents;
  const isSoldOut = inventoryCount === 0;
  const buyNowQuantity = Math.min(Math.max(selectedQuantity || 1, 1), inventoryCount || 1);
  const buyNowHref = getCheckoutPermalink(storeSlug, [
    {
      productId: product.id,
      quantity: buyNowQuantity,
      variantId: selectedVariant?.id,
    },
  ]);

  function addProduct() {
    updateQuantity(product.id, selectedQuantity + 1, selectedVariant?.id);
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-4 border-y border-slate-200 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">Price</p>
          <p className="text-3xl font-semibold text-slate-950">
            {formatCurrency(priceCents, product.currency)}
          </p>
        </div>
        <p className="text-sm font-semibold text-slate-600">
          {inventoryCount} in stock
        </p>
      </div>

      {activeVariants.length > 0 ? (
        <label className="grid gap-2">
          <span className="label">{activeVariants[0]?.optionName || "Variant"}</span>
          <select
            className="field"
            onChange={(event) => setSelectedVariantId(event.target.value)}
            value={selectedVariant?.id || ""}
          >
            {activeVariants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.optionValue}
                {variant.sku ? ` / ${variant.sku}` : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selectedQuantity > 0 ? (
        <div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-[8px] border border-slate-200 bg-white/70">
          <button
            aria-label={`Remove one ${product.name}`}
            className="grid h-12 place-items-center text-slate-700"
            onClick={() =>
              updateQuantity(product.id, selectedQuantity - 1, selectedVariant?.id)
            }
            type="button"
          >
            <Minus aria-hidden="true" size={16} />
          </button>
          <span className="grid h-12 place-items-center text-sm font-semibold text-slate-950">
            {selectedQuantity}
          </span>
          <button
            aria-label={`Add one ${product.name}`}
            className="grid h-12 place-items-center text-slate-700 disabled:text-slate-300"
            disabled={selectedQuantity >= inventoryCount}
            onClick={() =>
              updateQuantity(product.id, selectedQuantity + 1, selectedVariant?.id)
            }
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
          </button>
        </div>
      ) : (
        <button
          className="primary-button w-full px-4 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={isSoldOut}
          onClick={addProduct}
          type="button"
        >
          <ShoppingBag aria-hidden="true" size={18} />
          {isSoldOut ? "Sold out" : "Add to cart"}
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          aria-disabled={isSoldOut}
          className={
            isSoldOut
              ? "secondary-button pointer-events-none w-full px-4 opacity-55"
              : "secondary-button w-full px-4"
          }
          href={isSoldOut ? "#" : buyNowHref}
        >
          Buy now
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
        <Link className="secondary-button w-full px-4" href={checkoutHref}>
          Checkout cart
          <ArrowRight aria-hidden="true" size={16} />
        </Link>
        <WishlistButton product={product} products={products} storeSlug={storeSlug} />
      </div>
    </div>
  );
}
