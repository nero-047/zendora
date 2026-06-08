"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  ShoppingBag,
  Tag,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";

import { getCheckoutPermalink } from "@/features/commerce/cart-permalinks";
import { calculateCheckoutTotals } from "@/features/commerce/business-rules";
import { useStoreCart } from "@/features/commerce/components/cart-store";
import type { Product, ShippingZone } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type StorefrontCartPageProps = {
  freeShippingThresholdCents: number;
  products: Product[];
  shippingRateCents: number;
  shippingZones: ShippingZone[];
  storeName: string;
  storeSlug: string;
  taxRateBps: number;
};

type CartPreviewTotals = ReturnType<typeof calculateCheckoutTotals>;

type CartPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { error: string; status: "error" }
  | {
      discountCode: string | null;
      giftCardCode: string | null;
      status: "success";
      totals: CartPreviewTotals;
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

function getProductInventory(product: Product) {
  return getDefaultVariant(product)?.inventoryCount ?? product.inventoryCount;
}

function appendCheckoutCodes(input: {
  discountCode: string;
  giftCardCode: string;
  href: string;
}) {
  const [pathname, queryString = ""] = input.href.split("?");
  const params = new URLSearchParams(queryString);
  const discountCode = input.discountCode.trim();
  const giftCardCode = input.giftCardCode.trim();

  if (discountCode) {
    params.set("discountCode", discountCode);
  }

  if (giftCardCode) {
    params.set("giftCardCode", giftCardCode);
  }

  const nextQueryString = params.toString();

  return nextQueryString ? `${pathname}?${nextQueryString}` : pathname;
}

export function StorefrontCartPage({
  freeShippingThresholdCents,
  products,
  shippingRateCents,
  shippingZones,
  storeName,
  storeSlug,
  taxRateBps,
}: StorefrontCartPageProps) {
  const [discountCode, setDiscountCode] = useState("");
  const [giftCardCode, setGiftCardCode] = useState("");
  const [preview, setPreview] = useState<CartPreviewState>({ status: "idle" });
  const [shippingCountry, setShippingCountry] = useState("United States");
  const { cart, cartItems, clearCart, updateQuantity } = useStoreCart(
    storeSlug,
    products,
  );
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = cartItems.reduce(
    (sum, item) =>
      sum + (item.variant?.priceCents ?? item.product.priceCents) * item.quantity,
    0,
  );
  const currency = products[0]?.currency || "USD";
  const checkoutHref = getCheckoutPermalink(storeSlug, cart);
  const checkoutHrefWithCodes = appendCheckoutCodes({
    discountCode,
    giftCardCode,
    href: checkoutHref,
  });
  const cartTotals = calculateCheckoutTotals({
    freeShippingThresholdCents,
    shippingCountry,
    shippingRateCents,
    shippingZones,
    subtotalCents,
    taxRateBps,
  });
  const checkoutPayload = cartItems.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
  }));
  const checkoutPayloadJson = JSON.stringify(checkoutPayload);
  const hasCheckoutCodes = Boolean(
    cartItems.length > 0 && (discountCode.trim() || giftCardCode.trim()),
  );
  const activePreview = hasCheckoutCodes ? preview : null;
  const summaryTotals =
    activePreview?.status === "success" ? activePreview.totals : cartTotals;
  const activeShippingThreshold =
    summaryTotals.shippingZone?.freeShippingThresholdCents ??
    freeShippingThresholdCents;
  const freeShippingRemainingCents = Math.max(
    0,
    activeShippingThreshold - summaryTotals.discountedSubtotalCents,
  );
  const freeShippingProgress =
    activeShippingThreshold > 0
      ? Math.min(
          100,
          Math.round(
            (summaryTotals.discountedSubtotalCents / activeShippingThreshold) *
              100,
          ),
        )
      : 100;
  const cartProductIds = new Set(cartItems.map((item) => item.productId));
  const recommendations = products
    .filter((product) => product.status === "active")
    .filter((product) => !cartProductIds.has(product.id))
    .filter((product) => getProductInventory(product) > 0)
    .slice(0, 4);

  function addRecommendedProduct(product: Product) {
    const variant = getDefaultVariant(product);
    const current = cart.find(
      (line) =>
        line.productId === product.id &&
        (line.variantId || "") === (variant?.id || ""),
    );

    updateQuantity(product.id, (current?.quantity || 0) + 1, variant?.id);
  }

  useEffect(() => {
    if (!hasCheckoutCodes) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreview({ status: "loading" });

      try {
        const response = await fetch(
          `/api/stores/${encodeURIComponent(storeSlug)}/checkout-preview`,
          {
            body: JSON.stringify({
              cart: JSON.parse(checkoutPayloadJson),
              discountCode: discountCode || undefined,
              giftCardCode: giftCardCode || undefined,
              shippingCountry,
            }),
            headers: {
              "Content-Type": "application/json",
            },
            method: "POST",
            signal: controller.signal,
          },
        );
        const payload = await response.json().catch(() => null);

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok || !payload?.ok) {
          setPreview({
            error:
              typeof payload?.error === "string"
                ? payload.error
                : "Cart estimate is unavailable.",
            status: "error",
          });
          return;
        }

        setPreview({
          discountCode:
            typeof payload.discountCode === "string"
              ? payload.discountCode
              : null,
          giftCardCode:
            typeof payload.giftCardCode === "string"
              ? payload.giftCardCode
              : null,
          status: "success",
          totals: payload.totals as CartPreviewTotals,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Cart estimate failed", error);
          setPreview({
            error: "Cart estimate is unavailable.",
            status: "error",
          });
        }
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    checkoutPayloadJson,
    discountCode,
    giftCardCode,
    hasCheckoutCodes,
    shippingCountry,
    storeSlug,
  ]);

  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <div className="grid gap-5">
        <section className="glass-panel p-5 sm:p-6">
          <span className="status-pill mb-4">
            <ShoppingBag aria-hidden="true" size={14} />
            {cartCount} items
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-slate-950">
            Shopping cart
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Review quantities, remove items, and keep shopping before checkout
            with {storeName}.
          </p>
        </section>

        {cartItems.length > 0 ? (
          <section className="grid gap-3">
            {cartItems.map((item) => {
              const priceCents = item.variant?.priceCents ?? item.product.priceCents;
              const inventoryCount =
                item.variant?.inventoryCount ?? item.product.inventoryCount;

              return (
                <article
                  className="soft-panel grid gap-4 p-4 sm:grid-cols-[112px_1fr]"
                  key={`${item.productId}:${item.variantId || ""}`}
                >
                  <Image
                    alt={item.product.name}
                    className="aspect-square w-full rounded-[8px] object-cover"
                    height={224}
                    sizes="(max-width: 640px) 100vw, 112px"
                    src={item.product.imageUrl}
                    width={224}
                  />
                  <div className="grid gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          className="text-base font-semibold text-slate-950 hover:text-sky-700"
                          href={`/stores/${storeSlug}/products/${item.product.slug}`}
                        >
                          {item.product.name}
                        </Link>
                        {item.variant ? (
                          <p className="mt-1 text-sm text-slate-500">
                            {item.variant.optionName}: {item.variant.optionValue}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm font-semibold text-slate-700">
                          {formatCurrency(priceCents, item.product.currency)}
                        </p>
                      </div>
                      <p className="text-base font-semibold text-slate-950">
                        {formatCurrency(priceCents * item.quantity, item.product.currency)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="grid w-36 grid-cols-[44px_1fr_44px] overflow-hidden rounded-[8px] border border-slate-200 bg-white/70">
                        <button
                          aria-label={`Remove one ${item.product.name}`}
                          className="grid h-11 place-items-center text-slate-700"
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity - 1,
                              item.variantId,
                            )
                          }
                          type="button"
                        >
                          <Minus aria-hidden="true" size={16} />
                        </button>
                        <span className="grid h-11 place-items-center text-sm font-semibold text-slate-950">
                          {item.quantity}
                        </span>
                        <button
                          aria-label={`Add one ${item.product.name}`}
                          className="grid h-11 place-items-center text-slate-700 disabled:text-slate-300"
                          disabled={item.quantity >= inventoryCount}
                          onClick={() =>
                            updateQuantity(
                              item.productId,
                              item.quantity + 1,
                              item.variantId,
                            )
                          }
                          type="button"
                        >
                          <Plus aria-hidden="true" size={16} />
                        </button>
                      </div>
                      <button
                        className="secondary-button px-3 text-sm"
                        onClick={() =>
                          updateQuantity(item.productId, 0, item.variantId)
                        }
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={16} />
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
              Your cart is empty
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Add products from the storefront to prepare an order.
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

        {recommendations.length > 0 ? (
          <section className="grid gap-3">
            <h2 className="text-lg font-semibold text-slate-950">
              Keep building your order
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {recommendations.map((product) => (
                <article className="soft-panel overflow-hidden" key={product.id}>
                  <Link href={`/stores/${storeSlug}/products/${product.slug}`}>
                    <Image
                      alt={product.name}
                      className="aspect-[4/3] w-full object-cover"
                      height={360}
                      sizes="(max-width: 640px) 100vw, 25vw"
                      src={product.imageUrl}
                      width={480}
                    />
                  </Link>
                  <div className="grid gap-3 p-3">
                    <div>
                      <Link
                        className="text-sm font-semibold text-slate-950 hover:text-sky-700"
                        href={`/stores/${storeSlug}/products/${product.slug}`}
                      >
                        {product.name}
                      </Link>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {formatCurrency(product.priceCents, product.currency)}
                      </p>
                    </div>
                    <button
                      className="secondary-button min-h-10 px-3 text-sm"
                      onClick={() => addRecommendedProduct(product)}
                      type="button"
                    >
                      <ShoppingBag aria-hidden="true" size={15} />
                      Add
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <aside className="soft-panel h-fit p-4 lg:sticky lg:top-5">
        <h2 className="text-lg font-semibold text-slate-950">Order summary</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <div className="rounded-[8px] border border-slate-200 bg-white/70 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
              <Tag aria-hidden="true" size={16} />
              Estimate order
            </div>
            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="label">Discount code</span>
                <input
                  autoComplete="off"
                  className="field uppercase"
                  maxLength={32}
                  onChange={(event) =>
                    setDiscountCode(event.target.value.toUpperCase())
                  }
                  placeholder="WELCOME10"
                  value={discountCode}
                />
              </label>
              <label className="grid gap-1">
                <span className="label">Gift card</span>
                <input
                  autoComplete="off"
                  className="field uppercase"
                  maxLength={40}
                  onChange={(event) =>
                    setGiftCardCode(event.target.value.toUpperCase())
                  }
                  placeholder="SUMMER-5000"
                  value={giftCardCode}
                />
              </label>
            </div>
            {activePreview?.status === "loading" ? (
              <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-500">
                <Loader2 aria-hidden="true" className="animate-spin" size={14} />
                Checking cart estimate...
              </p>
            ) : null}
            {activePreview?.status === "error" ? (
              <p className="mt-3 text-xs font-semibold text-red-600">
                {activePreview.error}
              </p>
            ) : null}
          </div>

          <label className="grid gap-2">
            <span className="label">Shipping estimate</span>
            <select
              className="field"
              onChange={(event) => setShippingCountry(event.target.value)}
              value={shippingCountry}
            >
              <option value="United States">United States</option>
              {shippingZones.flatMap((zone) =>
                zone.countries
                  .filter((country) => country !== "United States")
                  .map((country) => (
                    <option key={`${zone.id}:${country}`} value={country}>
                      {country}
                    </option>
                  )),
              )}
            </select>
          </label>
          {activeShippingThreshold > 0 ? (
            <div className="rounded-[8px] border border-slate-200 bg-white/70 p-3">
              <div className="flex items-center justify-between gap-3 text-xs font-semibold text-slate-600">
                <span>Free shipping progress</span>
                <span>{freeShippingProgress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-600"
                  style={{ width: `${freeShippingProgress}%` }}
                />
              </div>
              <p className="mt-2 text-xs font-medium text-slate-500">
                {freeShippingRemainingCents > 0
                  ? `${formatCurrency(
                      freeShippingRemainingCents,
                      currency,
                    )} away from free shipping.`
                  : "Free shipping unlocked."}
              </p>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span>Subtotal</span>
            <span className="font-semibold text-slate-950">
              {formatCurrency(summaryTotals.subtotalCents, currency)}
            </span>
          </div>
          {summaryTotals.discountCents > 0 ? (
            <div className="flex items-center justify-between gap-3 text-emerald-700">
              <span>
                Discount
                {activePreview?.status === "success" &&
                activePreview.discountCode ? (
                  <span className="block text-xs text-emerald-600">
                    {activePreview.discountCode}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold">
                -{formatCurrency(summaryTotals.discountCents, currency)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span>
              Shipping
              {summaryTotals.shippingZone ? (
                <span className="block text-xs text-slate-400">
                  {summaryTotals.shippingZone.name}
                </span>
              ) : null}
            </span>
            <span className="font-semibold text-slate-950">
              {formatCurrency(summaryTotals.shippingCents, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-slate-600">
            <span>Tax estimate</span>
            <span className="font-semibold text-slate-950">
              {formatCurrency(summaryTotals.taxCents, currency)}
            </span>
          </div>
          {summaryTotals.giftCardCents > 0 ? (
            <div className="flex items-center justify-between gap-3 text-emerald-700">
              <span>
                Gift card
                {activePreview?.status === "success" &&
                activePreview.giftCardCode ? (
                  <span className="block text-xs text-emerald-600">
                    {activePreview.giftCardCode}
                  </span>
                ) : null}
              </span>
              <span className="font-semibold">
                -{formatCurrency(summaryTotals.giftCardCents, currency)}
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3 text-base font-semibold text-slate-950">
            <span>Estimated total</span>
            <span>{formatCurrency(summaryTotals.totalCents, currency)}</span>
          </div>
          {summaryTotals.giftCardCents > 0 ? (
            <div className="flex items-center justify-between gap-3 text-base font-semibold text-slate-950">
              <span className="inline-flex items-center gap-2">
                <CreditCard aria-hidden="true" size={16} />
                Amount due
              </span>
              <span>{formatCurrency(summaryTotals.amountDueCents, currency)}</span>
            </div>
          ) : null}
        </div>

        {cartItems.length > 0 ? (
          <>
            <Link
              className="primary-button mt-5 w-full px-4 text-sm"
              href={checkoutHrefWithCodes}
            >
              Checkout
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
            <button
              className="secondary-button mt-3 w-full px-4 text-sm"
              onClick={clearCart}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
              Clear cart
            </button>
          </>
        ) : (
          <button
            className="primary-button mt-5 w-full px-4 text-sm opacity-55"
            disabled
            type="button"
          >
            Checkout
            <ArrowRight aria-hidden="true" size={16} />
          </button>
        )}

        <Link
          className="secondary-button mt-3 w-full px-4 text-sm"
          href={`/stores/${storeSlug}`}
        >
          Continue shopping
        </Link>
      </aside>
    </section>
  );
}
