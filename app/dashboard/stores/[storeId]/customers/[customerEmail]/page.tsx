import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CircleDollarSign,
  Mail,
  Megaphone,
  MapPin,
  Phone,
  ReceiptText,
  Repeat,
  Tags,
  ShoppingBag,
  TriangleAlert,
  UserRound,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { CustomerProfileForm } from "@/features/commerce/components/customer-profile-form";
import {
  getCustomerByEmail,
  getCustomerSegmentation,
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
  const customers = getCustomerSummaries(
    workspace.orders,
    store.currency,
    workspace.customerProfiles,
  );
  const customer = getCustomerByEmail(
    customers,
    decodeURIComponent(customerEmail),
  );

  if (!customer) {
    notFound();
  }

  const segmentation = getCustomerSegmentation(customer);
  const shipping = customer.latestShippingAddress;
  const firstSeenAt =
    customer.firstOrderAt || customer.profileCreatedAt || customer.lastOrderAt;
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
      icon: Repeat,
      label: "Segment",
      value: segmentation.label,
    },
    {
      icon: ShoppingBag,
      label: "Avg order",
      value: formatCurrency(
        segmentation.averageOrderValueCents,
        customer.currency,
      ),
    },
    {
      icon: UserRound,
      label: "First seen",
      value: firstSeenAt ? new Date(firstSeenAt).toLocaleDateString() : "Profile",
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
              {customer.tags.length > 0 ? (
                <p className="flex flex-wrap items-center gap-2">
                  <Tags aria-hidden="true" size={16} />
                  {customer.tags.map((tag) => (
                    <span className="status-pill" key={tag}>
                      {tag}
                    </span>
                  ))}
                </p>
              ) : null}
              <p className="flex flex-wrap gap-2">
                {customer.acceptsMarketing ? (
                  <span className="status-pill">Accepts marketing</span>
                ) : (
                  <span className="status-pill">No marketing consent</span>
                )}
                {customer.taxExempt ? (
                  <span className="status-pill">Tax exempt</span>
                ) : null}
              </p>
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
                  {order.refundedCents > 0
                    ? formatCurrency(order.refundableCents, order.currency)
                    : formatCurrency(order.totalCents, order.currency)}
                </p>
                {order.refundedCents > 0 ? (
                  <p className="text-xs font-medium text-red-600">
                    {formatCurrency(order.refundedCents, order.currency)} refunded
                  </p>
                ) : null}
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
          {customer.orders.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">
              No orders are linked to this customer profile yet.
            </p>
          ) : null}
        </div>

        <div className="grid gap-5">
          <section className="soft-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">
                Customer segment
              </h2>
              {segmentation.primarySegment === "at_risk" ||
              segmentation.primarySegment === "refund_watch" ? (
                <TriangleAlert aria-hidden="true" className="text-amber-700" size={18} />
              ) : (
                <Megaphone aria-hidden="true" className="text-sky-700" size={18} />
              )}
            </div>
            <p className="mt-4 text-2xl font-semibold text-slate-950">
              {segmentation.label}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {segmentation.nextAction}
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <div className="flex items-center justify-between gap-3">
                <span>Average order value</span>
                <span className="font-semibold text-slate-950">
                  {formatCurrency(
                    segmentation.averageOrderValueCents,
                    customer.currency,
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Refund rate</span>
                <span className="font-semibold text-slate-950">
                  {segmentation.refundRate}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Last order age</span>
                <span className="font-semibold text-slate-950">
                  {typeof segmentation.daysSinceLastOrder === "number"
                    ? `${segmentation.daysSinceLastOrder} days`
                    : "No orders"}
                </span>
              </div>
            </div>
            {segmentation.signals.length > 0 ? (
              <div className="mt-4 grid gap-2">
                {segmentation.signals.map((signal) => (
                  <div
                    className="rounded-[8px] border border-slate-100 bg-white/70 p-3"
                    key={signal.id}
                  >
                    <p className="text-sm font-semibold text-slate-950">
                      {signal.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {signal.detail}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="soft-panel p-4">
            <CustomerProfileForm customer={customer} storeId={store.id} />
          </section>

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
              {customer.note ? (
                <p className="rounded-[8px] bg-slate-50 p-3">{customer.note}</p>
              ) : null}
              {customer.orders
                .filter((order) => order.customerNote)
                .map((order) => (
                  <p className="rounded-[8px] bg-slate-50 p-3" key={order.id}>
                    {order.customerNote}
                  </p>
                ))}
              {!customer.note && customer.orders.every((order) => !order.customerNote) ? (
                <p>No notes saved.</p>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
