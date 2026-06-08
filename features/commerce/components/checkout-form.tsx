"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

import type { ActionState } from "@/features/commerce/action-state";
import { initialActionState } from "@/features/commerce/action-state";
import { createCheckoutOrderAction } from "@/features/commerce/actions";
import { calculateCheckoutTotals } from "@/features/commerce/business-rules";
import {
  type CartLine,
  useStoreCart,
} from "@/features/commerce/components/cart-store";
import type { Product, ShippingZone } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type CheckoutFormProps = {
  checkoutSessionId: string;
  freeShippingThresholdCents: number;
  storeName: string;
  storeSlug: string;
  shippingZones: ShippingZone[];
  shippingRateCents: number;
  taxRateBps: number;
  products: Product[];
  initialCart?: CartLine[];
  initialCartKey?: string;
  initialCustomerEmail?: string;
  initialCustomerName?: string;
  initialDiscountCode?: string;
  initialGiftCardCode?: string;
  initialRecoveryToken?: string;
};

type CheckoutPreviewTotals = ReturnType<typeof calculateCheckoutTotals>;

type CheckoutPreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { error: string; status: "error" }
  | {
      discountCode: string | null;
      giftCardCode: string | null;
      status: "success";
      totals: CheckoutPreviewTotals;
    };

function getShippingCountryOptions(shippingZones: ShippingZone[]) {
  const countries = new Map<string, string>();

  countries.set("united states", "United States");

  for (const zone of shippingZones) {
    const displayCountries = zone.countries.filter((country) => {
      const trimmed = country.trim();

      return trimmed.length > 2 && !/^[A-Z]{2,3}$/.test(trimmed);
    });
    const zoneCountries = displayCountries.length > 0
      ? displayCountries
      : zone.countries;

    for (const country of zoneCountries) {
      const trimmed = country.trim();

      if (trimmed) {
        countries.set(trimmed.toLowerCase(), trimmed);
      }
    }
  }

  return [...countries.values()];
}

export function CheckoutForm({
  checkoutSessionId,
  freeShippingThresholdCents,
  storeName,
  storeSlug,
  shippingZones,
  shippingRateCents,
  taxRateBps,
  products,
  initialCart,
  initialCartKey,
  initialCustomerEmail,
  initialCustomerName,
  initialDiscountCode,
  initialGiftCardCode,
  initialRecoveryToken,
}: CheckoutFormProps) {
  const router = useRouter();
  const [customerName, setCustomerName] = useState(initialCustomerName || "");
  const [customerEmail, setCustomerEmail] = useState(initialCustomerEmail || "");
  const [discountCode, setDiscountCode] = useState(initialDiscountCode || "");
  const [giftCardCode, setGiftCardCode] = useState(initialGiftCardCode || "");
  const [preview, setPreview] = useState<CheckoutPreviewState>({ status: "idle" });
  const [recoveryToken, setRecoveryToken] = useState(initialRecoveryToken || "");
  const restoredInitialCartKeyRef = useRef("");
  const [shippingCountry, setShippingCountry] = useState("United States");
  const shippingCountryOptions = getShippingCountryOptions(shippingZones);
  const { cartItems, clearCart, replaceCart, updateQuantity } = useStoreCart(
    storeSlug,
    products,
    initialCart,
  );
  async function checkoutAction(
    currentState: ActionState,
    formData: FormData,
  ) {
    const nextState = await createCheckoutOrderAction(
      storeSlug,
      currentState,
      formData,
    );

    if (nextState.status === "success") {
      clearCart();
    }

    return nextState;
  }

  const [state, formAction, pending] = useActionState(
    checkoutAction,
    initialActionState,
  );
  const orderStatusUrl =
    typeof state.data?.orderStatusUrl === "string"
      ? state.data.orderStatusUrl
      : null;

  useEffect(() => {
    if (state.status === "success" && orderStatusUrl) {
      router.push(orderStatusUrl);
    }
  }, [orderStatusUrl, router, state.status]);

  useEffect(() => {
    if (
      !initialCartKey ||
      !initialCart?.length ||
      restoredInitialCartKeyRef.current === initialCartKey
    ) {
      return;
    }

    replaceCart(initialCart);
    restoredInitialCartKeyRef.current = initialCartKey;
  }, [initialCart, initialCartKey, replaceCart]);

  const subtotalCents = cartItems.reduce(
    (sum, item) =>
      sum + (item.variant?.priceCents ?? item.product.priceCents) * item.quantity,
    0,
  );
  const checkoutTotals = calculateCheckoutTotals({
    freeShippingThresholdCents,
    shippingCountry,
    shippingRateCents,
    shippingZones,
    subtotalCents,
    taxRateBps,
  });
  const shippingLabel = checkoutTotals.shippingZone?.name || "Base rate";
  const currency = products[0]?.currency || "USD";
  const checkoutPayload = cartItems.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
  }));
  const checkoutPayloadJson = JSON.stringify(checkoutPayload);
  const isEmpty = cartItems.length === 0;
  const hasCheckoutCodes = Boolean(
    discountCode.trim() || giftCardCode.trim(),
  );
  const activePreview = hasCheckoutCodes && !isEmpty ? preview : null;
  const previewTotals =
    activePreview?.status === "success" ? activePreview.totals : checkoutTotals;

  useEffect(() => {
    const email = customerEmail.trim();

    if (!email || !email.includes("@") || isEmpty) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/stores/${encodeURIComponent(storeSlug)}/abandoned-checkouts`,
          {
            body: JSON.stringify({
              customerEmail: email,
              customerName,
              recoveryToken: recoveryToken || undefined,
              cart: JSON.parse(checkoutPayloadJson),
            }),
            headers: {
              "Content-Type": "application/json",
            },
            method: "POST",
            signal: controller.signal,
          },
        );
        const payload = await response.json().catch(() => null);

        if (
          !controller.signal.aborted &&
          payload &&
          typeof payload.recoveryToken === "string" &&
          payload.recoveryToken !== recoveryToken
        ) {
          setRecoveryToken(payload.recoveryToken);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Checkout recovery capture failed", error);
        }
      }
    }, 700);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    checkoutPayloadJson,
    customerEmail,
    customerName,
    isEmpty,
    recoveryToken,
    storeSlug,
  ]);

  useEffect(() => {
    if (!hasCheckoutCodes || isEmpty) {
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
                : "Checkout code preview is unavailable.",
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
          totals: payload.totals as CheckoutPreviewTotals,
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("Checkout code preview failed", error);
          setPreview({
            error: "Checkout code preview is unavailable.",
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
    isEmpty,
    shippingCountry,
    storeSlug,
  ]);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_0.82fr] lg:px-8">
      <form action={formAction} className="glass-panel grid gap-5 p-5 sm:p-6">
        <div>
          <Link
            className="secondary-button mb-5 w-fit px-3 text-sm"
            href={`/stores/${storeSlug}`}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            {storeName}
          </Link>
          <h1 className="text-3xl font-semibold text-slate-950">Checkout</h1>
        </div>

        <input name="cart" type="hidden" value={checkoutPayloadJson} />
        <input
          name="checkoutSessionId"
          type="hidden"
          value={checkoutSessionId}
        />
        <input
          name="abandonedCheckoutToken"
          type="hidden"
          value={recoveryToken}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="label">Name</span>
            <input
              autoComplete="name"
              className="field"
              name="customerName"
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Mira Chen"
              value={customerName}
            />
            {state.errors?.customerName ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.customerName[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">Email</span>
            <input
              autoComplete="email"
              className="field"
              name="customerEmail"
              onChange={(event) => setCustomerEmail(event.target.value)}
              placeholder="mira@example.com"
              type="email"
              value={customerEmail}
            />
            {state.errors?.customerEmail ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.customerEmail[0]}
              </span>
            ) : null}
          </label>
        </div>

        <label className="grid gap-2">
          <span className="label">Phone</span>
          <input
            autoComplete="tel"
            className="field"
            name="customerPhone"
            placeholder="+1 555 0100"
            type="tel"
          />
          {state.errors?.customerPhone ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.customerPhone[0]}
            </span>
          ) : null}
        </label>

        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="label">Address</span>
            <input
              autoComplete="shipping address-line1"
              className="field"
              name="shippingAddressLine1"
              placeholder="121 Commerce Street"
            />
            {state.errors?.shippingAddressLine1 ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.shippingAddressLine1[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">Apartment, suite</span>
            <input
              autoComplete="shipping address-line2"
              className="field"
              name="shippingAddressLine2"
              placeholder="Suite 4B"
            />
            {state.errors?.shippingAddressLine2 ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.shippingAddressLine2[0]}
              </span>
            ) : null}
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="label">City</span>
            <input
              autoComplete="shipping address-level2"
              className="field"
              name="shippingCity"
              placeholder="Austin"
            />
            {state.errors?.shippingCity ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.shippingCity[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">State / region</span>
            <input
              autoComplete="shipping address-level1"
              className="field"
              name="shippingRegion"
              placeholder="TX"
            />
            {state.errors?.shippingRegion ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.shippingRegion[0]}
              </span>
            ) : null}
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="label">Postal code</span>
            <input
              autoComplete="shipping postal-code"
              className="field"
              name="shippingPostalCode"
              placeholder="78701"
            />
            {state.errors?.shippingPostalCode ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.shippingPostalCode[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">Country / region</span>
            <select
              autoComplete="shipping country-name"
              className="field"
              name="shippingCountry"
              onChange={(event) => setShippingCountry(event.target.value)}
              value={shippingCountry}
            >
              {shippingCountryOptions.map((country) => (
                <option key={country} value={country}>
                  {country}
                </option>
              ))}
            </select>
            {state.errors?.shippingCountry ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.shippingCountry[0]}
              </span>
            ) : null}
          </label>
        </div>

        <label className="grid gap-2">
          <span className="label">Order note</span>
          <textarea
            className="field min-h-24 resize-none"
            name="customerNote"
            placeholder="Delivery notes or gift message"
          />
          {state.errors?.customerNote ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.customerNote[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Payment</span>
          <select className="field" defaultValue="manual_invoice" name="paymentMethod">
            <option value="manual_invoice">Manual invoice</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash_on_delivery">Cash on delivery</option>
          </select>
          {state.errors?.paymentMethod ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.paymentMethod[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Promo code</span>
          <input
            className="field uppercase"
            name="discountCode"
            onChange={(event) => setDiscountCode(event.target.value.toUpperCase())}
            placeholder="WELCOME10"
            value={discountCode}
          />
          {state.errors?.discountCode ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.discountCode[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Gift card</span>
          <input
            className="field uppercase"
            name="giftCardCode"
            onChange={(event) => setGiftCardCode(event.target.value.toUpperCase())}
            placeholder="SUMMER-5000"
            value={giftCardCode}
          />
          {state.errors?.giftCardCode ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.giftCardCode[0]}
            </span>
          ) : null}
        </label>

        {state.errors?.cart ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.cart[0]}
          </span>
        ) : null}

        {state.message ? (
          <p
            className={
              state.status === "error"
                ? "text-sm font-medium text-red-600"
                : "text-sm font-medium text-emerald-700"
            }
          >
            {state.message}
          </p>
        ) : null}

        {state.status === "success" && orderStatusUrl ? (
          <Link className="secondary-button w-fit px-4 text-sm" href={orderStatusUrl}>
            View order status
          </Link>
        ) : null}

        <button
          className="primary-button px-4 disabled:cursor-not-allowed disabled:opacity-55"
          disabled={pending || isEmpty}
          type="submit"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
          ) : (
            <ShoppingBag aria-hidden="true" size={18} />
          )}
          Place order
        </button>
      </form>

      <aside className="soft-panel h-fit overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-lg font-semibold text-slate-950">Order summary</h2>
        </div>

        {cartItems.length > 0 ? (
          <div className="grid gap-0">
            {cartItems.map((item) => (
              <div
                className="grid grid-cols-[72px_1fr_auto] gap-3 border-b border-slate-100 p-4 last:border-0"
                key={`${item.productId}:${item.variantId || ""}`}
              >
                <Image
                  alt={item.product.name}
                  className="h-16 w-16 rounded-[8px] object-cover"
                  height={128}
                  src={item.product.imageUrl}
                  width={128}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {item.product.name}
                  </p>
                  {item.variant ? (
                    <p className="truncate text-xs text-slate-500">
                      {item.variant.optionName}: {item.variant.optionValue}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {formatCurrency(
                      item.variant?.priceCents ?? item.product.priceCents,
                      item.product.currency,
                    )}
                  </p>
                  <div className="mt-2 inline-grid grid-cols-[36px_40px_36px] overflow-hidden rounded-[8px] border border-slate-200 bg-white/70">
                    <button
                      aria-label={`Remove one ${item.product.name}`}
                      className="grid h-9 place-items-center text-slate-700"
                      onClick={() =>
                        updateQuantity(
                          item.productId,
                          item.quantity - 1,
                          item.variantId,
                        )
                      }
                      type="button"
                    >
                      <Minus aria-hidden="true" size={15} />
                    </button>
                    <span className="grid h-9 place-items-center text-sm font-semibold text-slate-950">
                      {item.quantity}
                    </span>
                    <button
                      aria-label={`Add one ${item.product.name}`}
                      className="grid h-9 place-items-center text-slate-700 disabled:text-slate-300"
                      disabled={
                        item.quantity >=
                        (item.variant?.inventoryCount ?? item.product.inventoryCount)
                      }
                      onClick={() =>
                        updateQuantity(
                          item.productId,
                          item.quantity + 1,
                          item.variantId,
                        )
                      }
                      type="button"
                    >
                      <Plus aria-hidden="true" size={15} />
                    </button>
                  </div>
                </div>
                <button
                  aria-label={`Remove ${item.product.name}`}
                  className="icon-button h-10 min-h-10 w-10"
                  onClick={() => updateQuantity(item.productId, 0, item.variantId)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm leading-6 text-slate-500">
            Choose products from the storefront before checkout.
          </p>
        )}

        <div className="border-t border-slate-100 p-4">
          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-500">Subtotal</span>
              <span className="text-sm font-semibold text-slate-950">
                {formatCurrency(previewTotals.subtotalCents, currency)}
              </span>
            </div>
            {activePreview?.status === "success" &&
            previewTotals.discountCents > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-emerald-700">
                  Discount
                  {activePreview.discountCode ? (
                    <span className="block text-xs font-medium text-emerald-600">
                      {activePreview.discountCode}
                    </span>
                  ) : null}
                </span>
                <span className="text-sm font-semibold text-emerald-700">
                  -{formatCurrency(previewTotals.discountCents, currency)}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-500">
                Shipping
                {shippingZones.length > 0 ? (
                  <span className="block text-xs font-medium text-slate-400">
                    {shippingLabel}
                  </span>
                ) : null}
              </span>
              <span className="text-sm font-semibold text-slate-950">
                {formatCurrency(previewTotals.shippingCents, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-500">Tax</span>
              <span className="text-sm font-semibold text-slate-950">
                {formatCurrency(previewTotals.taxCents, currency)}
              </span>
            </div>
            {activePreview?.status === "success" &&
            previewTotals.giftCardCents > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-emerald-700">
                  Gift card
                  {activePreview.giftCardCode ? (
                    <span className="block text-xs font-medium text-emerald-600">
                      {activePreview.giftCardCode}
                    </span>
                  ) : null}
                </span>
                <span className="text-sm font-semibold text-emerald-700">
                  -{formatCurrency(previewTotals.giftCardCents, currency)}
                </span>
              </div>
            ) : null}
            {activePreview?.status === "loading" ? (
              <p className="text-xs font-semibold text-slate-500">
                Checking promo and gift card codes...
              </p>
            ) : null}
            {activePreview?.status === "error" ? (
              <p className="text-xs font-semibold text-red-600">
                {activePreview.error}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="text-sm font-semibold text-slate-500">Estimated total</span>
              <span className="text-xl font-semibold text-slate-950">
                {formatCurrency(previewTotals.totalCents, currency)}
              </span>
            </div>
            {activePreview?.status === "success" && hasCheckoutCodes ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-500">
                  Amount due
                </span>
                <span className="text-xl font-semibold text-slate-950">
                  {formatCurrency(previewTotals.amountDueCents, currency)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}
