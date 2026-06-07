import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleDollarSign,
  Filter,
  Megaphone,
  Mail,
  ReceiptText,
  Repeat,
  Search,
  ShoppingBag,
  TriangleAlert,
  UserRound,
  Users,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { CustomerProfileForm } from "@/features/commerce/components/customer-profile-form";
import {
  customerSegmentFilters,
  customerSegmentLabels,
  filterCustomers,
  getCustomerSegmentation,
  getCustomerHref,
  getCustomerStats,
  getCustomerSummaries,
  parseCustomerSegmentFilter,
  readCustomerSearchParam,
} from "@/features/commerce/customers";
import { getStoreWorkspace } from "@/features/commerce/data";
import { orderStatusLabels } from "@/features/commerce/order-status";
import { formatCurrency } from "@/lib/utils";

export default async function CustomersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ q?: string | string[]; segment?: string | string[] }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const { store } = workspace;
  const customers = getCustomerSummaries(
    workspace.orders,
    store.currency,
    workspace.customerProfiles,
  );
  const searchQuery = readCustomerSearchParam(query.q);
  const selectedSegment = parseCustomerSegmentFilter(query.segment);
  const filteredCustomers = filterCustomers({
    customers,
    query: searchQuery,
    segment: selectedSegment,
  });
  const stats = getCustomerStats(customers);
  const metricCards = [
    {
      icon: Users,
      label: "Customers",
      value: String(stats.totalCustomers),
    },
    {
      icon: Repeat,
      label: "Repeat buyers",
      value: String(stats.repeatCustomers),
    },
    {
      icon: Megaphone,
      label: "Marketing opt-ins",
      value: String(stats.marketingOptIns),
    },
    {
      icon: CircleDollarSign,
      label: "VIP customers",
      value: String(stats.vipCustomers),
    },
    {
      icon: TriangleAlert,
      label: "At risk",
      value: String(stats.atRiskCustomers),
    },
    {
      icon: ShoppingBag,
      label: "Paid sales",
      value: formatCurrency(stats.totalSpentCents, store.currency),
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
              <UserRound aria-hidden="true" size={14} />
              Customers
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Customer book
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track buyers, repeat orders, paid spend, and the latest order
              activity for this store.
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

      <section className="soft-panel p-5">
        <CustomerProfileForm storeId={store.id} />
      </section>

      <section className="soft-panel p-4">
        <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto]" method="get">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search customers
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
                placeholder="Name, email, tag, order, product"
              />
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Segment
            <select
              className="field min-w-48"
              defaultValue={selectedSegment}
              name="segment"
            >
              {customerSegmentFilters.map((segment) => (
                <option key={segment} value={segment}>
                  {segment === "all"
                    ? "All segments"
                    : customerSegmentLabels[segment]}
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
          Showing {filteredCustomers.length} of {customers.length} customers.
        </p>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 lg:grid-cols-[1.3fr_auto_auto_auto_auto_auto_auto]">
          <span>Customer</span>
          <span className="hidden lg:inline">Segment</span>
          <span className="hidden lg:inline">Orders</span>
          <span className="hidden lg:inline">Paid spend</span>
          <span className="hidden lg:inline">Last order</span>
          <span className="hidden lg:inline">Status</span>
          <span>View</span>
        </div>
        {filteredCustomers.map((customer) => {
          const segmentation = getCustomerSegmentation(customer);

          return (
            <div
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 lg:grid-cols-[1.3fr_auto_auto_auto_auto_auto_auto]"
              key={customer.email}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {customer.name}
                  </p>
                  <span className="status-pill lg:hidden">
                    {segmentation.label}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-2 truncate text-xs text-slate-500">
                  <Mail aria-hidden="true" className="shrink-0" size={14} />
                  {customer.email}
                </p>
                <p className="mt-2 text-xs font-semibold text-slate-700 lg:hidden">
                  {customer.orderCount} orders /{" "}
                  {formatCurrency(customer.totalSpentCents, customer.currency)}
                </p>
                <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                  {segmentation.nextAction}
                </p>
                {customer.tags.length > 0 ||
                customer.acceptsMarketing ||
                customer.taxExempt ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {customer.acceptsMarketing ? (
                      <span className="status-pill">Marketing</span>
                    ) : null}
                    {customer.taxExempt ? (
                      <span className="status-pill">Tax exempt</span>
                    ) : null}
                    {customer.tags.slice(0, 3).map((tag) => (
                      <span className="status-pill" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <span className="status-pill hidden w-fit lg:inline-flex">
                {segmentation.label}
              </span>
              <span className="hidden text-sm font-semibold text-slate-700 lg:inline">
                {customer.orderCount}
              </span>
              <span className="hidden text-sm font-semibold text-slate-950 lg:inline">
                {formatCurrency(customer.totalSpentCents, customer.currency)}
              </span>
              <span className="hidden text-sm text-slate-500 lg:inline">
                {customer.lastOrderAt
                  ? new Date(customer.lastOrderAt).toLocaleDateString()
                  : "No orders"}
              </span>
              <span className="status-pill col-span-full w-fit lg:col-auto">
                {customer.lastOrderStatus
                  ? orderStatusLabels[customer.lastOrderStatus]
                  : "Profile"}
              </span>
              <Link
                className="secondary-button min-h-10 px-3 text-sm"
                href={getCustomerHref(store.id, customer.email)}
              >
                <ReceiptText aria-hidden="true" size={16} />
                Details
              </Link>
            </div>
          );
        })}
        {filteredCustomers.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No customers match the current filters.
          </p>
        ) : null}
      </section>
    </div>
  );
}
