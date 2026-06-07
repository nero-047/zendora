import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleDollarSign,
  Filter,
  PackageCheck,
  ReceiptText,
  Search,
  ShoppingBag,
  Truck,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { ManualOrderForm } from "@/features/commerce/components/manual-order-form";
import { getCustomerHref } from "@/features/commerce/customers";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  orderSourceLabels,
  orderStatusLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  filterOrders,
  getOrderHref,
  getOrderStats,
  orderStatusFilters,
  parseOrderStatusFilter,
} from "@/features/commerce/orders";
import { formatCurrency } from "@/lib/utils";

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function OrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{ q?: string | string[]; status?: string | string[] }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const { store, products, orders } = workspace;
  const searchQuery = readSearchParam(query.q);
  const selectedStatus = parseOrderStatusFilter(query.status);
  const filteredOrders = filterOrders({
    orders,
    query: searchQuery,
    status: selectedStatus,
  });
  const stats = getOrderStats(orders);
  const metricCards = [
    {
      icon: ReceiptText,
      label: "Orders",
      value: String(stats.totalOrders),
    },
    {
      icon: PackageCheck,
      label: "Needs fulfillment",
      value: String(stats.needsFulfillment),
    },
    {
      icon: CircleDollarSign,
      label: "Paid revenue",
      value: formatCurrency(stats.totalRevenueCents, store.currency),
    },
    {
      icon: ShoppingBag,
      label: "Avg paid order",
      value: formatCurrency(stats.averagePaidOrderCents, store.currency),
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
              <ReceiptText aria-hidden="true" size={14} />
              Orders
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Order workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Search, triage, fulfill, and audit every order for this store.
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

      <ManualOrderForm
        currency={store.currency}
        products={products}
        storeId={store.id}
      />

      <section className="soft-panel p-4">
        <form className="grid gap-3 lg:grid-cols-[1fr_auto_auto]" method="get">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search orders
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
                placeholder="Customer, email, order id, tracking"
              />
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Status
            <select className="field min-w-44" defaultValue={selectedStatus} name="status">
              {orderStatusFilters.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : orderStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button mt-auto min-h-12 px-4 text-sm" type="submit">
            <Filter aria-hidden="true" size={16} />
            Filter
          </button>
        </form>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 xl:grid-cols-[1.2fr_auto_auto_auto_auto_auto_auto]">
          <span>Order</span>
          <span className="hidden xl:inline">Source</span>
          <span className="hidden xl:inline">Status</span>
          <span className="hidden xl:inline">Payment</span>
          <span className="hidden xl:inline">Fulfillment</span>
          <span className="hidden xl:inline">Total</span>
          <span>View</span>
        </div>
        {filteredOrders.map((order) => (
          <div
            className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 xl:grid-cols-[1.2fr_auto_auto_auto_auto_auto_auto]"
            key={order.id}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-slate-950">
                  Order {order.id.slice(0, 8)}
                </p>
                <span className="status-pill xl:hidden">
                  {orderStatusLabels[order.status]}
                </span>
                <span className="status-pill xl:hidden">
                  {paymentStatusLabels[order.paymentStatus]}
                </span>
                <span className="status-pill xl:hidden">
                  {orderSourceLabels[order.source]}
                </span>
              </div>
              <Link
                className="mt-1 block truncate text-sm font-semibold text-sky-700"
                href={getCustomerHref(store.id, order.customerEmail)}
              >
                {order.customerName}
              </Link>
              <p className="truncate text-xs text-slate-500">{order.customerEmail}</p>
              <p className="mt-2 text-xs text-slate-500">
                {new Date(order.createdAt).toLocaleString()}
              </p>
              {order.items?.length ? (
                <p className="mt-2 truncate text-xs text-slate-500">
                  {order.items
                    .slice(0, 3)
                    .map((item) =>
                      `${item.quantity} x ${item.productName}${
                        item.variantName ? ` (${item.variantName})` : ""
                      }`,
                    )
                    .join(" / ")}
                </p>
              ) : null}
            </div>
            <span className="status-pill hidden w-fit xl:inline-flex">
              {orderSourceLabels[order.source]}
            </span>
            <span className="status-pill hidden w-fit xl:inline-flex">
              {orderStatusLabels[order.status]}
            </span>
            <span className="status-pill hidden w-fit xl:inline-flex">
              {paymentStatusLabels[order.paymentStatus]}
            </span>
            <span className="hidden text-sm text-slate-600 xl:inline">
              {order.trackingNumber ? (
                <span className="inline-flex items-center gap-2">
                  <Truck aria-hidden="true" size={15} />
                  {order.trackingCarrier
                    ? `${order.trackingCarrier} ${order.trackingNumber}`
                    : order.trackingNumber}
                </span>
              ) : order.status === "fulfilled" ? (
                "Fulfilled"
              ) : (
                "Not fulfilled"
              )}
            </span>
            <span className="hidden text-sm font-semibold text-slate-950 xl:inline">
              {order.refundedCents > 0
                ? formatCurrency(order.refundableCents, order.currency)
                : formatCurrency(order.totalCents, order.currency)}
            </span>
            <Link
              className="secondary-button min-h-10 px-3 text-sm"
              href={getOrderHref(store.id, order.id)}
            >
              <ReceiptText aria-hidden="true" size={16} />
              Details
            </Link>
          </div>
        ))}
        {filteredOrders.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No orders match the current filters.
          </p>
        ) : null}
      </section>
    </div>
  );
}
