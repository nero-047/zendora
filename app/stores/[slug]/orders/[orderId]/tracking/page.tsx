import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  ExternalLink,
  MapPin,
  Package,
  Truck,
} from "lucide-react";

import { getPublicOrderReceipt } from "@/features/commerce/data";
import {
  fulfillmentStatusLabels,
  sortFulfillments,
} from "@/features/commerce/fulfillments";
import {
  orderStatusLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import { getStoreSeoTitle } from "@/features/commerce/seo";
import type { OrderFulfillment } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type PublicOrderTrackingPageProps = {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

type TrackingEvent = {
  label: string;
  value?: string;
};

function readToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getTrackingData(props: PublicOrderTrackingPageProps) {
  const [{ slug, orderId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);

  return getPublicOrderReceipt({
    slug,
    orderId,
    token: readToken(searchParams.token),
  });
}

function getTrackingLabel(input: {
  fulfillments: OrderFulfillment[];
  orderStatus: string;
}) {
  const latest = input.fulfillments[0];

  if (!latest) {
    if (input.orderStatus === "cancelled") {
      return "Order cancelled";
    }

    return "Preparing order";
  }

  return fulfillmentStatusLabels[latest.status];
}

function getTrackingEvents(input: {
  cancelledAt?: string;
  createdAt: string;
  fulfillments: OrderFulfillment[];
  paidAt?: string;
}) {
  const events: TrackingEvent[] = [
    { label: "Order placed", value: input.createdAt },
    { label: "Payment confirmed", value: input.paidAt },
  ];

  for (const fulfillment of input.fulfillments) {
    events.push({
      label: `Shipment ${fulfillmentStatusLabels[fulfillment.status].toLowerCase()}`,
      value:
        fulfillment.deliveredAt ||
        fulfillment.shippedAt ||
        fulfillment.updatedAt ||
        fulfillment.createdAt,
    });

    if (fulfillment.trackingNumber) {
      events.push({
        label: `Tracking number ${fulfillment.trackingNumber}`,
        value: fulfillment.shippedAt || fulfillment.createdAt,
      });
    }
  }

  events.push({ label: "Order cancelled", value: input.cancelledAt });

  return events
    .filter((event) => Boolean(event.value))
    .sort(
      (a, b) =>
        new Date(a.value || "").getTime() -
        new Date(b.value || "").getTime(),
    );
}

export async function generateMetadata(
  props: PublicOrderTrackingPageProps,
): Promise<Metadata> {
  const data = await getTrackingData(props);

  if (!data) {
    return {
      title: "Tracking not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(data.store, `Tracking ${data.order.id.slice(0, 8)}`),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function PublicOrderTrackingPage(
  props: PublicOrderTrackingPageProps,
) {
  const [searchParams, data] = await Promise.all([
    props.searchParams,
    getTrackingData(props),
  ]);

  if (!data) {
    notFound();
  }

  const token = readToken(searchParams.token) || "";
  const { order, store } = data;
  const activeFulfillments = sortFulfillments(order.fulfillments).filter(
    (fulfillment) => fulfillment.status !== "cancelled",
  );
  const latestFulfillment = activeFulfillments[0];
  const shipping = order.shippingAddress;
  const receiptHref = `/stores/${store.slug}/orders/${
    order.id
  }?token=${encodeURIComponent(token)}`;
  const trackingLabel = getTrackingLabel({
    fulfillments: activeFulfillments,
    orderStatus: order.status,
  });
  const trackingEvents = getTrackingEvents({
    cancelledAt: order.cancelledAt,
    createdAt: order.createdAt,
    fulfillments: activeFulfillments,
    paidAt: order.paidAt,
  });

  return (
    <main className="liquid-bg min-h-screen px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-4">
        <div className="flex flex-wrap gap-2">
          <Link className="secondary-button px-4 text-sm" href={receiptHref}>
            <ArrowLeft aria-hidden="true" size={16} />
            Order receipt
          </Link>
        </div>

        <section className="glass-panel p-5 sm:p-6">
          <span className="status-pill mb-4">
            <Truck aria-hidden="true" size={14} />
            {trackingLabel}
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-slate-950">
            Order tracking
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Follow order {order.id.slice(0, 8)} from {store.name}. Updates stay
            tied to this private customer link.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[8px] border border-slate-100 bg-white/70 p-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                Order
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {orderStatusLabels[order.status]}
              </p>
            </div>
            <div className="rounded-[8px] border border-slate-100 bg-white/70 p-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                Payment
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {paymentStatusLabels[order.paymentStatus]}
              </p>
            </div>
            <div className="rounded-[8px] border border-slate-100 bg-white/70 p-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                Total
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-950">
                {formatCurrency(order.totalCents, order.currency)}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_0.86fr]">
          <div className="grid gap-4">
            <section className="soft-panel p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Package aria-hidden="true" size={18} />
                Shipment status
              </h2>
              {latestFulfillment ? (
                <div className="mt-4 rounded-[8px] border border-slate-100 bg-white/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        {[latestFulfillment.trackingCarrier, latestFulfillment.trackingNumber]
                          .filter(Boolean)
                          .join(" / ") || `Shipment ${latestFulfillment.id.slice(0, 8)}`}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {new Date(
                          latestFulfillment.shippedAt ||
                            latestFulfillment.createdAt,
                        ).toLocaleString()}
                      </p>
                    </div>
                    <span className="status-pill">
                      {fulfillmentStatusLabels[latestFulfillment.status]}
                    </span>
                  </div>
                  {latestFulfillment.note ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      {latestFulfillment.note}
                    </p>
                  ) : null}
                  {latestFulfillment.trackingUrl ? (
                    <a
                      className="secondary-button mt-4 w-fit px-4 text-sm"
                      href={latestFulfillment.trackingUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Carrier tracking
                      <ExternalLink aria-hidden="true" size={15} />
                    </a>
                  ) : null}
                </div>
              ) : (
                <p className="mt-4 rounded-[8px] border border-slate-100 bg-white/70 p-4 text-sm leading-6 text-slate-600">
                  The merchant is preparing this order. Carrier details will
                  appear here after fulfillment starts.
                </p>
              )}
            </section>

            <section className="soft-panel overflow-hidden">
              <div className="border-b border-slate-100 p-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                  <Package aria-hidden="true" size={18} />
                  Items in this order
                </h2>
              </div>
              {(order.items || []).map((item) => (
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
                        {[item.variantName, item.variantSku]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold text-slate-950">
                    x {item.quantity}
                  </p>
                </div>
              ))}
            </section>
          </div>

          <aside className="grid gap-4">
            <section className="soft-panel p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <MapPin aria-hidden="true" size={18} />
                Delivery address
              </h2>
              {shipping ? (
                <div className="mt-4 text-sm leading-6 text-slate-600">
                  <p>{shipping.line1}</p>
                  {shipping.line2 ? <p>{shipping.line2}</p> : null}
                  <p>
                    {shipping.city}, {shipping.region} {shipping.postalCode}
                  </p>
                  <p>{shipping.country}</p>
                </div>
              ) : (
                <p className="mt-4 text-sm leading-6 text-slate-500">
                  No delivery address is saved for this order.
                </p>
              )}
            </section>

            <section className="soft-panel p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Clock aria-hidden="true" size={18} />
                Tracking timeline
              </h2>
              <div className="mt-4 grid gap-3">
                {trackingEvents.map((event) => (
                  <div className="grid grid-cols-[auto_1fr] gap-3 text-sm" key={`${event.label}:${event.value}`}>
                    <CheckCircle
                      aria-hidden="true"
                      className="mt-0.5 text-emerald-600"
                      size={16}
                    />
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
          </aside>
        </section>
      </div>
    </main>
  );
}
