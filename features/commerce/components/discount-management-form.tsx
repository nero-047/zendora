"use client";

import { useActionState } from "react";
import { Loader2, Percent, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateDiscountAction } from "@/features/commerce/actions";
import type { Discount } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type DiscountManagementFormProps = {
  currency: string;
  discount: Discount;
  storeId: string;
};

function formatDiscountValue(discount: Discount, currency: string) {
  return discount.type === "percent"
    ? `${discount.value}% off`
    : `${formatCurrency(discount.value, currency)} off`;
}

function getDiscountValueInput(discount: Discount) {
  return discount.type === "fixed"
    ? (discount.value / 100).toFixed(2)
    : String(discount.value);
}

function toDateTimeLocalValue(value: string | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;

  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

export function DiscountManagementForm({
  currency,
  discount,
  storeId,
}: DiscountManagementFormProps) {
  const [state, formAction, pending] = useActionState(
    updateDiscountAction.bind(null, storeId, discount.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="border-b border-slate-100 p-4 last:border-0">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-emerald-500/10 text-emerald-700">
          <Percent aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">{discount.code}</p>
            <span className="status-pill">{discount.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatDiscountValue(discount, currency)}
            {discount.minSubtotalCents > 0
              ? ` / min ${formatCurrency(discount.minSubtotalCents, currency)}`
              : ""}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {discount.redemptionCount}
            {discount.usageLimit ? `/${discount.usageLimit}` : ""} redemptions
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Code
          <input
            className="field uppercase"
            defaultValue={discount.code}
            name="code"
          />
          {state.errors?.code ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.code[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Type
          <select className="field min-w-36" defaultValue={discount.type} name="type">
            <option value="percent">Percent</option>
            <option value="fixed">Fixed amount</option>
          </select>
          {state.errors?.type ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.type[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Value
          <input
            className="field min-w-28"
            defaultValue={getDiscountValueInput(discount)}
            inputMode="decimal"
            name="value"
          />
          {state.errors?.value ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.value[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Status
          <select
            className="field min-w-36"
            defaultValue={discount.status}
            name="status"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          {state.errors?.status ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.status[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Minimum subtotal
          <input
            className="field"
            defaultValue={
              discount.minSubtotalCents > 0
                ? (discount.minSubtotalCents / 100).toFixed(2)
                : ""
            }
            inputMode="decimal"
            name="minSubtotal"
          />
          {state.errors?.minSubtotal ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.minSubtotal[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Usage limit
          <input
            className="field"
            defaultValue={discount.usageLimit || ""}
            inputMode="numeric"
            name="usageLimit"
          />
          {state.errors?.usageLimit ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.usageLimit[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Starts at
          <input
            className="field"
            defaultValue={toDateTimeLocalValue(discount.startsAt)}
            name="startsAt"
            type="datetime-local"
          />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Ends at
          <input
            className="field"
            defaultValue={toDateTimeLocalValue(discount.endsAt)}
            name="endsAt"
            type="datetime-local"
          />
        </label>
        <div className="grid content-end">
          <button
            className="secondary-button min-h-10 px-3 text-sm"
            disabled={pending}
            type="submit"
          >
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={16} />
            ) : (
              <Save aria-hidden="true" size={16} />
            )}
            Save discount
          </button>
        </div>
      </div>

      {state.message ? (
        <p
          className={
            state.status === "error"
              ? "mt-3 text-sm font-medium text-red-600"
              : "mt-3 text-sm font-medium text-emerald-700"
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
