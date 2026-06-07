"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ExternalLink, FileText, Loader2, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateStorePoliciesAction } from "@/features/commerce/actions";
import {
  getDefaultPolicyTitle,
  getPolicyHref,
  storePolicyDescriptions,
  storePolicyLabels,
  storePolicyTypes,
} from "@/features/commerce/policies";
import type { StorePolicy } from "@/features/commerce/types";

export function StorePoliciesForm({
  policies,
  storeId,
  storeSlug,
}: {
  policies: StorePolicy[];
  storeId: string;
  storeSlug: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateStorePoliciesAction.bind(null, storeId),
    initialActionState,
  );
  const policiesByType = new Map(
    policies.map((policy) => [policy.type, policy]),
  );

  return (
    <form action={formAction} className="soft-panel grid gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-emerald-500/12 text-emerald-700">
            <FileText aria-hidden="true" size={21} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Storefront policies
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Refunds, shipping, privacy, and terms.
            </p>
          </div>
        </div>
        <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" size={18} />
          ) : (
            <Save aria-hidden="true" size={18} />
          )}
          Save policies
        </button>
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

      <div className="grid gap-4 xl:grid-cols-2">
        {storePolicyTypes.map((type) => {
          const policy = policiesByType.get(type);
          const href = getPolicyHref(storeSlug, type);

          return (
            <section className="grid gap-3 rounded-[8px] border border-slate-200 bg-white/62 p-4" key={type}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">
                    {storePolicyLabels[type]}
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {storePolicyDescriptions[type]}
                  </p>
                </div>
                {policy?.status === "published" ? (
                  <Link className="secondary-button min-h-10 px-3 text-sm" href={href}>
                    <ExternalLink aria-hidden="true" size={16} />
                    View
                  </Link>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                <label className="grid gap-2">
                  <span className="label">Title</span>
                  <input
                    className="field"
                    defaultValue={policy?.title || getDefaultPolicyTitle(type)}
                    name={`title:${type}`}
                  />
                  {state.errors?.[`title:${type}`]?.[0] ? (
                    <span className="text-xs font-medium text-red-600">
                      {state.errors[`title:${type}`]?.[0]}
                    </span>
                  ) : null}
                </label>

                <label className="grid gap-2">
                  <span className="label">Status</span>
                  <select
                    className="field"
                    defaultValue={policy?.status || "draft"}
                    name={`status:${type}`}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                  {state.errors?.[`status:${type}`]?.[0] ? (
                    <span className="text-xs font-medium text-red-600">
                      {state.errors[`status:${type}`]?.[0]}
                    </span>
                  ) : null}
                </label>
              </div>

              <label className="grid gap-2">
                <span className="label">Body</span>
                <textarea
                  className="field min-h-44 resize-y"
                  defaultValue={policy?.body || ""}
                  name={`body:${type}`}
                />
                {state.errors?.[`body:${type}`]?.[0] ? (
                  <span className="text-xs font-medium text-red-600">
                    {state.errors[`body:${type}`]?.[0]}
                  </span>
                ) : null}
              </label>
            </section>
          );
        })}
      </div>
    </form>
  );
}
