"use client";

import { useActionState } from "react";
import { Gift, Loader2, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateGiftCardAction } from "@/features/commerce/actions";
import {
  giftCardStatusLabels,
  maskGiftCardCode,
} from "@/features/commerce/gift-cards";
import type { GiftCard } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type GiftCardManagementFormProps = {
  giftCard: GiftCard;
  storeId: string;
};

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

export function GiftCardManagementForm({
  giftCard,
  storeId,
}: GiftCardManagementFormProps) {
  const [state, formAction, pending] = useActionState(
    updateGiftCardAction.bind(null, storeId, giftCard.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="border-b border-slate-100 p-4 last:border-0">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-pink-500/10 text-pink-700">
          <Gift aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">
              {maskGiftCardCode(giftCard.code)}
            </p>
            <span className="status-pill">
              {giftCardStatusLabels[giftCard.status]}
            </span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-700">
            {formatCurrency(giftCard.balanceCents, giftCard.currency)} /{" "}
            {formatCurrency(giftCard.initialBalanceCents, giftCard.currency)}{" "}
            remaining
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">
            {[giftCard.recipientEmail, giftCard.expiresAt
              ? `expires ${new Date(giftCard.expiresAt).toLocaleDateString("en-US")}`
              : null]
              .filter(Boolean)
              .join(" / ") || "No recipient"}
          </p>
          {giftCard.redemptions.length > 0 ? (
            <p className="mt-2 text-xs font-medium text-slate-500">
              {giftCard.redemptions.length} redemptions / last{" "}
              {new Date(giftCard.redemptions[0].createdAt).toLocaleDateString("en-US")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Recipient email
          <input
            autoComplete="email"
            className="field"
            defaultValue={giftCard.recipientEmail || ""}
            name="recipientEmail"
            type="email"
          />
          {state.errors?.recipientEmail ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.recipientEmail[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Status
          <select
            className="field min-w-36"
            defaultValue={giftCard.status}
            name="status"
          >
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
            <option value="expired">Expired</option>
          </select>
          {state.errors?.status ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.status[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Expires
          <input
            className="field"
            defaultValue={toDateTimeLocalValue(giftCard.expiresAt)}
            name="expiresAt"
            type="datetime-local"
          />
          {state.errors?.expiresAt ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.expiresAt[0]}
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
            Save gift card
          </button>
        </div>
      </div>

      <label className="mt-3 grid gap-1 text-sm font-semibold text-slate-700">
        Note
        <textarea
          className="field min-h-20 resize-y"
          defaultValue={giftCard.note || ""}
          name="note"
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
