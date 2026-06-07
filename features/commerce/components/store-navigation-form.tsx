"use client";

import { useActionState } from "react";
import { Loader2, Navigation, Save } from "lucide-react";

import { initialActionState } from "@/features/commerce/action-state";
import { updateStoreNavigationAction } from "@/features/commerce/actions";
import {
  formatNavigationMenuLines,
  getNavigationMenu,
} from "@/features/commerce/navigation";
import type { StoreNavigationMenu } from "@/features/commerce/types";

export function StoreNavigationForm({
  menus,
  storeId,
}: {
  menus: StoreNavigationMenu[];
  storeId: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateStoreNavigationAction.bind(null, storeId),
    initialActionState,
  );
  const headerMenu = getNavigationMenu(menus, "header");
  const footerMenu = getNavigationMenu(menus, "footer");

  return (
    <section className="soft-panel overflow-hidden">
      <form action={formAction} className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-teal-500/12 text-teal-700">
              <Navigation aria-hidden="true" size={21} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Storefront navigation
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Header and footer links shown across the public store.
              </p>
            </div>
          </div>
          <button className="primary-button px-4 text-sm" disabled={pending} type="submit">
            {pending ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={18} />
            ) : (
              <Save aria-hidden="true" size={18} />
            )}
            Save menus
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="grid gap-2">
            <span className="label">Header links</span>
            <textarea
              className="field min-h-44 resize-y font-mono text-sm"
              defaultValue={formatNavigationMenuLines(headerMenu.links)}
              name="headerLinks"
              placeholder={"Shop | /stores/brand\nAbout | /stores/brand/pages/about"}
            />
            {state.errors?.headerLinks ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.headerLinks[0]}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="label">Footer links</span>
            <textarea
              className="field min-h-44 resize-y font-mono text-sm"
              defaultValue={formatNavigationMenuLines(footerMenu.links)}
              name="footerLinks"
              placeholder={
                "Refund policy | /stores/brand/policies/refund\nContact | mailto:support@example.com"
              }
            />
            {state.errors?.footerLinks ? (
              <span className="text-xs font-medium text-red-600">
                {state.errors.footerLinks[0]}
              </span>
            ) : null}
          </label>
        </div>

        <p className="text-xs font-medium leading-5 text-slate-500">
          Put one link per line as Label | URL. URLs can be store paths, https
          links, or mailto links.
        </p>

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
    </section>
  );
}
