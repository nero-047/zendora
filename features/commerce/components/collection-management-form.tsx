"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ExternalLink, Layers3, Loader2, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateCollectionAction } from "@/features/commerce/actions";
import type {
  Product,
  ProductCollection,
} from "@/features/commerce/types";

type CollectionManagementFormProps = {
  collection: ProductCollection;
  products: Product[];
  storeId: string;
  storeSlug: string;
};

export function CollectionManagementForm({
  collection,
  products,
  storeId,
  storeSlug,
}: CollectionManagementFormProps) {
  const [state, formAction, pending] = useActionState(
    updateCollectionAction.bind(null, storeId, collection.id),
    initialActionState,
  );
  const selectedProductIds = new Set(collection.productIds);

  return (
    <form action={formAction} className="border-b border-slate-100 p-4 last:border-0">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-sky-500/10 text-sky-700">
          <Layers3 aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-slate-950">{collection.title}</p>
            <span className="status-pill">{collection.status}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {collection.productCount} products / {collection.slug}
          </p>
          {collection.description ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
              {collection.description}
            </p>
          ) : null}
          {collection.status === "active" ? (
            <Link
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-sky-700"
              href={`/stores/${storeSlug}/collections/${collection.slug}`}
            >
              <ExternalLink aria-hidden="true" size={14} />
              View collection
            </Link>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Title
          <input className="field" defaultValue={collection.title} name="title" />
          {state.errors?.title ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.title[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Status
          <select
            className="field min-w-36"
            defaultValue={collection.status}
            name="status"
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          {state.errors?.status ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.status[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Description
          <textarea
            className="field min-h-20 resize-y"
            defaultValue={collection.description}
            name="description"
          />
          {state.errors?.description ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.description[0]}
            </span>
          ) : null}
        </label>
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          Image URL
          <input
            className="field"
            defaultValue={collection.imageUrl || ""}
            name="imageUrl"
            type="url"
          />
          {state.errors?.imageUrl ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.imageUrl[0]}
            </span>
          ) : null}
        </label>
      </div>

      <fieldset className="mt-3 grid gap-2">
        <legend className="label">Products</legend>
        <div className="grid max-h-48 gap-2 overflow-auto rounded-[8px] border border-slate-200 bg-white/65 p-3">
          {products.map((product) => (
            <label
              className="flex items-center gap-3 text-sm font-medium text-slate-700"
              key={product.id}
            >
              <input
                className="h-4 w-4 accent-slate-950"
                defaultChecked={selectedProductIds.has(product.id)}
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
          Save collection
        </button>
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
      </div>
    </form>
  );
}
