import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleDollarSign,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  ShoppingBag,
  UserRound,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import {
  getCustomerByEmail,
  getCustomerStats,
  getCustomerSummaries,
} from "@/features/commerce/customers";
import { getStoreWorkspace } from "@/features/commerce/data";
import { orderStatusLabels } from "@/features/commerce/order-status";
import { formatCurrency } from "@/lib/utils";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ storeId: string; customerEmail: string }>;
}) {
  const { storeId, customerEmail } = await params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const { store } = workspace;
  const customers = getCustomerSummaries(workspace.orders, store.currency);
  const customer = getCustomerByEmail(
    customers,
    decodeURIComponent(customerEmail),
  );

  if (!customer) {
    notFound();
  }

  const stats = getCustomerStats([customer]);
  const shipping = customer.latestShippingAddress;
  const metricCards = [
    {
      icon: ReceiptText,
      label: "Orders",
      value: String(customer.orderCount),
    },
    {
      icon: CircleDollarSign,
      label: "Paid spend",
      value: formatCurrency(customer.totalSpentCents, customer.currency),
    },
    {
      icon: ShoppingBag,
      label: "Paid orders",
      value: String(stats.paidOrders),
    },
    {
      icon: UserRound,
      label: "First seen",
      value: new Date(customer.firstOrderAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Link
          className="secondary-button px-4 text-sm"
          href={`/dashboard/stores/${store.id}/customers`}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Customers
        </Link>
        <Link className="secondary-button px-4 text-sm" href={`/dashboard/stores/${store.id}`}>
          <ShoppingBag aria-hidden="true" size={16} />
          {store.name}
        </Link>
      </div>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-pill mb-3">
              <UserRound aria-hidden="true" size={14} />
              Customer
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              {customer.name}
            </h1>
            <div className="mt-3 grid gap-2 text-sm text-slate-600">
              <p className="flex items-center gap-2">
                <Mail aria-hidden="true" size={16} />
                {customer.email}
              </p>
              {customer.phone ? (
                <p className="flex items-center gap-2">
                  <Phone aria-hidden="true" size={16} />
                  {customer.phone}
                </p>
              ) : null}
            </div>
          </div>
          <p className="text-3xl font-semibold text-slate-950">
            {formatCurrency(customer.totalSpentCents, customer.currency)}
          </p>
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

      <section className="grid gap-5 xl:grid-cols-[1fr_0.7fr]">
        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-lg font-semibold text-slate-950">Order history</h2>
          </div>
          {customer.orders.map((order) => (
            <div
              className="grid gap-3 border-b border-slate-100 p-4 last:border-0 sm:grid-cols-[1fr_auto]"
              key={order.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-950">
                    Order {order.id.slice(0, 8)}
                  </p>
                  <span className="status-pill">
                    {orderStatusLabels[order.status]}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
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
              <div className="grid gap-2 sm:justify-items-end">
                <p className="text-sm font-semibold text-slate-950">
                  {formatCurrency(order.totalCents, order.currency)}
                </p>
                <Link
                  className="secondary-button min-h-10 px-3 text-sm"
                  href={`/dashboard/stores/${store.id}/orders/${order.id}`}
                >
                  <ReceiptText aria-hidden="true" size={16} />
                  Details
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-5">
          <section className="soft-panel p-4">
            <h2 className="text-lg font-semibold text-slate-950">Shipping</h2>
            {shipping ? (
              <div className="mt-4 flex gap-3 text-sm leading-6 text-slate-600">
                <MapPin aria-hidden="true" className="mt-1 shrink-0" size={16} />
                <div>
                  <p>{shipping.line1}</p>
                  {shipping.line2 ? <p>{shipping.line2}</p> : null}
                  <p>
                    {shipping.city}, {shipping.region} {shipping.postalCode}
                  </p>
                  <p>{shipping.country}</p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                No shipping address saved.
              </p>
            )}
          </section>

          <section className="soft-panel p-4">
            <h2 className="text-lg font-semibold text-slate-950">Customer notes</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              {customer.orders
                .filter((order) => order.customerNote)
                .map((order) => (
                  <p className="rounded-[8px] bg-slate-50 p-3" key={order.id}>
                    {order.customerNote}
                  </p>
                ))}
              {customer.orders.every((order) => !order.customerNote) ? (
                <p>No notes saved.</p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
