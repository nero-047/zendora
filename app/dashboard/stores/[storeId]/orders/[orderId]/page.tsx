import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  ShoppingBag,
  Truck,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import {
  updateOrderFulfillmentAction,
  updateOrderStatusAction,
} from "@/features/commerce/actions";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getOrderLifecycleEvents,
  getOrderStatusOptions,
  orderStatusLabels,
} from "@/features/commerce/order-status";
import { formatCurrency } from "@/lib/utils";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ storeId: string; orderId: string }>;
}) {
  const { storeId, orderId } = await params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const order = workspace.orders.find((item) => item.id === orderId);

  if (!order) {
    notFound();
  }

  const shipping = order.shippingAddress;
  const lifecycleEvents = getOrderLifecycleEvents(order);

  return (
    <div className="grid gap-5">
      <Link
        className="secondary-button w-fit px-4 text-sm"
        href={`/dashboard/stores/${workspace.store.id}`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {workspace.store.name}
      </Link>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-pill mb-3">
              <ReceiptText aria-hidden="true" size={14} />
              {orderStatusLabels[order.status]}
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Order {order.id.slice(0, 8)}
            </h1>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>
          <p className="text-3xl font-semibold text-slate-950">
            {formatCurrency(order.totalCents, order.currency)}
          </p>
        </div>

        <form
          action={updateOrderStatusAction.bind(null, workspace.store.id, order.id)}
          className="mt-5 grid gap-2 sm:max-w-xl sm:grid-cols-[1fr_auto]"
        >
          <select className="field" defaultValue={order.status} name="status">
            {getOrderStatusOptions(order.status).map((status) => (
              <option key={status} value={status}>
                {orderStatusLabels[status]}
              </option>
            ))}
          </select>
          <button
            className="secondary-button px-4 text-sm"
            disabled={getOrderStatusOptions(order.status).length === 1}
            type="submit"
          >
            <CheckCircle aria-hidden="true" size={16} />
            Update status
          </button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1fr_0.85fr]">
        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="text-lg font-semibold text-slate-950">Items</h2>
          </div>
          {order.items?.length ? (
            order.items.map((item) => (
              <div
                className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 p-4 last:border-0"
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {item.productName}
                  </p>
                  {item.variantName || item.variantSku ? (
                    <p className="truncate text-xs text-slate-500">
                      {[item.variantName, item.variantSku].filter(Boolean).join(" / ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {formatCurrency(item.unitPriceCents, order.currency)} x {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-950">
                  {formatCurrency(item.unitPriceCents * item.quantity, order.currency)}
                </p>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-slate-500">No line items found.</p>
          )}
          <div className="border-t border-slate-100 p-4">
            <div className="grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotalCents, order.currency)}</span>
              </div>
              {order.discountCents > 0 ? (
                <div className="flex items-center justify-between gap-3 text-emerald-700">
                  <span>{order.discountCode || "Discount"}</span>
                  <span>-{formatCurrency(order.discountCents, order.currency)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Shipping</span>
                <span>{formatCurrency(order.shippingCents, order.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Tax {(order.taxRateBps / 100).toFixed(2)}%</span>
                <span>{formatCurrency(order.taxCents, order.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 text-base font-semibold text-slate-950">
                <span>Total</span>
                <span>{formatCurrency(order.totalCents, order.currency)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          <section className="soft-panel p-4">
            <h2 className="text-lg font-semibold text-slate-950">Customer</h2>
            <div className="mt-4 grid gap-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-950">{order.customerName}</p>
              <p className="flex items-center gap-2">
                <Mail aria-hidden="true" size={16} />
                {order.customerEmail}
              </p>
              {order.customerPhone ? (
                <p className="flex items-center gap-2">
                  <Phone aria-hidden="true" size={16} />
                  {order.customerPhone}
                </p>
              ) : null}
            </div>
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
              <p className="mt-4 text-sm text-slate-500">No shipping address saved.</p>
            )}
          </section>

          <section className="soft-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">
                Fulfillment
              </h2>
              <Truck aria-hidden="true" className="text-sky-700" size={18} />
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              {order.trackingCarrier || order.trackingNumber ? (
                <p>
                  {[order.trackingCarrier, order.trackingNumber]
                    .filter(Boolean)
                    .join(" / ")}
                </p>
              ) : (
                <p>No tracking saved yet.</p>
              )}
              {order.trackingUrl ? (
                <a
                  className="inline-flex items-center gap-2 font-semibold text-sky-700"
                  href={order.trackingUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Tracking link
                  <ExternalLink aria-hidden="true" size={14} />
                </a>
              ) : null}
              {order.fulfillmentNote ? (
                <p className="rounded-[8px] bg-slate-50 p-3">
                  {order.fulfillmentNote}
                </p>
              ) : null}
            </div>

            <form
              action={updateOrderFulfillmentAction.bind(
                null,
                workspace.store.id,
                order.id,
              )}
              className="mt-4 grid gap-3"
            >
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Carrier
                <input
                  className="field"
                  defaultValue={order.trackingCarrier || ""}
                  name="trackingCarrier"
                  placeholder="UPS"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Tracking number
                <input
                  className="field"
                  defaultValue={order.trackingNumber || ""}
                  name="trackingNumber"
                  placeholder="1Z..."
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Tracking URL
                <input
                  className="field"
                  defaultValue={order.trackingUrl || ""}
                  name="trackingUrl"
                  placeholder="https://carrier.example/track"
                  type="url"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Fulfillment note
                <textarea
                  className="field min-h-24 resize-y"
                  defaultValue={order.fulfillmentNote || ""}
                  name="fulfillmentNote"
                  placeholder="Packing notes, parcel count, or handoff details"
                />
              </label>
              {order.status === "paid" || order.status === "fulfilled" ? (
                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    defaultChecked={order.status === "fulfilled"}
                    name="markFulfilled"
                    type="checkbox"
                  />
                  Mark as fulfilled
                </label>
              ) : null}
              <button className="secondary-button w-fit px-4 text-sm" type="submit">
                <CheckCircle aria-hidden="true" size={16} />
                Save fulfillment
              </button>
            </form>
          </section>

          {order.customerNote ? (
            <section className="soft-panel p-4">
              <h2 className="text-lg font-semibold text-slate-950">Note</h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {order.customerNote}
              </p>
            </section>
          ) : null}

          <section className="soft-panel p-4">
            <h2 className="text-lg font-semibold text-slate-950">Timeline</h2>
            <div className="mt-4 grid gap-3">
              {lifecycleEvents.map((event) => (
                <div
                  className="grid grid-cols-[auto_1fr] gap-3 text-sm"
                  key={event.label}
                >
                  <span className="mt-1 h-2 w-2 rounded-full bg-slate-900" />
                  <div>
                    <p className="font-semibold text-slate-950">{event.label}</p>
                    <p className="text-slate-500">
                      {new Date(event.value || "").toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <Link className="secondary-button w-fit px-4 text-sm" href={`/stores/${workspace.store.slug}`}>
        <ShoppingBag aria-hidden="true" size={16} />
        Storefront
      </Link>
    </div>
  );
}
