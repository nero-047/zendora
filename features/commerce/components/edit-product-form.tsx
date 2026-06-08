"use client";

import { useActionState } from "react";
import { ImagePlus, Loader2, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateProductAction } from "@/features/commerce/actions";
import type { Product } from "@/features/commerce/types";

export function EditProductForm({
  product,
  storeId,
}: {
  product: Product;
  storeId: string;
}) {
  const variantOptionName = product.variants[0]?.optionName || "";
  const variantRows = product.variants
    .map((variant) =>
      [
        variant.optionValue,
        variant.sku || "",
        (variant.priceCents / 100).toFixed(2),
        variant.compareAtCents ? (variant.compareAtCents / 100).toFixed(2) : "",
        String(variant.inventoryCount),
        variant.status,
      ].join(" | "),
    )
    .join("\n");
  const [state, formAction, pending] = useActionState(
    updateProductAction.bind(null, storeId, product.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="glass-panel grid gap-5 p-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-950">Edit product</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">{product.name}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Product name</span>
          <input className="field" defaultValue={product.name} name="name" />
          {state.errors?.name ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.name[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Status</span>
          <select className="field" defaultValue={product.status} name="status">
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

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">SKU</span>
          <input className="field" defaultValue={product.sku} name="sku" />
          {state.errors?.sku ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.sku[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Category</span>
          <input className="field" defaultValue={product.category} name="category" />
          {state.errors?.category ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.category[0]}
            </span>
          ) : null}
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Description</span>
        <textarea
          className="field min-h-28 resize-none"
          defaultValue={product.description}
          name="description"
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
          <input
            className="field"
            defaultValue={(product.priceCents / 100).toFixed(2)}
            inputMode="decimal"
            name="price"
          />
          {state.errors?.price ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.price[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Compare-at price</span>
          <input
            className="field"
            defaultValue={
              product.compareAtCents
                ? (product.compareAtCents / 100).toFixed(2)
                : ""
            }
            inputMode="decimal"
            name="compareAtPrice"
          />
          {state.errors?.compareAtPrice ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.compareAtPrice[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">Inventory</span>
          <input
            className="field"
            defaultValue={product.inventoryCount}
            inputMode="numeric"
            name="inventory"
          />
          {state.errors?.inventory ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.inventory[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-[0.45fr_1fr]">
        <label className="grid gap-2">
          <span className="label">Option</span>
          <input
            className="field"
            defaultValue={variantOptionName}
            name="variantOptionName"
            placeholder="Color"
          />
          {state.errors?.variantOptionName ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.variantOptionName[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Variants</span>
          <textarea
            className="field min-h-28 resize-none"
            defaultValue={variantRows}
            name="variantRows"
            placeholder="Forest | NLS-BAG-001-FOR | 129.00 | 159.00 | 14 | active"
          />
          {state.errors?.variantRows ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.variantRows[0]}
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
          <Save aria-hidden="true" size={18} />
        )}
        Save product
      </button>
    </form>
  );
}
