import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Filter,
  MailWarning,
  Search,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import {
  activityCenterKindFilterLabels,
  activityCenterKindFilters,
  activityCenterPriorityFilterLabels,
  activityCenterPriorityFilters,
  activityCenterSortLabels,
  activityCenterSortOptions,
  filterActivityCenterItems,
  getActivityCenterItems,
  getNotificationStats,
  parseActivityCenterKindFilter,
  parseActivityCenterPriorityFilter,
  parseActivityCenterSortOption,
  readActivityCenterSearchParam,
} from "@/features/commerce/activity-center";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  buildDashboardPageHref,
  dashboardPageSizeOptions,
  paginateItems,
  parseDashboardPage,
  parseDashboardPageSize,
} from "@/features/commerce/pagination";

export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{
    q?: string | string[];
    kind?: string | string[];
    priority?: string | string[];
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

  const { store, auditEvents, notifications } = workspace;
  const searchQuery = readActivityCenterSearchParam(query.q);
  const selectedKind = parseActivityCenterKindFilter(query.kind);
  const selectedPriority = parseActivityCenterPriorityFilter(query.priority);
  const selectedSort = parseActivityCenterSortOption(query.sort);
  const selectedPage = parseDashboardPage(query.page);
  const selectedPageSize = parseDashboardPageSize(query.pageSize);
  const notificationStats = getNotificationStats(notifications);
  const activityItems = getActivityCenterItems({
    auditEvents,
    notifications,
    storeId: store.id,
  });
  const filteredItems = filterActivityCenterItems({
    items: activityItems,
    kind: selectedKind,
    priority: selectedPriority,
    query: searchQuery,
    sort: selectedSort,
  });
  const paginatedItems = paginateItems({
    items: filteredItems,
    page: selectedPage,
    pageSize: selectedPageSize,
  });
  const activityBasePath = `/dashboard/stores/${store.id}/activity`;
  const criticalCount = activityItems.filter(
    (item) => item.priority === "critical",
  ).length;
  const warningCount = activityItems.filter(
    (item) => item.priority === "warning",
  ).length;
  const metricCards = [
    {
      icon: Bell,
      label: "Notifications",
      value: String(notificationStats.total),
    },
    {
      icon: MailWarning,
      label: "Needs review",
      value: String(notificationStats.actionRequired),
    },
    {
      icon: ClipboardList,
      label: "Audit events",
      value: String(auditEvents.length),
    },
    {
      icon: MailWarning,
      label: "Critical / warning",
      value: `${criticalCount}/${warningCount}`,
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
              <Bell aria-hidden="true" size={14} />
              Activity
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Activity and outbox
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Review notification delivery, audit history, and operational events
              across this store.
            </p>
          </div>
          <span className="status-pill">
            {filteredItems.length} matching events
          </span>
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
        <form className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto]" method="get">
          <input name="page" type="hidden" value="1" />
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search activity
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
                placeholder="Recipient, action, resource, detail"
              />
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Kind
            <select className="field min-w-44" defaultValue={selectedKind} name="kind">
              {activityCenterKindFilters.map((kind) => (
                <option key={kind} value={kind}>
                  {activityCenterKindFilterLabels[kind]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Priority
            <select
              className="field min-w-40"
              defaultValue={selectedPriority}
              name="priority"
            >
              {activityCenterPriorityFilters.map((priority) => (
                <option key={priority} value={priority}>
                  {activityCenterPriorityFilterLabels[priority]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Sort
            <select className="field min-w-40" defaultValue={selectedSort} name="sort">
              {activityCenterSortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {activityCenterSortLabels[sort]}
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
          Showing {paginatedItems.startItem}-{paginatedItems.endItem} of{" "}
          {filteredItems.length} matching events.
        </p>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 xl:grid-cols-[auto_1.1fr_auto_auto_auto]">
          <span className="hidden xl:inline">Priority</span>
          <span>Event</span>
          <span className="hidden xl:inline">Kind</span>
          <span className="hidden xl:inline">When</span>
          <span>Open</span>
        </div>
        {paginatedItems.items.map((item) => (
          <div
            className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 p-4 last:border-0 xl:grid-cols-[auto_1.1fr_auto_auto_auto]"
            key={item.id}
          >
            <span className="status-pill hidden w-fit capitalize xl:inline-flex">
              {item.priority}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-semibold text-slate-950">
                  {item.title}
                </p>
                <span className="status-pill xl:hidden">{item.priority}</span>
                <span className="status-pill">{item.label}</span>
                <span className="status-pill">{item.resourceLabel}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                {item.detail}
              </p>
            </div>
            <span className="status-pill hidden w-fit xl:inline-flex">
              {item.kind === "notification" ? "Notification" : "Audit"}
            </span>
            <time
              className="hidden text-sm font-medium text-slate-500 xl:inline"
              dateTime={item.createdAt}
            >
              {new Date(item.createdAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </time>
            {item.href ? (
              <Link
                className="secondary-button min-h-10 px-3 text-sm"
                href={item.href}
              >
                <ArrowUpRight aria-hidden="true" size={16} />
                Open
              </Link>
            ) : (
              <span className="text-sm font-medium text-slate-400">-</span>
            )}
          </div>
        ))}
        {filteredItems.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No activity matches the current filters.
          </p>
        ) : null}
      </section>

      {filteredItems.length > 0 ? (
        <nav
          aria-label="Activity pages"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p className="font-medium text-slate-500">
            Page {paginatedItems.page} of {paginatedItems.totalPages}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              aria-disabled={!paginatedItems.hasPreviousPage}
              className={
                paginatedItems.hasPreviousPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: activityBasePath,
                params: query,
                page: paginatedItems.page - 1,
                pageSize: paginatedItems.pageSize,
              })}
            >
              <ChevronLeft aria-hidden="true" size={16} />
              Previous
            </Link>
            <Link
              aria-disabled={!paginatedItems.hasNextPage}
              className={
                paginatedItems.hasNextPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: activityBasePath,
                params: query,
                page: paginatedItems.page + 1,
                pageSize: paginatedItems.pageSize,
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
