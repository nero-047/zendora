"use client";

import { useActionState, useMemo } from "react";
import { ClipboardPlus, Loader2 } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createManualOrderAction } from "@/features/commerce/actions";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type ManualOrderFormProps = {
  currency: string;
  products: Product[];
  storeId: string;
};

function getLineKey(productId: string, variantId?: string) {
  return `${encodeURIComponent(productId)}__${variantId ? encodeURIComponent(variantId) : "base"}`;
}

export function ManualOrderForm({
  currency,
  products,
  storeId,
}: ManualOrderFormProps) {
  const [state, formAction, pending] = useActionState(
    createManualOrderAction.bind(null, storeId),
    initialActionState,
  );
  const lineOptions = useMemo(
    () =>
      products.flatMap((product) => {
        if (product.status === "archived") {
          return [];
        }

        const activeVariants = product.variants.filter(
          (variant) => variant.status === "active",
        );

        if (activeVariants.length > 0) {
          return activeVariants.map((variant) => ({
            inventoryCount: variant.inventoryCount,
            key: getLineKey(product.id, variant.id),
            label: `${product.name} / ${variant.optionValue}`,
            priceCents: variant.priceCents,
            sku: variant.sku || product.sku,
          }));
        }

        return [
          {
            inventoryCount: product.inventoryCount,
            key: getLineKey(product.id),
            label: product.name,
            priceCents: product.priceCents,
            sku: product.sku,
          },
        ];
      }),
    [products],
  );

  return (
    <form action={formAction} className="soft-panel grid gap-5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-sky-500/12 text-sky-700">
          <ClipboardPlus aria-hidden="true" size={21} />
        </div>
        <h2 className="text-lg font-semibold text-slate-950">Create manual order</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="label">Customer name</span>
          <input className="field" name="customerName" placeholder="Mira Chen" />
          {state.errors?.customerName ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.customerName[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Email</span>
          <input
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

        <label className="grid gap-2">
          <span className="label">Phone</span>
          <input className="field" name="customerPhone" placeholder="+1 555 0100" />
          {state.errors?.customerPhone ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.customerPhone[0]}
            </span>
          ) : null}
        </label>
      </div>

      <fieldset className="grid gap-3">
        <legend className="label">Items</legend>
        <div className="max-h-72 overflow-auto rounded-[8px] border border-slate-200 bg-white/70">
          {lineOptions.map((option) => {
            const isSoldOut = option.inventoryCount <= 0;

            return (
              <div
                className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-slate-100 p-3 last:border-0 md:grid-cols-[auto_1fr_auto_auto]"
                key={option.key}
              >
                <input
                  className="h-4 w-4 accent-slate-950 disabled:opacity-40"
                  disabled={isSoldOut}
                  name="lineIds"
                  type="checkbox"
                  value={option.key}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {option.label}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {[option.sku, `${option.inventoryCount} in stock`]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </div>
                <span className="hidden text-sm font-semibold text-slate-950 md:inline">
                  {formatCurrency(option.priceCents, currency)}
                </span>
                <input
                  aria-label={`Quantity for ${option.label}`}
                  className="field h-10 w-20 py-2 text-sm"
                  defaultValue={1}
                  disabled={isSoldOut}
                  inputMode="numeric"
                  max={Math.max(1, option.inventoryCount)}
                  min={1}
                  name={`quantity:${option.key}`}
                  type="number"
                />
              </div>
            );
          })}
          {lineOptions.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No orderable products.</p>
          ) : null}
        </div>
        {state.errors?.lineIds ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.lineIds[0]}
          </span>
        ) : null}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="grid gap-2">
          <span className="label">Discount</span>
          <input className="field" inputMode="decimal" name="manualDiscount" placeholder="0.00" />
          {state.errors?.manualDiscount ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.manualDiscount[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Shipping</span>
          <input className="field" inputMode="decimal" name="manualShipping" placeholder="0.00" />
          {state.errors?.manualShipping ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.manualShipping[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Payment status</span>
          <select className="field" defaultValue="pending" name="paymentStatus">
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
        </label>

        <label className="grid gap-2">
          <span className="label">Payment method</span>
          <select className="field" defaultValue="manual_invoice" name="paymentMethod">
            <option value="manual_invoice">Manual invoice</option>
            <option value="bank_transfer">Bank transfer</option>
            <option value="cash_on_delivery">Cash on delivery</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Payment provider</span>
          <input className="field" name="paymentProvider" placeholder="Manual" />
        </label>

        <label className="grid gap-2">
          <span className="label">Payment reference</span>
          <input className="field" name="paymentReference" placeholder="Receipt or transfer id" />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Address</span>
          <input className="field" name="shippingAddressLine1" placeholder="121 Commerce Street" />
        </label>

        <label className="grid gap-2">
          <span className="label">Apartment, suite</span>
          <input className="field" name="shippingAddressLine2" placeholder="Suite 4B" />
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="grid gap-2">
          <span className="label">City</span>
          <input className="field" name="shippingCity" placeholder="Austin" />
        </label>

        <label className="grid gap-2">
          <span className="label">State / region</span>
          <input className="field" name="shippingRegion" placeholder="TX" />
        </label>

        <label className="grid gap-2">
          <span className="label">Postal code</span>
          <input className="field" name="shippingPostalCode" placeholder="78701" />
        </label>

        <label className="grid gap-2">
          <span className="label">Country</span>
          <input className="field" name="shippingCountry" placeholder="United States" />
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Internal note</span>
        <textarea
          className="field min-h-24 resize-y"
          name="internalNote"
          placeholder="Staff note, invoice context, or special handling"
        />
      </label>

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

      <button className="primary-button w-fit px-4 text-sm" disabled={pending} type="submit">
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <ClipboardPlus aria-hidden="true" size={18} />
        )}
        Create order
      </button>
    </form>
  );
}
