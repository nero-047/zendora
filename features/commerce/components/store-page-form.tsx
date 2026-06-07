"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ExternalLink, FileText, Loader2, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import {
  createStorePageAction,
  updateStorePageAction,
} from "@/features/commerce/actions";
import {
  getStorePageHref,
  storePageStatusLabels,
} from "@/features/commerce/store-pages";
import type { StorePage } from "@/features/commerce/types";

function StorePageEditor({
  page,
  storeId,
  storeSlug,
}: {
  page: StorePage;
  storeId: string;
  storeSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateStorePageAction.bind(null, storeId, page.id),
    initialActionState,
  );

  return (
    <form action={formAction} className="grid gap-3 border-t border-slate-100 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-950">{page.title}</h3>
            <span className="status-pill">
              {storePageStatusLabels[page.status]}
            </span>
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">
            /pages/{page.slug}
          </p>
        </div>
        {page.status === "published" ? (
          <Link
            className="secondary-button min-h-10 px-3 text-sm"
            href={getStorePageHref(storeSlug, page.slug)}
          >
            <ExternalLink aria-hidden="true" size={16} />
            View
          </Link>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_180px_150px]">
        <label className="grid gap-2">
          <span className="label">Title</span>
          <input className="field" defaultValue={page.title} name="title" />
          {state.errors?.title ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.title[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Slug</span>
          <input className="field" defaultValue={page.slug} name="slug" />
          {state.errors?.slug ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.slug[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">Status</span>
          <select className="field" defaultValue={page.status} name="status">
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
          {state.errors?.status ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.status[0]}
            </span>
          ) : null}
        </label>
      </div>

      <label className="grid gap-2">
        <span className="label">Body</span>
        <textarea
          className="field min-h-36 resize-y"
          defaultValue={page.body}
          name="body"
        />
        {state.errors?.body ? (
          <span className="text-xs font-medium text-red-600">
            {state.errors.body[0]}
          </span>
        ) : null}
      </label>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="label">SEO title</span>
          <input className="field" defaultValue={page.seoTitle || ""} name="seoTitle" />
          {state.errors?.seoTitle ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.seoTitle[0]}
            </span>
          ) : null}
        </label>

        <label className="grid gap-2">
          <span className="label">SEO description</span>
          <input
            className="field"
            defaultValue={page.seoDescription || ""}
            name="seoDescription"
          />
          {state.errors?.seoDescription ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.seoDescription[0]}
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
        <button className="secondary-button min-h-10 px-3 text-sm" disabled={pending} type="submit">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={16} />
          ) : (
            <Save aria-hidden="true" size={16} />
          )}
          Save
        </button>
      </div>
    </form>
  );
}

export function StorePageForm({
  pages,
  storeId,
  storeSlug,
}: {
  pages: StorePage[];
  storeId: string;
  storeSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    createStorePageAction.bind(null, storeId),
    initialActionState,
  );

  return (
    <section className="soft-panel overflow-hidden">
      <form action={formAction} className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-cyan-500/12 text-cyan-700">
              <FileText aria-hidden="true" size={21} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Storefront pages
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                About, FAQ, sizing, and brand content.
              </p>
            </div>
          </div>
          <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : (
              <FileText aria-hidden="true" size={18} />
            )}
            Create page
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_180px_150px]">
          <label className="grid gap-2">
            <span className="label">Title</span>
            <input className="field" name="title" placeholder="About us" />
            {state.errors?.title ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.title[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">Slug</span>
            <input className="field" name="slug" placeholder="about" />
            {state.errors?.slug ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.slug[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">Status</span>
            <select className="field" defaultValue="draft" name="status">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
            {state.errors?.status ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.status[0]}
              </span>
            ) : null}
          </label>
        </div>

        <label className="grid gap-2">
          <span className="label">Body</span>
          <textarea
            className="field min-h-32 resize-y"
            name="body"
            placeholder="Write the page content."
          />
          {state.errors?.body ? (
            <span className="text-xs font-medium text-red-600">
              {state.errors.body[0]}
            </span>
          ) : null}
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-2">
            <span className="label">SEO title</span>
            <input className="field" name="seoTitle" />
            {state.errors?.seoTitle ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.seoTitle[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">SEO description</span>
            <input className="field" name="seoDescription" />
            {state.errors?.seoDescription ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.seoDescription[0]}
              </span>
            ) : null}
          </label>
        </div>

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

      {pages.length > 0 ? (
        pages.map((page) => (
          <StorePageEditor
            key={page.id}
            page={page}
            storeId={storeId}
            storeSlug={storeSlug}
          />
        ))
      ) : (
        <p className="border-t border-slate-100 p-4 text-sm text-slate-500">
          No storefront pages yet.
        </p>
      )}
    </section>
  );
}
