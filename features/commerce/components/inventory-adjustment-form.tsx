"use client";

import { useActionState } from "react";
import { Boxes, Loader2, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { adjustInventoryAction } from "@/features/commerce/actions";
import type { Product } from "@/features/commerce/types";

export function InventoryAdjustmentForm({
  product,
  storeId,
}: {
  product: Product;
  storeId: string;
}) {
  const [state, formAction, pending] = useActionState(
    adjustInventoryAction.bind(null, storeId, product.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="soft-panel grid gap-4 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-sky-500/10 text-sky-700">
          <Boxes aria-hidden="true" size={18} />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Adjust inventory
          </h2>
          <p className="text-sm text-slate-500">
            Current stock: {product.inventoryCount}
          </p>
        </div>
      </div>

      <label className="grid gap-2">
        <span className="label">Adjustment</span>
        <input
          className="field"
          inputMode="numeric"
          name="delta"
          placeholder="+10 or -2"
        />
        {state.errors?.delta ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.delta[0]}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2">
        <span className="label">Reason</span>
        <select className="field" defaultValue="restock" name="reason">
          <option value="restock">Restock</option>
          <option value="correction">Correction</option>
          <option value="damage">Damage</option>
          <option value="return">Return</option>
        </select>
        {state.errors?.reason ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.reason[0]}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2">
        <span className="label">Reference</span>
        <input className="field" name="reference" placeholder="PO, RMA, count id" />
        {state.errors?.reference ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.reference[0]}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2">
        <span className="label">Note</span>
        <textarea
          className="field min-h-24 resize-y"
          name="note"
          placeholder="What changed and why"
        />
        {state.errors?.note ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.note[0]}
          </span>
        ) : null}
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

      <button className="secondary-button w-fit px-4 text-sm" disabled={pending} type="submit">
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <Save aria-hidden="true" size={16} />
        )}
        Save adjustment
      </button>
    </form>
  );
}
