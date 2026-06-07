"use client";

import { useActionState } from "react";
import { Loader2, Plus, Truck } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createShippingZoneAction } from "@/features/commerce/actions";

export function ShippingZoneForm({ storeId }: { storeId: string }) {
  const [state, formAction, pending] = useActionState(
    createShippingZoneAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <form action={formAction} className="soft-panel grid gap-4 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-indigo-500/12 text-indigo-700">
          <Truck aria-hidden="true" size={21} />
        </div>
        <h2 className="text-lg font-semibold text-slate-950">Shipping zones</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Zone name</span>
          <input className="field" name="name" placeholder="United States" />
          {state.errors?.name ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.name[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Status</span>
          <select className="field" defaultValue="active" name="status">
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

      <label className="grid gap-2">
        <span className="label">Countries</span>
        <textarea
          className="field min-h-24 resize-none"
          name="countries"
          placeholder="United States, US, USA"
        />
        {state.errors?.countries ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.countries[0]}
          </span>
        ) : null}
      </label>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-2">
          <span className="label">Rate</span>
          <input className="field" inputMode="decimal" name="rate" placeholder="7.99" />
          {state.errors?.rate ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.rate[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Free shipping at</span>
          <input
            className="field"
            inputMode="decimal"
            name="freeShippingThreshold"
            placeholder="150.00"
          />
          {state.errors?.freeShippingThreshold ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.freeShippingThreshold[0]}
            </span>
          ) : null}
        </label>

        <div className="grid content-end">
          <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : (
              <Plus aria-hidden="true" size={18} />
            )}
            Add zone
          </button>
        </div>
      </div>

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
    </form>
  );
}
