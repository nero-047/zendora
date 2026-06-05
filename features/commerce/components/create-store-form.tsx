"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Store } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createStoreAction } from "@/features/commerce/actions";

export function CreateStoreForm() {
  const [themeColor, setThemeColor] = useState("#0f766e");
  const [state, formAction, pending] = useActionState(
    createStoreAction,
    initialActionState,
  );

  return (
    <form action={formAction} className="glass-panel grid gap-5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-sky-500/12 text-sky-700">
          <Store aria-hidden="true" size={21} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-950">Create store</h1>
          <p className="text-sm text-slate-500">Each account can own multiple storefronts.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Store name</span>
          <input className="field" name="name" placeholder="Northline Supply" />
          {state.errors?.name ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.name[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Currency</span>
          <input className="field" name="currency" defaultValue="USD" maxLength={3} />
          {state.errors?.currency ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.currency[0]}
            </span>
          ) : null}
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Description</span>
        <textarea
          className="field min-h-28 resize-none"
          name="description"
          placeholder="A premium store for field-tested everyday gear."
        />
        {state.errors?.description ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.description[0]}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2">
        <span className="label">Theme color</span>
        <div className="flex gap-3">
          <input
            aria-label="Theme color picker"
            className="h-11 w-14 rounded-[8px] border border-slate-200 bg-white p-1"
            onChange={(event) => setThemeColor(event.target.value)}
            type="color"
            value={themeColor}
          />
          <input
            className="field"
            name="themeColor"
            onChange={(event) => setThemeColor(event.target.value)}
            value={themeColor}
          />
        </div>
        {state.errors?.themeColor ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.themeColor[0]}
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

      <button className="primary-button px-4" disabled={pending} type="submit">
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" size={18} />
        ) : (
          <Plus aria-hidden="true" size={18} />
        )}
        Create store
      </button>
    </form>
  );
}
