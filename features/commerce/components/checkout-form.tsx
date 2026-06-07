"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Loader2, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useActionState } from "react";

import type { ActionState } from "@/features/commerce/action-state";
import { initialActionState } from "@/features/commerce/action-state";
import { createCheckoutOrderAction } from "@/features/commerce/actions";
import { useStoreCart } from "@/features/commerce/components/cart-store";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type CheckoutFormProps = {
  freeShippingThresholdCents: number;
  storeName: string;
  storeSlug: string;
  shippingRateCents: number;
  taxRateBps: number;
  products: Product[];
};

export function CheckoutForm({
  freeShippingThresholdCents,
  storeName,
  storeSlug,
  shippingRateCents,
  taxRateBps,
  products,
}: CheckoutFormProps) {
  const { cartItems, clearCart, updateQuantity } = useStoreCart(
    storeSlug,
    products,
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

  const totalCents = cartItems.reduce(
    (sum, item) =>
      sum + (item.variant?.priceCents ?? item.product.priceCents) * item.quantity,
    0,
  );
  const estimatedShippingCents =
    totalCents > 0 &&
    freeShippingThresholdCents > 0 &&
    totalCents >= freeShippingThresholdCents
      ? 0
      : totalCents > 0
        ? shippingRateCents
        : 0;
  const estimatedTaxCents =
    totalCents > 0 ? Math.round((totalCents * taxRateBps) / 10000) : 0;
  const estimatedTotalCents =
    totalCents + estimatedShippingCents + estimatedTaxCents;
  const currency = products[0]?.currency || "USD";
  const checkoutPayload = cartItems.map((item) => ({
    productId: item.productId,
    variantId: item.variantId,
    quantity: item.quantity,
  }));
  const isEmpty = cartItems.length === 0;

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

        <input name="cart" type="hidden" value={JSON.stringify(checkoutPayload)} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="label">Name</span>
            <input
              autoComplete="name"
              className="field"
              name="customerName"
              placeholder="Mira Chen"
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
              placeholder="mira@example.com"
              type="email"
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
            <span className="label">Country</span>
            <input
              autoComplete="shipping country-name"
              className="field"
              defaultValue="United States"
              name="shippingCountry"
            />
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
          <span className="label">Promo code</span>
          <input
            className="field uppercase"
            name="discountCode"
            placeholder="WELCOME10"
          />
          {state.errors?.discountCode ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.discountCode[0]}
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
                {formatCurrency(totalCents, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-500">Shipping</span>
              <span className="text-sm font-semibold text-slate-950">
                {formatCurrency(estimatedShippingCents, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-slate-500">Tax</span>
              <span className="text-sm font-semibold text-slate-950">
                {formatCurrency(estimatedTaxCents, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <span className="text-sm font-semibold text-slate-500">Estimated total</span>
              <span className="text-xl font-semibold text-slate-950">
                {formatCurrency(estimatedTotalCents, currency)}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
