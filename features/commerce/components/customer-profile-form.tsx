"use client";

import { useActionState } from "react";
import { Loader2, Mail, Save, Tags, UserRound } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { upsertCustomerProfileAction } from "@/features/commerce/actions";
import { formatCustomerTags } from "@/features/commerce/customers";
import type { CustomerSummary } from "@/features/commerce/types";

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <span className="text-xs font-medium text-red-600">{message}</span>;
}

export function CustomerProfileForm({
  customer,
  storeId,
}: {
  customer?: CustomerSummary;
  storeId: string;
}) {
  const [state, formAction, pending] = useActionState(
    upsertCustomerProfileAction.bind(null, storeId),
    initialActionState,
  );
  const hasCustomer = Boolean(customer?.email);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-sky-500/12 text-sky-700">
            <UserRound aria-hidden="true" size={21} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              {hasCustomer ? "Customer profile" : "New customer"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Contact details, tags, and merchant notes.
            </p>
          </div>
        </div>
        <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
          ) : (
            <Save aria-hidden="true" size={18} />
          )}
          Save profile
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Email</span>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              className="field pl-9"
              defaultValue={customer?.email || ""}
              name="email"
              readOnly={hasCustomer}
            />
          </div>
          <FieldError message={state.errors?.email?.[0]} />
        </label>

        <label className="grid gap-2">
          <span className="label">Name</span>
          <input className="field" defaultValue={customer?.name || ""} name="name" />
          <FieldError message={state.errors?.name?.[0]} />
        </label>

        <label className="grid gap-2">
          <span className="label">Phone</span>
          <input className="field" defaultValue={customer?.phone || ""} name="phone" />
          <FieldError message={state.errors?.phone?.[0]} />
        </label>

        <label className="grid gap-2">
          <span className="label">Tags</span>
          <div className="relative">
            <Tags
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={16}
            />
            <input
              className="field pl-9"
              defaultValue={formatCustomerTags(customer?.tags || [])}
              name="tags"
              placeholder="vip, wholesale"
            />
          </div>
          <FieldError message={state.errors?.tags?.[0]} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input
            className="h-4 w-4 accent-sky-700"
            defaultChecked={customer?.acceptsMarketing || false}
            name="acceptsMarketing"
            type="checkbox"
          />
          Accepts marketing
        </label>
        <label className="flex min-h-12 items-center gap-3 rounded-[8px] border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
          <input
            className="h-4 w-4 accent-sky-700"
            defaultChecked={customer?.taxExempt || false}
            name="taxExempt"
            type="checkbox"
          />
          Tax exempt
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Merchant note</span>
        <textarea
          className="field min-h-28 resize-y"
          defaultValue={customer?.note || ""}
          name="note"
        />
        <FieldError message={state.errors?.note?.[0]} />
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
    </form>
  );
}
