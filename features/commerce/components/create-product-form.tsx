"use client";

import { useActionState } from "react";
import { ImagePlus, Loader2, PackagePlus } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createProductAction } from "@/features/commerce/actions";

export function CreateProductForm({ storeId }: { storeId: string }) {
  const [state, formAction, pending] = useActionState(
    createProductAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <form action={formAction} className="glass-panel grid gap-5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-emerald-500/12 text-emerald-700">
          <PackagePlus aria-hidden="true" size={21} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-950">Add product</h1>
          <p className="text-sm text-slate-500">Images upload to Supabase Storage.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Product name</span>
          <input className="field" name="name" placeholder="Field Carry Pack" />
          {state.errors?.name ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.name[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Status</span>
          <select className="field" name="status" defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
          {state.errors?.status ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.status[0]}
            </span>
          ) : null}
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Description</span>
        <textarea
          className="field min-h-28 resize-none"
          name="description"
          placeholder="Weather-resistant day pack with a structured laptop sleeve."
        />
        {state.errors?.description ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.description[0]}
          </span>
        ) : null}
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Price</span>
          <input className="field" name="price" placeholder="129.00" inputMode="decimal" />
          {state.errors?.price ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.price[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Inventory</span>
          <input className="field" name="inventory" defaultValue="24" inputMode="numeric" />
          {state.errors?.inventory ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.inventory[0]}
            </span>
          ) : null}
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Image</span>
        <div className="field flex items-center gap-3 p-3">
          <ImagePlus aria-hidden="true" className="shrink-0 text-slate-400" size={20} />
          <input
            className="w-full text-sm file:mr-4 file:rounded-[8px] file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
            name="image"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
          />
        </div>
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
          <PackagePlus aria-hidden="true" size={18} />
        )}
        Save product
      </button>
    </form>
  );
}
