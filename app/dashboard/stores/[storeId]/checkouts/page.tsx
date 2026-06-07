import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Mail,
  ReceiptText,
  ShoppingBag,
  XCircle,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import {
  abandonedCheckoutSortLabels,
  abandonedCheckoutSortOptions,
  abandonedCheckoutStatusFilterLabels,
  abandonedCheckoutStatusFilters,
  abandonedCheckoutStatusLabels,
  canQueueAbandonedCheckoutRecovery,
  filterAbandonedCheckouts,
  getAbandonedCheckoutRecoveryHref,
  getAbandonedCheckoutStats,
  parseAbandonedCheckoutSortOption,
  parseAbandonedCheckoutStatusFilter,
  readAbandonedCheckoutSearchParam,
  summarizeAbandonedCheckoutLines,
} from "@/features/commerce/abandoned-checkouts";
import {
  dismissAbandonedCheckoutAction,
  queueAbandonedCheckoutRecoveryAction,
} from "@/features/commerce/actions";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  buildDashboardPageHref,
  dashboardPageSizeOptions,
  paginateItems,
  parseDashboardPage,
  parseDashboardPageSize,
} from "@/features/commerce/pagination";
import { formatCurrency } from "@/lib/utils";

export default async function AbandonedCheckoutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
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

  const { store, abandonedCheckouts } = workspace;
  const searchQuery = readAbandonedCheckoutSearchParam(query.q);
  const selectedStatus = parseAbandonedCheckoutStatusFilter(query.status);
  const selectedSort = parseAbandonedCheckoutSortOption(query.sort);
  const selectedPage = parseDashboardPage(query.page);
  const selectedPageSize = parseDashboardPageSize(query.pageSize);
  const filteredCheckouts = filterAbandonedCheckouts({
    checkouts: abandonedCheckouts,
    query: searchQuery,
    status: selectedStatus,
    sort: selectedSort,
  });
  const paginatedCheckouts = paginateItems({
    items: filteredCheckouts,
    page: selectedPage,
    pageSize: selectedPageSize,
  });
  const checkoutsBasePath = `/dashboard/stores/${store.id}/checkouts`;
  const stats = getAbandonedCheckoutStats(abandonedCheckouts);
  const metricCards = [
    {
      icon: Mail,
      label: "Recoverable carts",
      value: String(stats.recoverable),
    },
    {
      icon: ShoppingBag,
      label: "Open checkouts",
      value: String(stats.open),
    },
    {
      icon: ReceiptText,
      label: "Recovered",
      value: String(stats.recovered),
    },
    {
      icon: Mail,
      label: "Recoverable value",
      value: formatCurrency(stats.recoverableValueCents, store.currency),
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
              <Mail aria-hidden="true" size={14} />
              Abandoned checkouts
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Checkout recovery workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Prioritize recoverable carts, open recovery links, and dismiss stale
              checkouts from one merchant workspace.
            </p>
          </div>
          <Link className="primary-button px-4 text-sm" href={`/stores/${store.slug}`}>
            <ShoppingBag aria-hidden="true" size={17} />
            Storefront
          </Link>
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
        <form className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto]" method="get">
          <input name="page" type="hidden" value="1" />
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search checkouts
            <input
              className="field"
              defaultValue={searchQuery}
              name="q"
              placeholder="Customer, email, product, token"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Status
            <select
              className="field min-w-44"
              defaultValue={selectedStatus}
              name="status"
            >
              {abandonedCheckoutStatusFilters.map((status) => (
                <option key={status} value={status}>
                  {abandonedCheckoutStatusFilterLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Sort
            <select className="field min-w-48" defaultValue={selectedSort} name="sort">
              {abandonedCheckoutSortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {abandonedCheckoutSortLabels[sort]}
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
          <button className="secondary-button mt-auto min-h-12 px-4 text-sm" type="submit">
            <Filter aria-hidden="true" size={16} />
            Filter
          </button>
        </form>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Showing {paginatedCheckouts.startItem}-{paginatedCheckouts.endItem} of{" "}
          {filteredCheckouts.length} matching checkouts.
        </p>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 xl:grid-cols-[1.2fr_auto_auto_auto_auto]">
          <span>Checkout</span>
          <span className="hidden xl:inline">Status</span>
          <span className="hidden xl:inline">Last seen</span>
          <span className="hidden xl:inline">Value</span>
          <span>Actions</span>
        </div>
        {paginatedCheckouts.items.map((checkout) => {
          const summary = summarizeAbandonedCheckoutLines(checkout.lines);
          const recoveryHref = getAbandonedCheckoutRecoveryHref({
            storeSlug: store.slug,
            recoveryToken: checkout.recoveryToken,
          });
          const canRecover = canQueueAbandonedCheckoutRecovery(checkout);

          return (
            <div
              className="grid grid-cols-[1fr_auto] gap-4 border-b border-slate-100 p-4 last:border-0 xl:grid-cols-[1.2fr_auto_auto_auto_auto]"
              key={checkout.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {checkout.customerName || "Guest customer"}
                  </p>
                  <span className="status-pill xl:hidden">
                    {abandonedCheckoutStatusLabels[checkout.status]}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs font-medium text-slate-500">
                  {checkout.customerEmail}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {summary.itemCount} items / {summary.lineCount} lines
                </p>
                {checkout.lines.length > 0 ? (
                  <div className="mt-2 grid gap-1 text-xs text-slate-500">
                    {checkout.lines.slice(0, 4).map((line) => (
                      <p
                        className="truncate"
                        key={`${checkout.id}:${line.productId}:${line.productVariantId || ""}`}
                      >
                        {line.quantity} x {line.productName}
                        {line.variantName ? ` (${line.variantName})` : ""}
                      </p>
                    ))}
                  </div>
                ) : null}
                {checkout.recoveredOrderId ? (
                  <Link
                    className="mt-2 inline-flex text-xs font-semibold text-sky-700"
                    href={`/dashboard/stores/${store.id}/orders/${checkout.recoveredOrderId}`}
                  >
                    Recovered order {checkout.recoveredOrderId.slice(0, 8)}
                  </Link>
                ) : null}
              </div>
              <span className="status-pill hidden w-fit xl:inline-flex">
                {abandonedCheckoutStatusLabels[checkout.status]}
              </span>
              <span className="hidden text-sm text-slate-600 xl:inline">
                {new Date(checkout.lastSeenAt).toLocaleString("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              <span className="hidden text-sm font-semibold text-slate-950 xl:inline">
                {formatCurrency(checkout.subtotalCents, checkout.currency)}
              </span>
              <div className="flex flex-wrap items-start justify-end gap-2">
                <Link
                  className="secondary-button min-h-10 px-3 text-sm"
                  href={recoveryHref}
                >
                  <ExternalLink aria-hidden="true" size={16} />
                  Open
                </Link>
                <form
                  action={queueAbandonedCheckoutRecoveryAction.bind(
                    null,
                    store.id,
                    checkout.id,
                  )}
                >
                  <button
                    className="secondary-button min-h-10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!canRecover}
                    type="submit"
                  >
                    <Mail aria-hidden="true" size={16} />
                    Send
                  </button>
                </form>
                <form
                  action={dismissAbandonedCheckoutAction.bind(
                    null,
                    store.id,
                    checkout.id,
                  )}
                >
                  <button
                    className="secondary-button min-h-10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={checkout.status !== "open"}
                    type="submit"
                  >
                    <XCircle aria-hidden="true" size={16} />
                    Dismiss
                  </button>
                </form>
              </div>
            </div>
          );
        })}
        {filteredCheckouts.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No abandoned checkouts match the current filters.
          </p>
        ) : null}
      </section>

      {filteredCheckouts.length > 0 ? (
        <nav
          aria-label="Checkout recovery pages"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p className="font-medium text-slate-500">
            Page {paginatedCheckouts.page} of {paginatedCheckouts.totalPages}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              aria-disabled={!paginatedCheckouts.hasPreviousPage}
              className={
                paginatedCheckouts.hasPreviousPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: checkoutsBasePath,
                params: query,
                page: paginatedCheckouts.page - 1,
                pageSize: paginatedCheckouts.pageSize,
              })}
            >
              <ChevronLeft aria-hidden="true" size={16} />
              Previous
            </Link>
            <Link
              aria-disabled={!paginatedCheckouts.hasNextPage}
              className={
                paginatedCheckouts.hasNextPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: checkoutsBasePath,
                params: query,
                page: paginatedCheckouts.page + 1,
                pageSize: paginatedCheckouts.pageSize,
              })}
            >
              Next
              <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
