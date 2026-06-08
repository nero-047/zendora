"use client";

import { useActionState } from "react";
import { Loader2, Search } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { lookupCustomerOrderAction } from "@/features/commerce/actions";

export function OrderLookupForm({ storeSlug }: { storeSlug: string }) {
  const [state, formAction, pending] = useActionState(
    lookupCustomerOrderAction.bind(null, storeSlug),
    initialActionState,
  );

  return (
    <form action={formAction} className="glass-panel grid gap-5 p-5 sm:p-6">
      <div>
        <span className="status-pill mb-4">
          <Search aria-hidden="true" size={14} />
          Order status
        </span>
        <h1 className="text-4xl font-semibold leading-tight text-slate-950">
          Find your order
        </h1>
      </div>

      <label className="grid gap-2">
        <span className="label">Order ID</span>
        <input
          autoComplete="off"
          className="field"
          name="orderId"
          placeholder="demo-order-1001"
        />
        {state.errors?.orderId ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.orderId[0]}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2">
        <span className="label">Email</span>
        <input
          autoComplete="email"
          className="field"
          name="customerEmail"
          placeholder="mira@example.com"
          type="email"
        />
        {state.errors?.customerEmail ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.customerEmail[0]}
          </span>
        ) : null}
      </label>

      {state.message ? (
        <p className="text-sm font-medium text-red-600">{state.message}</p>
      ) : null}

      <button
        className="primary-button w-full px-4 disabled:cursor-not-allowed disabled:opacity-55"
        disabled={pending}
        type="submit"
      >
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Search aria-hidden="true" size={18} />
        )}
        Find order
      </button>
    </form>
  );
}
