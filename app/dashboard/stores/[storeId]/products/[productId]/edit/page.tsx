import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  Download,
  Package,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { EditProductForm } from "@/features/commerce/components/edit-product-form";
import { InventoryAdjustmentForm } from "@/features/commerce/components/inventory-adjustment-form";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getInventoryPlanningSignals } from "@/features/commerce/inventory-planning";
import { getProductHealth } from "@/features/commerce/product-health";
import type { InventoryAdjustmentReason } from "@/features/commerce/types";

const adjustmentReasonLabels: Record<InventoryAdjustmentReason, string> = {
  restock: "Restock",
  correction: "Correction",
  damage: "Damage",
  return: "Return",
  manual_edit: "Product edit",
};

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ storeId: string; productId: string }>;
}) {
  const { storeId, productId } = await params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const product = workspace.products.find((item) => item.id === productId);

  if (!product) {
    notFound();
  }

  const inventoryAdjustments = workspace.inventoryAdjustments.filter(
    (adjustment) => adjustment.productId === product.id,
  );
  const health = getProductHealth(product);
  const inventoryPlan = getInventoryPlanningSignals({
    products: [product],
    orders: workspace.orders,
    limit: 1,
  })[0];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="secondary-button w-fit px-4 text-sm"
          href={`/dashboard/stores/${workspace.store.id}/products`}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Products
        </Link>
        <Link
          className="secondary-button px-4 text-sm"
          href={`/dashboard/stores/${workspace.store.id}/products/${product.id}/export`}
        >
          <Download aria-hidden="true" size={16} />
          Export CSV
        </Link>
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <EditProductForm product={product} storeId={workspace.store.id} />

        <div className="grid gap-5">
          <section className="soft-panel p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-sky-500/10 text-sky-700">
                {health.status === "ready" ? (
                  <ShieldCheck aria-hidden="true" size={18} />
                ) : (
                  <TriangleAlert aria-hidden="true" size={18} />
                )}
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Catalog health
                </h2>
                <p className="text-sm text-slate-500">{health.label}</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              {health.nextAction}
            </p>
            {health.issues.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {health.issues.slice(0, 5).map((issue) => (
                  <div
                    className="rounded-[8px] border border-slate-100 bg-white/70 p-3"
                    key={issue.id}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">
                        {issue.label}
                      </p>
                      <span className="status-pill">{issue.severity}</span>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {issue.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="soft-panel p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-emerald-500/10 text-emerald-700">
                <Package aria-hidden="true" size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  Inventory
                </h2>
                <p className="text-sm text-slate-500">
                  {product.inventoryCount} in stock
                </p>
              </div>
            </div>
            {inventoryPlan ? (
              <div className="mt-4 rounded-[8px] border border-slate-100 bg-white/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">
                    {inventoryPlan.label}
                  </p>
                  <span className="status-pill">
                    {inventoryPlan.salesVelocityPerDay}/day
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {inventoryPlan.detail}
                </p>
              </div>
            ) : null}
          </section>

          {product.variants.length > 0 ? (
            <section className="soft-panel overflow-hidden">
              <div className="border-b border-slate-100 p-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                  <Boxes aria-hidden="true" size={18} />
                  Variants
                </h2>
              </div>
              {product.variants.map((variant) => (
                <div
                  className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 p-4 last:border-0"
                  key={variant.id}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {variant.optionName}: {variant.optionValue}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">
                      {[variant.sku, variant.status].filter(Boolean).join(" / ")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-700">
                    {variant.inventoryCount}
                  </p>
                </div>
              ))}
            </section>
          ) : null}

          <InventoryAdjustmentForm product={product} storeId={workspace.store.id} />

          <section className="soft-panel overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Boxes aria-hidden="true" size={18} />
                Inventory history
              </h2>
            </div>
            {inventoryAdjustments.length > 0 ? (
              inventoryAdjustments.slice(0, 8).map((adjustment) => (
                <div
                  className="border-b border-slate-100 p-4 last:border-0"
                  key={adjustment.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {adjustmentReasonLabels[adjustment.reason]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(adjustment.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={
                        adjustment.delta > 0
                          ? "text-sm font-semibold text-emerald-700"
                          : "text-sm font-semibold text-red-600"
                      }
                    >
                      {adjustment.delta > 0 ? "+" : ""}
                      {adjustment.delta}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {adjustment.previousInventory} to {adjustment.nextInventory}
                    {adjustment.reference ? ` / ${adjustment.reference}` : ""}
                  </p>
                  {adjustment.note ? (
                    <p className="mt-2 rounded-[8px] bg-slate-50 p-3 text-sm text-slate-600">
                      {adjustment.note}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">
                No inventory adjustments recorded yet.
              </p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
