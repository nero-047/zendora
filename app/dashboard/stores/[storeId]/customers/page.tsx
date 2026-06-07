import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleDollarSign,
  Mail,
  ReceiptText,
  Repeat,
  ShoppingBag,
  UserRound,
  Users,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import {
  getCustomerHref,
  getCustomerStats,
  getCustomerSummaries,
} from "@/features/commerce/customers";
import { getStoreWorkspace } from "@/features/commerce/data";
import { orderStatusLabels } from "@/features/commerce/order-status";
import { formatCurrency } from "@/lib/utils";

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const { store } = workspace;
  const customers = getCustomerSummaries(workspace.orders, store.currency);
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
      icon: CircleDollarSign,
      label: "Paid sales",
      value: formatCurrency(stats.totalSpentCents, store.currency),
    },
    {
      icon: ReceiptText,
      label: "Avg paid order",
      value: formatCurrency(stats.averageOrderValueCents, store.currency),
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

      <section className="soft-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 lg:grid-cols-[1.3fr_auto_auto_auto_auto_auto]">
          <span>Customer</span>
          <span className="hidden lg:inline">Orders</span>
          <span className="hidden lg:inline">Paid spend</span>
          <span className="hidden lg:inline">Last order</span>
          <span className="hidden lg:inline">Status</span>
          <span>View</span>
        </div>
        {customers.map((customer) => (
          <div
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 lg:grid-cols-[1.3fr_auto_auto_auto_auto_auto]"
            key={customer.email}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">
                {customer.name}
              </p>
              <p className="mt-1 flex items-center gap-2 truncate text-xs text-slate-500">
                <Mail aria-hidden="true" className="shrink-0" size={14} />
                {customer.email}
              </p>
              <p className="mt-2 text-xs font-semibold text-slate-700 lg:hidden">
                {customer.orderCount} orders /{" "}
                {formatCurrency(customer.totalSpentCents, customer.currency)}
              </p>
            </div>
            <span className="hidden text-sm font-semibold text-slate-700 lg:inline">
              {customer.orderCount}
            </span>
            <span className="hidden text-sm font-semibold text-slate-950 lg:inline">
              {formatCurrency(customer.totalSpentCents, customer.currency)}
            </span>
            <span className="hidden text-sm text-slate-500 lg:inline">
              {new Date(customer.lastOrderAt).toLocaleDateString()}
            </span>
            <span className="status-pill col-span-full w-fit lg:col-auto">
              {orderStatusLabels[customer.lastOrderStatus]}
            </span>
            <Link
              className="secondary-button min-h-10 px-3 text-sm"
              href={getCustomerHref(store.id, customer.email)}
            >
              <ReceiptText aria-hidden="true" size={16} />
              Details
            </Link>
          </div>
        ))}
        {customers.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            Customers will appear here after orders are created.
          </p>
        ) : null}
      </section>
    </div>
  );
}
