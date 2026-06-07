import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PackageCheck, ShoppingBag } from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { PrintButton } from "@/features/commerce/components/print-button";
import { getStoreWorkspace } from "@/features/commerce/data";
import { fulfillmentStatusLabels, sortFulfillments } from "@/features/commerce/fulfillments";
import { orderStatusLabels } from "@/features/commerce/order-status";

export default async function OrderPackingSlipPage({
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

  const { store } = workspace;
  const shipping = order.shippingAddress;
  const fulfillments = sortFulfillments(order.fulfillments);
  const latestFulfillment = fulfillments[0];
  const trackingCarrier =
    latestFulfillment?.trackingCarrier || order.trackingCarrier;
  const trackingNumber =
    latestFulfillment?.trackingNumber || order.trackingNumber;

  return (
    <main className="liquid-bg min-h-screen px-4 py-6 text-slate-950 sm:px-6 lg:px-8 print:bg-white print:px-0 print:py-0">
      <div className="mx-auto grid max-w-5xl gap-4">
        <div className="flex flex-wrap gap-2 print:hidden">
          <Link
            className="secondary-button px-4 text-sm"
            href={`/dashboard/stores/${store.id}/orders/${order.id}`}
          >
            <ArrowLeft aria-hidden="true" size={16} />
            Order
          </Link>
          <PrintButton />
        </div>

        <section className="soft-panel overflow-hidden bg-white p-6 shadow-none print:border-0 print:p-0">
          <div className="grid gap-6 border-b border-slate-200 pb-6 sm:grid-cols-[1fr_auto]">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-sky-50 text-sky-700 print:hidden">
                  <PackageCheck aria-hidden="true" size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase text-slate-500">
                    Packing slip
                  </p>
                  <h1 className="text-3xl font-semibold">
                    Order {order.id.slice(0, 8)}
                  </h1>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Created {new Date(order.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="flex items-center gap-2 text-lg font-semibold sm:justify-end">
                <ShoppingBag aria-hidden="true" size={18} />
                {store.name}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {orderStatusLabels[order.status]}
              </p>
            </div>
          </div>

          <section className="grid gap-5 border-b border-slate-200 py-6 md:grid-cols-3">
            <div>
              <h2 className="text-sm font-semibold uppercase text-slate-500">
                Ship to
              </h2>
              {shipping ? (
                <div className="mt-3 text-sm leading-6 text-slate-700">
                  <p className="font-semibold text-slate-950">{order.customerName}</p>
                  <p>{shipping.line1}</p>
                  {shipping.line2 ? <p>{shipping.line2}</p> : null}
                  <p>
                    {shipping.city}, {shipping.region} {shipping.postalCode}
                  </p>
                  <p>{shipping.country}</p>
                  {order.customerPhone ? <p>{order.customerPhone}</p> : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No shipping address.</p>
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase text-slate-500">
                Shipment
              </h2>
              <div className="mt-3 text-sm leading-6 text-slate-700">
                <p>
                  {latestFulfillment
                    ? fulfillmentStatusLabels[latestFulfillment.status]
                    : "Not shipped"}
                </p>
                {trackingCarrier ? <p>{trackingCarrier}</p> : null}
                {trackingNumber ? <p>{trackingNumber}</p> : null}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase text-slate-500">
                Contact
              </h2>
              <div className="mt-3 text-sm leading-6 text-slate-700">
                <p>{order.customerEmail}</p>
                {order.customerPhone ? <p>{order.customerPhone}</p> : null}
              </div>
            </div>
          </section>

          <section className="overflow-hidden border-b border-slate-200 py-6">
            <div className="grid grid-cols-[auto_1fr_auto] gap-3 text-xs font-bold uppercase text-slate-500">
              <span>Pick</span>
              <span>Item</span>
              <span>Qty</span>
            </div>
            <div className="mt-3 grid gap-3">
              {(order.items || []).map((item) => (
                <div
                  className="grid grid-cols-[auto_1fr_auto] gap-3 border-t border-slate-100 pt-3 text-sm"
                  key={item.id}
                >
                  <span className="h-5 w-5 rounded-[4px] border border-slate-400" />
                  <div>
                    <p className="font-semibold text-slate-950">{item.productName}</p>
                    {[item.variantName, item.variantSku].filter(Boolean).length > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {[item.variantName, item.variantSku].filter(Boolean).join(" / ")}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-semibold">{item.quantity}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 py-6 text-sm leading-6 text-slate-700 md:grid-cols-2">
            {order.customerNote ? (
              <div>
                <h2 className="text-sm font-semibold uppercase text-slate-500">
                  Customer note
                </h2>
                <p className="mt-2">{order.customerNote}</p>
              </div>
            ) : null}
            {latestFulfillment?.note || order.fulfillmentNote ? (
              <div>
                <h2 className="text-sm font-semibold uppercase text-slate-500">
                  Fulfillment note
                </h2>
                <p className="mt-2">{latestFulfillment?.note || order.fulfillmentNote}</p>
              </div>
            ) : null}
          </section>
        </section>
      </div>
    </main>
  );
}
