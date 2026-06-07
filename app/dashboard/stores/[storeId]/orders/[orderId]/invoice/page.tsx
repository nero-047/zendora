import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ShoppingBag } from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { PrintButton } from "@/features/commerce/components/print-button";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import { formatCurrency } from "@/lib/utils";

export default async function OrderInvoicePage({
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
  const netPaidCents = Math.max(0, order.totalCents - order.refundedCents);

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
                  <FileText aria-hidden="true" size={22} />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase text-slate-500">
                    Invoice
                  </p>
                  <h1 className="text-3xl font-semibold">
                    Order {order.id.slice(0, 8)}
                  </h1>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Issued {new Date(order.createdAt).toLocaleString()}
              </p>
            </div>
            <div className="text-left sm:text-right">
              <p className="flex items-center gap-2 text-lg font-semibold sm:justify-end">
                <ShoppingBag aria-hidden="true" size={18} />
                {store.name}
              </p>
              <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">
                {store.description}
              </p>
            </div>
          </div>

          <section className="grid gap-5 border-b border-slate-200 py-6 md:grid-cols-3">
            <div>
              <h2 className="text-sm font-semibold uppercase text-slate-500">
                Bill to
              </h2>
              <div className="mt-3 text-sm leading-6 text-slate-700">
                <p className="font-semibold text-slate-950">{order.customerName}</p>
                <p>{order.customerEmail}</p>
                {order.customerPhone ? <p>{order.customerPhone}</p> : null}
              </div>
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase text-slate-500">
                Ship to
              </h2>
              {shipping ? (
                <div className="mt-3 text-sm leading-6 text-slate-700">
                  <p>{shipping.line1}</p>
                  {shipping.line2 ? <p>{shipping.line2}</p> : null}
                  <p>
                    {shipping.city}, {shipping.region} {shipping.postalCode}
                  </p>
                  <p>{shipping.country}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">No shipping address.</p>
              )}
            </div>
            <div>
              <h2 className="text-sm font-semibold uppercase text-slate-500">
                Payment
              </h2>
              <div className="mt-3 text-sm leading-6 text-slate-700">
                <p>{paymentStatusLabels[order.paymentStatus]}</p>
                <p>{paymentMethodLabels[order.paymentMethod]}</p>
                <p>{order.paymentProvider}</p>
                {order.paymentReference ? <p>{order.paymentReference}</p> : null}
              </div>
            </div>
          </section>

          <section className="overflow-hidden border-b border-slate-200 py-6">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 text-xs font-bold uppercase text-slate-500">
              <span>Item</span>
              <span>Qty</span>
              <span>Total</span>
            </div>
            <div className="mt-3 grid gap-3">
              {(order.items || []).map((item) => (
                <div
                  className="grid grid-cols-[1fr_auto_auto] gap-3 border-t border-slate-100 pt-3 text-sm"
                  key={item.id}
                >
                  <div>
                    <p className="font-semibold text-slate-950">{item.productName}</p>
                    {[item.variantName, item.variantSku].filter(Boolean).length > 0 ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {[item.variantName, item.variantSku].filter(Boolean).join(" / ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {formatCurrency(item.unitPriceCents, order.currency)} each
                    </p>
                  </div>
                  <p className="font-semibold">{item.quantity}</p>
                  <p className="font-semibold">
                    {formatCurrency(
                      item.unitPriceCents * item.quantity,
                      order.currency,
                    )}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-6 py-6 md:grid-cols-[1fr_20rem]">
            <div className="text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-950">
                {orderStatusLabels[order.status]}
              </p>
              {order.customerNote ? <p className="mt-2">{order.customerNote}</p> : null}
            </div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotalCents, order.currency)}</span>
              </div>
              {order.discountCents > 0 ? (
                <div className="flex justify-between gap-3 text-emerald-700">
                  <span>{order.discountCode || "Discount"}</span>
                  <span>-{formatCurrency(order.discountCents, order.currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <span>Shipping</span>
                <span>{formatCurrency(order.shippingCents, order.currency)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>Tax</span>
                <span>{formatCurrency(order.taxCents, order.currency)}</span>
              </div>
              {order.giftCardCents > 0 ? (
                <div className="flex justify-between gap-3">
                  <span>Gift card</span>
                  <span>-{formatCurrency(order.giftCardCents, order.currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(order.totalCents, order.currency)}</span>
              </div>
              {order.refundedCents > 0 ? (
                <>
                  <div className="flex justify-between gap-3 text-red-600">
                    <span>Refunded</span>
                    <span>-{formatCurrency(order.refundedCents, order.currency)}</span>
                  </div>
                  <div className="flex justify-between gap-3 text-base font-semibold">
                    <span>Net paid</span>
                    <span>{formatCurrency(netPaidCents, order.currency)}</span>
                  </div>
                </>
              ) : null}
              {order.amountDueCents > 0 ? (
                <div className="flex justify-between gap-3 text-base font-semibold">
                  <span>Amount due</span>
                  <span>{formatCurrency(order.amountDueCents, order.currency)}</span>
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}
