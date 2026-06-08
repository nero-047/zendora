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
  initialVariantId,
  product,
  products,
  storeSlug,
}: {
  initialVariantId?: string;
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
  const initialVariant = initialVariantId
    ? activeVariants.find((variant) => variant.id === initialVariantId)
    : undefined;
  const [selectedVariantId, setSelectedVariantId] = useState(
    initialVariant?.id || defaultVariant?.id || "",
  );
  const selectedVariant =
    activeVariants.find((variant) => variant.id === selectedVariantId) ||
    defaultVariant;
  const initialInventoryCount =
    initialVariant?.inventoryCount ??
    defaultVariant?.inventoryCount ??
    product.inventoryCount;
  const [purchaseQuantity, setPurchaseQuantity] = useState(
    initialInventoryCount > 0 ? 1 : 0,
  );
  const { cart, updateQuantity } = useStoreCart(storeSlug, products);
  const checkoutHref = getCheckoutPermalink(storeSlug, cart);
  const selectedQuantity =
    cart.find(
      (line) =>
        line.productId === product.id &&
        (line.variantId || "") === (selectedVariant?.id || ""),
    )?.quantity || 0;
  const inventoryCount = selectedVariant?.inventoryCount ?? product.inventoryCount;
  const maxPurchaseQuantity = Math.max(0, inventoryCount);
  const requestedPurchaseQuantity =
    maxPurchaseQuantity > 0
      ? Math.min(Math.max(purchaseQuantity || 1, 1), maxPurchaseQuantity)
      : 0;
  const priceCents = selectedVariant?.priceCents ?? product.priceCents;
  const compareAtCents =
    selectedVariant?.compareAtCents ?? product.compareAtCents;
  const hasSalePrice =
    typeof compareAtCents === "number" && compareAtCents > priceCents;
  const savingsCents = hasSalePrice ? compareAtCents - priceCents : 0;
  const isSoldOut = inventoryCount === 0;
  const stockLabel = isSoldOut
    ? "Sold out"
    : inventoryCount <= 5
      ? `Low stock: ${inventoryCount} left`
      : `${inventoryCount} in stock`;
  const selectedSku = selectedVariant?.sku || product.sku;
  const buyNowHref = getCheckoutPermalink(storeSlug, [
    {
      productId: product.id,
      quantity: requestedPurchaseQuantity || 1,
      variantId: selectedVariant?.id,
    },
  ]);

  function addProduct() {
    if (requestedPurchaseQuantity <= 0) {
      return;
    }

    updateQuantity(
      product.id,
      selectedQuantity + requestedPurchaseQuantity,
      selectedVariant?.id,
    );
  }

  function updatePurchaseQuantity(nextQuantity: number) {
    if (maxPurchaseQuantity <= 0) {
      setPurchaseQuantity(0);
      return;
    }

    setPurchaseQuantity(
      Math.min(Math.max(nextQuantity, 1), maxPurchaseQuantity),
    );
  }

  function updateSelectedVariant(nextVariantId: string) {
    setSelectedVariantId(nextVariantId);

    const nextVariant =
      activeVariants.find((variant) => variant.id === nextVariantId) ||
      defaultVariant;
    const nextInventoryCount =
      nextVariant?.inventoryCount ?? product.inventoryCount;
    const nextMaxPurchaseQuantity = Math.max(0, nextInventoryCount);

    setPurchaseQuantity((currentQuantity) =>
      nextMaxPurchaseQuantity > 0
        ? Math.min(
            Math.max(currentQuantity || 1, 1),
            nextMaxPurchaseQuantity,
          )
        : 0,
    );

    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);

    if (nextVariantId) {
      url.searchParams.set("variant", nextVariantId);
    } else {
      url.searchParams.delete("variant");
    }

    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between gap-4 border-y border-slate-200 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">Price</p>
          <p
            className={
              hasSalePrice
                ? "text-3xl font-semibold text-rose-700"
                : "text-3xl font-semibold text-slate-950"
            }
          >
            {formatCurrency(priceCents, product.currency)}
          </p>
          {hasSalePrice ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-400 line-through">
                {formatCurrency(compareAtCents, product.currency)}
              </span>
              <span className="status-pill">Sale</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                Save {formatCurrency(savingsCents, product.currency)}
              </span>
            </div>
          ) : null}
        </div>
        <p className="text-sm font-semibold text-slate-600">
          {stockLabel}
        </p>
      </div>

      {activeVariants.length > 0 ? (
        <div className="grid gap-3">
          <label className="grid gap-2">
            <span className="label">
              {activeVariants[0]?.optionName || "Variant"}
            </span>
            <select
              className="field"
              onChange={(event) => updateSelectedVariant(event.target.value)}
              value={selectedVariant?.id || ""}
            >
              {activeVariants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.optionValue}
                  {variant.sku ? ` / ${variant.sku}` : ""}
                  {variant.inventoryCount <= 0 ? " / Sold out" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-2 rounded-[8px] border border-slate-200 bg-white/70 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-500">
                Selected variant
              </span>
              <span className="font-semibold text-slate-950">
                {selectedVariant?.optionValue || product.name}
              </span>
            </div>
            {selectedSku ? (
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-500">SKU</span>
                <span className="font-semibold text-slate-950">
                  {selectedSku}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-500">Availability</span>
              <span className="font-semibold text-slate-950">{stockLabel}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="label">Quantity</span>
          {maxPurchaseQuantity > 0 ? (
            <span className="text-xs font-semibold text-slate-500">
              Max {maxPurchaseQuantity}
            </span>
          ) : null}
        </div>
        <div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-[8px] border border-slate-200 bg-white/70">
          <button
            aria-label={`Decrease purchase quantity for ${product.name}`}
            className="grid h-12 place-items-center text-slate-700 disabled:text-slate-300"
            disabled={isSoldOut || requestedPurchaseQuantity <= 1}
            onClick={() => updatePurchaseQuantity(requestedPurchaseQuantity - 1)}
            type="button"
          >
            <Minus aria-hidden="true" size={16} />
          </button>
          <span
            aria-live="polite"
            className="grid h-12 place-items-center text-sm font-semibold text-slate-950"
          >
            {requestedPurchaseQuantity}
          </span>
          <button
            aria-label={`Increase purchase quantity for ${product.name}`}
            className="grid h-12 place-items-center text-slate-700 disabled:text-slate-300"
            disabled={
              isSoldOut || requestedPurchaseQuantity >= maxPurchaseQuantity
            }
            onClick={() => updatePurchaseQuantity(requestedPurchaseQuantity + 1)}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
          </button>
        </div>
      </div>

      <button
        className="primary-button w-full px-4 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={isSoldOut}
        onClick={addProduct}
        type="button"
      >
        <ShoppingBag aria-hidden="true" size={18} />
        {isSoldOut ? "Sold out" : "Add to cart"}
      </button>

      {selectedQuantity > 0 ? (
        <div className="grid gap-2 rounded-[8px] border border-slate-200 bg-white/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              In cart
            </span>
            <span className="text-sm font-semibold text-slate-950">
              {selectedQuantity} selected
            </span>
          </div>
          <div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-[8px] border border-slate-200 bg-white">
            <button
              aria-label={`Remove one ${product.name}`}
              className="grid h-12 place-items-center text-slate-700"
              onClick={() =>
                updateQuantity(
                  product.id,
                  selectedQuantity - 1,
                  selectedVariant?.id,
                )
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
                updateQuantity(
                  product.id,
                  selectedQuantity + 1,
                  selectedVariant?.id,
                )
              }
              type="button"
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      ) : null}

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
