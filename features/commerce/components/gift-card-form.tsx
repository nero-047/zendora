"use client";

import { Gift, Loader2 } from "lucide-react";
import { useActionState } from "react";

import { initialActionState } from "@/features/commerce/action-state";
import { createGiftCardAction } from "@/features/commerce/actions";

type GiftCardFormProps = {
  storeId: string;
};

export function GiftCardForm({ storeId }: GiftCardFormProps) {
  const [state, formAction, pending] = useActionState(
    createGiftCardAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <form action={formAction} className="soft-panel grid gap-4 p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
        <Gift aria-hidden="true" size={18} />
        Issue gift card
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Amount</span>
          <input className="field" name="amount" placeholder="50.00" />
          {state.errors?.amount ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.amount[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-2">
          <span className="label">Code</span>
          <input className="field uppercase" name="code" placeholder="Auto" />
          {state.errors?.code ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.code[0]}
            </span>
          ) : null}
        </label>
      </div>
      <label className="grid gap-2">
        <span className="label">Recipient email</span>
        <input
          autoComplete="email"
          className="field"
          name="recipientEmail"
          placeholder="customer@example.com"
          type="email"
        />
        {state.errors?.recipientEmail ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.recipientEmail[0]}
          </span>
        ) : null}
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Expires</span>
          <input className="field" name="expiresAt" type="datetime-local" />
          {state.errors?.expiresAt ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.expiresAt[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-2">
          <span className="label">Status</span>
          <select className="field" defaultValue="active" name="status">
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
      </div>
      <label className="grid gap-2">
        <span className="label">Note</span>
        <textarea
          className="field min-h-20 resize-y"
          name="note"
          placeholder="Internal note"
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
        className="primary-button w-fit px-4 text-sm disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={16} />
        ) : (
          <Gift aria-hidden="true" size={16} />
        )}
        Issue gift card
      </button>
    </form>
  );
}
