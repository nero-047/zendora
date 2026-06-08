import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Edit3,
  Filter,
  History,
  Package,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  filterInventoryPlanningSignals,
  getInventoryPlanningSignals,
  getInventoryPlanningStats,
  inventoryPlanningSortLabels,
  inventoryPlanningSortOptions,
  inventoryPlanningUrgencyFilterLabels,
  inventoryPlanningUrgencyFilters,
  parseInventoryPlanningSortOption,
  parseInventoryPlanningUrgencyFilter,
  readInventorySearchParam,
  type InventoryPlanningSignal,
} from "@/features/commerce/inventory-planning";
import {
  getProductEditHref,
  getProductStats,
} from "@/features/commerce/products";
import {
  buildDashboardExportHref,
  buildDashboardPageHref,
  dashboardPageSizeOptions,
  paginateItems,
  parseDashboardPage,
  parseDashboardPageSize,
} from "@/features/commerce/pagination";
import type { InventoryAdjustmentReason } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

const adjustmentReasonLabels: Record<InventoryAdjustmentReason, string> = {
  restock: "Restock",
  correction: "Correction",
  damage: "Damage",
  return: "Return",
  manual_edit: "Product edit",
};

function formatRunway(signal: InventoryPlanningSignal) {
  if (signal.urgency === "out_of_stock") {
    return "Now";
  }

  if (typeof signal.estimatedDaysUntilStockout === "number") {
    return `${signal.estimatedDaysUntilStockout} day${
      signal.estimatedDaysUntilStockout === 1 ? "" : "s"
    }`;
  }

  return "No paid velocity";
}

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{
    q?: string | string[];
    inventory?: string | string[];
    sort?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const { store, products, orders, inventoryAdjustments } = workspace;
  const productsById = new Map(products.map((product) => [product.id, product]));
  const searchQuery = readInventorySearchParam(query.q);
  const selectedUrgency = parseInventoryPlanningUrgencyFilter(query.inventory);
  const selectedSort = parseInventoryPlanningSortOption(query.sort);
  const selectedPage = parseDashboardPage(query.page);
  const selectedPageSize = parseDashboardPageSize(query.pageSize);
  const inventorySignals = getInventoryPlanningSignals({
    products,
    orders,
    limit: products.length || 1,
  });
  const filteredSignals = filterInventoryPlanningSignals({
    signals: inventorySignals,
    query: searchQuery,
    urgency: selectedUrgency,
    sort: selectedSort,
    productsById,
  });
  const paginatedSignals = paginateItems({
    items: filteredSignals,
    page: selectedPage,
    pageSize: selectedPageSize,
  });
  const planningStats = getInventoryPlanningStats(inventorySignals);
  const productStats = getProductStats(products);
  const inventoryBasePath = `/dashboard/stores/${store.id}/inventory`;
  const inventoryExportHref = buildDashboardExportHref({
    basePath: `${inventoryBasePath}/export`,
    params: query,
  });
  const reorderExportHref = buildDashboardExportHref({
    basePath: `${inventoryBasePath}/reorder/export`,
    params: {
      ...query,
      inventory:
        selectedUrgency === "all" ? "action_required" : selectedUrgency,
      sort: selectedSort === "urgency" ? "reorder_desc" : selectedSort,
    },
  });
  const purchaseOrderExportHref = buildDashboardExportHref({
    basePath: `${inventoryBasePath}/purchase-order/export`,
    params: {
      ...query,
      sort: selectedSort === "urgency" ? "reorder_desc" : selectedSort,
    },
  });
  const restockAlertsExportHref = `${inventoryBasePath}/restock-alerts/export`;
  const valuationExportHref = `${inventoryBasePath}/valuation/export`;
  const adjustmentExportHref = `${inventoryBasePath}/adjustments/export`;
  const adjustmentHistory = [...inventoryAdjustments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const metricCards = [
    {
      icon: TriangleAlert,
      label: "Action required",
      value: String(planningStats.actionRequired),
    },
    {
      icon: Boxes,
      label: "Reorder now",
      value: String(planningStats.reorderNow),
    },
    {
      icon: ShieldCheck,
      label: "Sellable units",
      value: String(productStats.sellableInventory),
    },
    {
      icon: Package,
      label: "Watch stock",
      value: String(planningStats.watchStock),
    },
    {
      icon: Boxes,
      label: "Reorder units",
      value: String(planningStats.totalReorderQuantity),
    },
    {
      icon: CircleDollarSign,
      label: "Stock value",
      value: formatCurrency(productStats.inventoryValueCents, store.currency),
    },
  ];

  return (
    <div className="grid gap-5">
      <Link
        className="secondary-button w-fit px-4 text-sm"
        href={`/dashboard/stores/${store.id}`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {store.name}
      </Link>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-pill mb-3">
              <Boxes aria-hidden="true" size={14} />
              Inventory
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Inventory workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Prioritize reorder work, inspect stock runway, and audit recent
              inventory changes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="secondary-button px-4 text-sm"
              href={inventoryExportHref}
            >
              <Download aria-hidden="true" size={17} />
              Export CSV
            </Link>
            <Link
              className="secondary-button px-4 text-sm"
              href={reorderExportHref}
            >
              <Download aria-hidden="true" size={17} />
              Reorder CSV
            </Link>
            <Link
              className="secondary-button px-4 text-sm"
              href={purchaseOrderExportHref}
            >
              <Download aria-hidden="true" size={17} />
              PO CSV
            </Link>
            <Link
              className="secondary-button px-4 text-sm"
              href={restockAlertsExportHref}
            >
              <Download aria-hidden="true" size={17} />
              Alerts CSV
            </Link>
            <Link
              className="secondary-button px-4 text-sm"
              href={valuationExportHref}
            >
              <Download aria-hidden="true" size={17} />
              Value CSV
            </Link>
            <Link
              className="secondary-button px-4 text-sm"
              href={`/dashboard/stores/${store.id}/products`}
            >
              <Package aria-hidden="true" size={17} />
              Products
            </Link>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        {metricCards.map(({ icon: Icon, label, value }) => (
          <div className="soft-panel p-4" key={label}>
            <Icon aria-hidden="true" className="text-sky-700" size={20} />
            <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="soft-panel p-4">
        <form
          className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto]"
          method="get"
        >
          <input name="page" type="hidden" value="1" />
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search inventory
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                className="field pl-9"
                defaultValue={searchQuery}
                name="q"
                placeholder="Name, SKU, category"
              />
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Inventory
            <select
              className="field min-w-44"
              defaultValue={selectedUrgency}
              name="inventory"
            >
              {inventoryPlanningUrgencyFilters.map((urgency) => (
                <option key={urgency} value={urgency}>
                  {inventoryPlanningUrgencyFilterLabels[urgency]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Sort
            <select
              className="field min-w-44"
              defaultValue={selectedSort}
              name="sort"
            >
              {inventoryPlanningSortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {inventoryPlanningSortLabels[sort]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Page size
            <select
              className="field min-w-32"
              defaultValue={selectedPageSize}
              name="pageSize"
            >
              {dashboardPageSizeOptions.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary-button mt-auto min-h-12 px-4 text-sm"
            type="submit"
          >
            <Filter aria-hidden="true" size={16} />
            Filter
          </button>
        </form>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Showing {paginatedSignals.startItem}-{paginatedSignals.endItem} of{" "}
          {filteredSignals.length} matching inventory signals.
        </p>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 xl:grid-cols-[1.35fr_auto_auto_auto_auto_auto]">
          <span>Product</span>
          <span className="hidden xl:inline">Priority</span>
          <span className="hidden xl:inline">Runway</span>
          <span className="hidden xl:inline">Velocity</span>
          <span className="hidden xl:inline">Reorder</span>
          <span>Adjust</span>
        </div>
        {paginatedSignals.items.map((signal) => {
          const product = productsById.get(signal.productId);

          return (
            <div
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 xl:grid-cols-[1.35fr_auto_auto_auto_auto_auto]"
              key={signal.productId}
            >
              <div className="flex min-w-0 items-center gap-3">
                {product ? (
                  <Image
                    alt={product.name}
                    className="h-16 w-16 rounded-[8px] object-cover"
                    height={128}
                    src={product.imageUrl}
                    width={128}
                  />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[8px] bg-slate-100 text-slate-500">
                    <Package aria-hidden="true" size={20} />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {signal.productName}
                    </p>
                    <span className="status-pill xl:hidden">
                      {signal.label}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {[product?.category, product?.sku || product?.slug]
                      .filter(Boolean)
                      .join(" / ") || signal.productId}
                  </p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                    {signal.detail}
                  </p>
                </div>
              </div>
              <span className="status-pill hidden w-fit xl:inline-flex">
                {signal.label}
              </span>
              <span className="hidden text-sm font-semibold text-slate-700 xl:inline">
                {formatRunway(signal)}
              </span>
              <span className="hidden text-sm font-semibold text-slate-700 xl:inline">
                {signal.salesVelocityPerDay}/day
              </span>
              <span className="hidden text-sm font-semibold text-slate-950 xl:inline">
                {signal.reorderQuantity}
              </span>
              <Link
                aria-label={`Adjust ${signal.productName}`}
                className="icon-button h-10 min-h-10 w-10"
                href={getProductEditHref(store.id, signal.productId)}
              >
                <Edit3 aria-hidden="true" size={16} />
              </Link>
            </div>
          );
        })}
        {filteredSignals.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No inventory signals match the current filters.
          </p>
        ) : null}
      </section>

      {filteredSignals.length > 0 ? (
        <nav
          aria-label="Inventory pages"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p className="font-medium text-slate-500">
            Page {paginatedSignals.page} of {paginatedSignals.totalPages}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              aria-disabled={!paginatedSignals.hasPreviousPage}
              className={
                paginatedSignals.hasPreviousPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: inventoryBasePath,
                params: query,
                page: paginatedSignals.page - 1,
                pageSize: paginatedSignals.pageSize,
              })}
            >
              <ChevronLeft aria-hidden="true" size={16} />
              Previous
            </Link>
            <Link
              aria-disabled={!paginatedSignals.hasNextPage}
              className={
                paginatedSignals.hasNextPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: inventoryBasePath,
                params: query,
                page: paginatedSignals.page + 1,
                pageSize: paginatedSignals.pageSize,
              })}
            >
              Next
              <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </nav>
      ) : null}

      <section className="soft-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <History aria-hidden="true" size={18} />
              Inventory history
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Recent restocks, counts, returns, damage removals, and manual edits.
            </p>
          </div>
          <Link className="secondary-button min-h-10 px-3 text-sm" href={adjustmentExportHref}>
            <Download aria-hidden="true" size={16} />
            History CSV
          </Link>
        </div>
        {adjustmentHistory.length > 0 ? (
          adjustmentHistory.slice(0, 12).map((adjustment) => {
            const product = productsById.get(adjustment.productId);

            return (
              <div
                className="grid gap-3 border-b border-slate-100 p-4 last:border-0 md:grid-cols-[1fr_auto_auto]"
                key={adjustment.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-950">
                      {product?.name || adjustment.productId}
                    </p>
                    <span className="status-pill">
                      {adjustmentReasonLabels[adjustment.reason]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(adjustment.createdAt).toLocaleString()}
                    {adjustment.reference ? ` / ${adjustment.reference}` : ""}
                  </p>
                  {adjustment.note ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      {adjustment.note}
                    </p>
                  ) : null}
                </div>
                <p className="text-sm font-semibold text-slate-700">
                  {adjustment.previousInventory} to {adjustment.nextInventory}
                </p>
                <p
                  className={
                    adjustment.delta > 0
                      ? "text-sm font-semibold text-emerald-700"
                      : "text-sm font-semibold text-red-600"
                  }
                >
                  {adjustment.delta > 0 ? "+" : ""}
                  {adjustment.delta}
                </p>
              </div>
            );
          })
        ) : (
          <p className="p-4 text-sm text-slate-500">
            No inventory adjustments recorded yet.
          </p>
        )}
      </section>
    </div>
  );
}
