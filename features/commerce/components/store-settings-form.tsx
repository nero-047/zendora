"use client";

import { useActionState, useState } from "react";
import { Loader2, Save, Store as StoreIcon } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateStoreAction } from "@/features/commerce/actions";
import type { Store } from "@/features/commerce/types";

export function StoreSettingsForm({ store }: { store: Store }) {
  const [themeColor, setThemeColor] = useState(store.themeColor);
  const [state, formAction, pending] = useActionState(
    updateStoreAction.bind(null, store.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="soft-panel grid gap-5 p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-sky-500/12 text-sky-700">
          <StoreIcon aria-hidden="true" size={21} />
        </div>
        <h2 className="text-lg font-semibold text-slate-950">Store settings</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="grid gap-2">
          <span className="label">Store name</span>
          <input className="field" defaultValue={store.name} name="name" />
          {state.errors?.name ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.name[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Currency</span>
          <input
            className="field uppercase"
            defaultValue={store.currency}
            maxLength={3}
            name="currency"
          />
          {state.errors?.currency ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.currency[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Status</span>
          <select className="field" defaultValue={store.status} name="status">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
          {state.errors?.status ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.status[0]}
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
      </div>

      <label className="grid gap-2">
        <span className="label">Description</span>
        <textarea
          className="field min-h-24 resize-none"
          defaultValue={store.description}
          name="description"
        />
        {state.errors?.description ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.description[0]}
          </span>
        ) : null}
      </label>

      <section className="grid gap-4 rounded-[8px] border border-slate-200 bg-white/58 p-4">
        <div>
          <h3 className="font-semibold text-slate-950">Search and sharing</h3>
          <p className="mt-1 text-sm text-slate-500">
            Control storefront titles, descriptions, and social previews.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="label">SEO title</span>
            <input
              className="field"
              defaultValue={store.seoTitle || ""}
              maxLength={70}
              name="seoTitle"
              placeholder={store.name}
            />
            {state.errors?.seoTitle ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.seoTitle[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">Social image URL</span>
            <input
              className="field"
              defaultValue={store.socialImageUrl || ""}
              name="socialImageUrl"
              placeholder="https://..."
              type="url"
            />
            {state.errors?.socialImageUrl ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.socialImageUrl[0]}
              </span>
            ) : null}
          </label>
        </div>

        <label className="grid gap-2">
          <span className="label">SEO description</span>
          <textarea
            className="field min-h-20 resize-none"
            defaultValue={store.seoDescription || ""}
            maxLength={180}
            name="seoDescription"
            placeholder={store.description || "Describe this storefront for search results."}
          />
          {state.errors?.seoDescription ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.seoDescription[0]}
            </span>
          ) : null}
        </label>
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-2">
          <span className="label">Shipping rate</span>
          <input
            className="field"
            defaultValue={(store.shippingRateCents / 100).toFixed(2)}
            inputMode="decimal"
            name="shippingRate"
            placeholder="7.99"
          />
          {state.errors?.shippingRate ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.shippingRate[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Free shipping at</span>
          <input
            className="field"
            defaultValue={(store.freeShippingThresholdCents / 100).toFixed(2)}
            inputMode="decimal"
            name="freeShippingThreshold"
            placeholder="150.00"
          />
          {state.errors?.freeShippingThreshold ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.freeShippingThreshold[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Tax rate %</span>
          <input
            className="field"
            defaultValue={(store.taxRateBps / 100).toFixed(2)}
            inputMode="decimal"
            name="taxRate"
            placeholder="8.25"
          />
          {state.errors?.taxRate ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.taxRate[0]}
            </span>
          ) : null}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
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
        ) : (
          <span />
        )}

        <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
          ) : (
            <Save aria-hidden="true" size={18} />
          )}
          Save settings
        </button>
      </div>
    </form>
  );
}
