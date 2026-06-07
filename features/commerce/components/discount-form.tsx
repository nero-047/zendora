"use client";

import { useActionState } from "react";
import { Loader2, Percent, Plus } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createDiscountAction } from "@/features/commerce/actions";

export function DiscountForm({ storeId }: { storeId: string }) {
  const [state, formAction, pending] = useActionState(
    createDiscountAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <form action={formAction} className="soft-panel grid gap-4 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-emerald-500/12 text-emerald-700">
          <Percent aria-hidden="true" size={21} />
        </div>
        <h2 className="text-lg font-semibold text-slate-950">Discounts</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="label">Code</span>
          <input className="field uppercase" name="code" placeholder="WELCOME10" />
          {state.errors?.code ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.code[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Type</span>
          <select className="field" defaultValue="percent" name="type">
            <option value="percent">Percent</option>
            <option value="fixed">Fixed amount</option>
          </select>
          {state.errors?.type ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.type[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Value</span>
          <input className="field" inputMode="decimal" name="value" placeholder="10" />
          {state.errors?.value ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.value[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="grid gap-2">
          <span className="label">Minimum subtotal</span>
          <input className="field" inputMode="decimal" name="minSubtotal" placeholder="50.00" />
          {state.errors?.minSubtotal ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.minSubtotal[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Usage limit</span>
          <input className="field" inputMode="numeric" name="usageLimit" placeholder="100" />
          {state.errors?.usageLimit ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.usageLimit[0]}
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

        <div className="grid content-end">
          <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : (
              <Plus aria-hidden="true" size={18} />
            )}
            Add discount
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Starts at</span>
          <input className="field" name="startsAt" type="datetime-local" />
        </label>

        <label className="grid gap-2">
          <span className="label">Ends at</span>
          <input className="field" name="endsAt" type="datetime-local" />
        </label>
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
