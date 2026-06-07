"use client";

import { useActionState } from "react";
import { BanknoteArrowDown, Loader2 } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createRefundAction } from "@/features/commerce/actions";
import type { Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export function RefundForm({
  order,
  storeId,
}: {
  order: Order;
  storeId: string;
}) {
  const [state, formAction, pending] = useActionState(
    createRefundAction.bind(null, storeId, order.id),
    initialActionState,
  );
  const canRefund = order.refundableCents > 0;

  return (
    <form action={formAction} className="soft-panel grid gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Refund</h2>
          <p className="mt-1 text-sm text-slate-500">
            Available: {formatCurrency(order.refundableCents, order.currency)}
          </p>
        </div>
        <BanknoteArrowDown aria-hidden="true" className="text-sky-700" size={20} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Amount</span>
          <input
            className="field"
            disabled={!canRefund}
            inputMode="decimal"
            name="amount"
            placeholder={(order.refundableCents / 100).toFixed(2)}
          />
          {state.errors?.amount ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.amount[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Reason</span>
          <select className="field" disabled={!canRefund} name="reason">
            <option value="customer_request">Customer request</option>
            <option value="damaged">Damaged item</option>
            <option value="fraud">Fraud</option>
            <option value="other">Other</option>
          </select>
          {state.errors?.reason ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.reason[0]}
            </span>
          ) : null}
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Note</span>
        <textarea
          className="field min-h-24 resize-y"
          disabled={!canRefund}
          name="note"
          placeholder="Customer support context or payment reference"
        />
        {state.errors?.note ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.note[0]}
          </span>
        ) : null}
      </label>

      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input
          disabled={!canRefund || Boolean(order.inventoryRestockedAt)}
          name="restockInventory"
          type="checkbox"
        />
        Restock order inventory
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

      <button
        className="secondary-button w-fit px-4 text-sm"
        disabled={pending || !canRefund}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <BanknoteArrowDown aria-hidden="true" size={16} />
        )}
        Record refund
      </button>
    </form>
  );
}
