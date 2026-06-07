"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useActionState } from "react";

import { initialActionState } from "@/features/commerce/action-state";
import { createReturnRequestAction } from "@/features/commerce/actions";
import {
  returnRequestReasonLabels,
  returnRequestReasons,
} from "@/features/commerce/returns";

type ReturnRequestFormProps = {
  canRequest: boolean;
  orderId: string;
  storeSlug: string;
  token: string;
};

export function ReturnRequestForm({
  canRequest,
  orderId,
  storeSlug,
  token,
}: ReturnRequestFormProps) {
  const [state, formAction, pending] = useActionState(
    createReturnRequestAction.bind(null, storeSlug, orderId),
    initialActionState,
  );

  return (
    <form action={formAction} className="grid gap-3">
      <input name="token" type="hidden" value={token} />
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Reason
        <select
          className="field"
          defaultValue="changed_mind"
          disabled={!canRequest || pending}
          name="reason"
        >
          {returnRequestReasons.map((reason) => (
            <option key={reason} value={reason}>
              {returnRequestReasonLabels[reason]}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        Details
        <textarea
          className="field min-h-24 resize-y"
          disabled={!canRequest || pending}
          name="note"
          placeholder="Tell the merchant what you want to return and why."
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
        disabled={!canRequest || pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <RotateCcw aria-hidden="true" size={16} />
        )}
        Request return
      </button>
    </form>
  );
}
