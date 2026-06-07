"use client";

import { useActionState } from "react";
import { Loader2, Save, Truck } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateShippingZoneAction } from "@/features/commerce/actions";
import type { ShippingZone } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type ShippingZoneManagementFormProps = {
  currency: string;
  shippingZone: ShippingZone;
  storeId: string;
};

export function ShippingZoneManagementForm({
  currency,
  shippingZone,
  storeId,
}: ShippingZoneManagementFormProps) {
  const [state, formAction, pending] = useActionState(
    updateShippingZoneAction.bind(null, storeId, shippingZone.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="border-b border-slate-100 p-4 last:border-0">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-indigo-500/10 text-indigo-700">
          <Truck aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">{shippingZone.name}</p>
            <span className="status-pill">{shippingZone.status}</span>
          </div>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {formatCurrency(shippingZone.rateCents, currency)}
            {shippingZone.freeShippingThresholdCents > 0
              ? ` / free at ${formatCurrency(shippingZone.freeShippingThresholdCents, currency)}`
              : ""}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">
            {shippingZone.countries.join(", ")}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Zone name
          <input className="field" defaultValue={shippingZone.name} name="name" />
          {state.errors?.name ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.name[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Status
          <select
            className="field min-w-36"
            defaultValue={shippingZone.status}
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

      <label className="mt-3 grid gap-1 text-sm font-semibold text-slate-700">
        Countries
        <textarea
          className="field min-h-20 resize-y"
          defaultValue={shippingZone.countries.join(", ")}
          name="countries"
        />
        {state.errors?.countries ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.countries[0]}
          </span>
        ) : null}
      </label>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Rate
          <input
            className="field"
            defaultValue={(shippingZone.rateCents / 100).toFixed(2)}
            inputMode="decimal"
            name="rate"
          />
          {state.errors?.rate ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.rate[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Free shipping at
          <input
            className="field"
            defaultValue={
              shippingZone.freeShippingThresholdCents > 0
                ? (shippingZone.freeShippingThresholdCents / 100).toFixed(2)
                : ""
            }
            inputMode="decimal"
            name="freeShippingThreshold"
          />
          {state.errors?.freeShippingThreshold ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.freeShippingThreshold[0]}
            </span>
          ) : null}
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
            Save zone
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
