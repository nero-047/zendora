import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  CreditCard,
  FileText,
  MapPin,
  Package,
  RotateCcw,
  ShoppingBag,
  Star,
  Truck,
} from "lucide-react";

import { ProductReviewForm } from "@/features/commerce/components/product-review-form";
import { ReturnRequestForm } from "@/features/commerce/components/return-request-form";
import { getPublicOrderReceipt } from "@/features/commerce/data";
import {
  getOrderLifecycleEvents,
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  paymentTransactionStatusLabels,
  paymentTransactionTypeLabels,
  summarizePaymentTransactions,
} from "@/features/commerce/payments";
import {
  fulfillmentStatusLabels,
  sortFulfillments,
} from "@/features/commerce/fulfillments";
import { maskGiftCardCode } from "@/features/commerce/gift-cards";
import {
  getPolicyHref,
  getPublishedPolicies,
  storePolicyLabels,
} from "@/features/commerce/policies";
import {
  canCustomerRequestReturn,
  returnRequestReasonLabels,
  returnRequestStatusLabels,
} from "@/features/commerce/returns";
import {
  canCustomerReviewOrderItem,
  productReviewStatusLabels,
} from "@/features/commerce/reviews";
import { getStoreSeoTitle } from "@/features/commerce/seo";
import { formatCurrency } from "@/lib/utils";

type OrderReceiptPageProps = {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ token?: string | string[] }>;
};

function readToken(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function getReceiptData(props: OrderReceiptPageProps) {
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

export async function generateMetadata(
  props: OrderReceiptPageProps,
): Promise<Metadata> {
  const data = await getReceiptData(props);

  if (!data) {
    return {
      title: "Order not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(data.store, `Order ${data.order.id.slice(0, 8)}`),
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function OrderReceiptPage(props: OrderReceiptPageProps) {
  const [searchParams, data] = await Promise.all([
    props.searchParams,
    getReceiptData(props),
  ]);

  if (!data) {
    notFound();
  }

  const { store, order, policies, productReviews } = data;
  const token = readToken(searchParams.token) || "";
  const shipping = order.shippingAddress;
  const lifecycleEvents = getOrderLifecycleEvents(order);
  const paymentSummary = summarizePaymentTransactions(order.paymentTransactions);
  const paymentTransactions = [...order.paymentTransactions].sort(
    (a, b) =>
      new Date(b.processedAt || b.createdAt).getTime() -
      new Date(a.processedAt || a.createdAt).getTime(),
  );
  const publishedPolicies = getPublishedPolicies(policies);
  const canRequestReturn = canCustomerRequestReturn(order);
  const fulfillments = sortFulfillments(order.fulfillments).filter(
    (fulfillment) => fulfillment.status !== "cancelled",
  );

  return (
    <main className="liquid-bg min-h-screen">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link className="secondary-button px-3 text-sm" href={`/stores/${store.slug}`}>
          <ArrowLeft aria-hidden="true" size={16} />
          {store.name}
        </Link>
        <Link className="primary-button px-3 text-sm" href={`/stores/${store.slug}`}>
          <ShoppingBag aria-hidden="true" size={16} />
          Continue shopping
        </Link>
      </nav>

      <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1fr_0.78fr]">
        <div className="grid gap-5">
          <section className="glass-panel p-5 sm:p-6">
            <span className="status-pill mb-4">
              <CheckCircle aria-hidden="true" size={14} />
              {orderStatusLabels[order.status]}
            </span>
            <h1 className="text-4xl font-semibold leading-tight text-slate-950">
              Order received
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              {store.name} has received order {order.id.slice(0, 8)} for{" "}
              {order.customerEmail}.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
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
                  Method
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  {paymentMethodLabels[order.paymentMethod]}
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
              {order.giftCardCents > 0 ? (
                <>
                  <div className="rounded-[8px] border border-slate-100 bg-white/70 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Gift card
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      -{formatCurrency(order.giftCardCents, order.currency)}
                    </p>
                    {order.giftCardCode ? (
                      <p className="mt-1 text-xs text-slate-500">
                        {maskGiftCardCode(order.giftCardCode)}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-[8px] border border-slate-100 bg-white/70 p-3">
                    <p className="text-xs font-semibold uppercase text-slate-400">
                      Amount due
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      {formatCurrency(order.amountDueCents, order.currency)}
                    </p>
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="soft-panel overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Package aria-hidden="true" size={18} />
                Items
              </h2>
            </div>
            {order.items?.map((item) => (
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
                    {formatCurrency(item.unitPriceCents, order.currency)} x{" "}
                    {item.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-950">
                  {formatCurrency(item.unitPriceCents * item.quantity, order.currency)}
                </p>
              </div>
            ))}
          </section>

          <section className="soft-panel overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Star aria-hidden="true" size={18} />
                Product reviews
              </h2>
            </div>
            {order.items?.length ? (
              order.items.map((item) => {
                const review = productReviews.find((productReview) => {
                  if (item.id && productReview.orderItemId === item.id) {
                    return true;
                  }

                  return productReview.productId === item.productId;
                });
                const canReview = canCustomerReviewOrderItem({
                  orderStatus: order.status,
                  paymentStatus: order.paymentStatus,
                  productId: item.productId,
                  orderItemId: item.id,
                  existingReviews: productReviews,
                  orderId: order.id,
                });

                return (
                  <div
                    className="border-b border-slate-100 p-4 last:border-0"
                    key={item.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {item.productName}
                        </p>
                        {item.variantName ? (
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {item.variantName}
                          </p>
                        ) : null}
                      </div>
                      {review ? (
                        <span className="status-pill">
                          {productReviewStatusLabels[review.status]}
                        </span>
                      ) : null}
                    </div>
                    {review ? (
                      <div className="mt-3 rounded-[8px] bg-slate-50 p-3">
                        <div className="flex items-center gap-1 text-slate-950">
                          {Array.from({ length: 5 }, (_, index) => (
                            <Star
                              aria-hidden="true"
                              className={
                                index < review.rating
                                  ? "fill-slate-950 text-slate-950"
                                  : "text-slate-300"
                              }
                              key={index}
                              size={14}
                            />
                          ))}
                        </div>
                        {review.title ? (
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {review.title}
                          </p>
                        ) : null}
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {review.body}
                        </p>
                      </div>
                    ) : item.productId ? (
                      <ProductReviewForm
                        canReview={canReview}
                        orderId={order.id}
                        orderItemId={item.id}
                        productId={item.productId}
                        productName={item.productName}
                        storeSlug={store.slug}
                        token={token}
                      />
                    ) : (
                      <p className="mt-3 text-sm text-slate-500">
                        This item is not eligible for reviews.
                      </p>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="p-4 text-sm text-slate-500">
                No reviewable items found.
              </p>
            )}
          </section>
        </div>

        <aside className="grid gap-5">
          <section className="soft-panel p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <CreditCard aria-hidden="true" size={18} />
              Payment summary
            </h2>
            <div className="mt-4 grid gap-2 text-sm">
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Captured</span>
                <span>{formatCurrency(paymentSummary.capturedCents, order.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Refunded</span>
                <span>-{formatCurrency(paymentSummary.refundedCents, order.currency)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 font-semibold text-slate-950">
                <span>Net captured</span>
                <span>
                  {formatCurrency(paymentSummary.netCapturedCents, order.currency)}
                </span>
              </div>
            </div>
            {paymentTransactions.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {paymentTransactions.map((transaction) => (
                  <div className="rounded-[8px] bg-slate-50 p-3" key={transaction.id}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-950">
                        {paymentTransactionTypeLabels[transaction.type]}
                      </span>
                      <span className="text-sm font-semibold text-slate-950">
                        {transaction.type === "refund" ? "-" : ""}
                        {formatCurrency(
                          transaction.amountCents,
                          transaction.currency,
                        )}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {paymentTransactionStatusLabels[transaction.status]} /{" "}
                      {transaction.paymentProvider}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="soft-panel p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <RotateCcw aria-hidden="true" size={18} />
              Returns
            </h2>
            {order.returnRequests.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {order.returnRequests.map((request) => (
                  <div className="rounded-[8px] bg-slate-50 p-3" key={request.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {returnRequestReasonLabels[request.reason]}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {new Date(request.requestedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="status-pill">
                        {returnRequestStatusLabels[request.status]}
                      </span>
                    </div>
                    {request.note ? (
                      <p className="mt-2 text-sm leading-6 text-slate-600">
                        {request.note}
                      </p>
                    ) : null}
                    {request.merchantNote ? (
                      <p className="mt-2 rounded-[8px] bg-white/80 p-3 text-sm leading-6 text-slate-600">
                        {request.merchantNote}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm leading-6 text-slate-500">
                No return requests have been submitted for this order.
              </p>
            )}
            <div className="mt-4 border-t border-slate-100 pt-4">
              <ReturnRequestForm
                canRequest={canRequestReturn}
                orderId={order.id}
                storeSlug={store.slug}
                token={token}
              />
              {!canRequestReturn ? (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Returns are available after payment while no active return request
                  is open.
                </p>
              ) : null}
            </div>
          </section>

          <section className="soft-panel p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Truck aria-hidden="true" size={18} />
              Delivery
            </h2>
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
              <p className="mt-4 text-sm text-slate-500">No delivery address saved.</p>
            )}
            {order.trackingCarrier || order.trackingNumber ? (
              <p className="mt-4 text-sm font-semibold text-slate-950">
                {[order.trackingCarrier, order.trackingNumber]
                  .filter(Boolean)
                  .join(" / ")}
              </p>
            ) : null}
            {fulfillments.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {fulfillments.map((fulfillment) => (
                  <div
                    className="rounded-[8px] border border-slate-100 bg-white/70 p-3"
                    key={fulfillment.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">
                          {[fulfillment.trackingCarrier, fulfillment.trackingNumber]
                            .filter(Boolean)
                            .join(" / ") || `Shipment ${fulfillment.id.slice(0, 8)}`}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">
                          {new Date(
                            fulfillment.shippedAt || fulfillment.createdAt,
                          ).toLocaleString()}
                        </p>
                      </div>
                      <span className="status-pill">
                        {fulfillmentStatusLabels[fulfillment.status]}
                      </span>
                    </div>
                    {fulfillment.trackingUrl ? (
                      <a
                        className="mt-2 inline-flex text-sm font-semibold text-sky-700"
                        href={fulfillment.trackingUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Tracking link
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="soft-panel p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <FileText aria-hidden="true" size={18} />
              Timeline
            </h2>
            <div className="mt-4 grid gap-3">
              {lifecycleEvents.map((event) => (
                <div className="grid grid-cols-[auto_1fr] gap-3 text-sm" key={event.label}>
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
        </aside>
      </section>

      {publishedPolicies.length > 0 ? (
        <footer className="mx-auto flex max-w-6xl flex-wrap gap-3 px-4 pb-10 sm:px-6">
          {publishedPolicies.map((policy) => (
            <Link
              className="text-sm font-semibold text-slate-600 hover:text-slate-950"
              href={getPolicyHref(store.slug, policy.type)}
              key={policy.id}
            >
              {storePolicyLabels[policy.type]}
            </Link>
          ))}
        </footer>
      ) : null}
    </main>
  );
}
