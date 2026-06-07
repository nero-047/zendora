"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateReturnRequestStatusAction } from "@/features/commerce/actions";
import {
  returnRequestStatusLabels,
  returnRequestStatuses,
} from "@/features/commerce/returns";
import type { OrderReturnRequest } from "@/features/commerce/types";

type ReturnRequestStatusFormProps = {
  orderId: string;
  request: OrderReturnRequest;
  storeId: string;
};

export function ReturnRequestStatusForm({
  orderId,
  request,
  storeId,
}: ReturnRequestStatusFormProps) {
  const [state, formAction, pending] = useActionState(
    updateReturnRequestStatusAction.bind(null, storeId, orderId, request.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="mt-3 grid gap-3">
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Status
        <select
          className="field"
          defaultValue={request.status}
          disabled={pending}
          name="status"
        >
          {returnRequestStatuses.map((status) => (
            <option key={status} value={status}>
              {returnRequestStatusLabels[status]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Merchant note
        <textarea
          className="field min-h-20 resize-y"
          defaultValue={request.merchantNote || ""}
          disabled={pending}
          name="merchantNote"
          placeholder="Approval, rejection, inspection, or refund notes"
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
      <button
        className="secondary-button w-fit px-4 text-sm disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <CheckCircle aria-hidden="true" size={16} />
        )}
        Save return status
      </button>
    </form>
  );
}
