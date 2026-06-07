"use client";

import { useActionState } from "react";
import { Layers3, Loader2 } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { createCollectionAction } from "@/features/commerce/actions";
import type { Product } from "@/features/commerce/types";

export function CollectionForm({
  products,
  storeId,
}: {
  products: Product[];
  storeId: string;
}) {
  const [state, formAction, pending] = useActionState(
    createCollectionAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <form action={formAction} className="glass-panel grid gap-5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-sky-500/12 text-sky-700">
          <Layers3 aria-hidden="true" size={21} />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-slate-950">Create collection</h2>
          <p className="text-sm text-slate-500">Curate storefront groups.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Title</span>
          <input className="field" name="title" placeholder="Everyday Carry" />
          {state.errors?.title ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.title[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Status</span>
          <select className="field" defaultValue="draft" name="status">
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
          className="field min-h-24 resize-none"
          name="description"
          placeholder="A focused assortment for daily travel and work."
        />
        {state.errors?.description ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.description[0]}
          </span>
        ) : null}
      </label>

      <label className="grid gap-2">
        <span className="label">Image URL</span>
        <input
          className="field"
          name="imageUrl"
          placeholder="https://images.example/collection.jpg"
          type="url"
        />
        {state.errors?.imageUrl ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.imageUrl[0]}
          </span>
        ) : null}
      </label>

      <fieldset className="grid gap-3">
        <legend className="label">Products</legend>
        <div className="grid max-h-64 gap-2 overflow-auto rounded-[8px] border border-slate-200 bg-white/65 p-3">
          {products.map((product) => (
            <label
              className="flex items-center gap-3 text-sm font-medium text-slate-700"
              key={product.id}
            >
              <input
                className="h-4 w-4 accent-slate-950"
                name="productIds"
                type="checkbox"
                value={product.id}
              />
              <span className="min-w-0 truncate">{product.name}</span>
            </label>
          ))}
          {products.length === 0 ? (
            <p className="text-sm text-slate-500">Add products before collections.</p>
          ) : null}
        </div>
        {state.errors?.productIds ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.productIds[0]}
          </span>
        ) : null}
      </fieldset>

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
          <Layers3 aria-hidden="true" size={18} />
        )}
        Save collection
      </button>
    </form>
  );
}
