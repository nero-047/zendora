import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CheckCircle,
  CreditCard,
  FileText,
  MapPin,
  Package,
  RotateCcw,
  Star,
  Truck,
  XCircle,
} from "lucide-react";

import { OrderCancellationRequestForm } from "@/features/commerce/components/order-cancellation-request-form";
import { OrderDeliveryRequestForm } from "@/features/commerce/components/order-delivery-request-form";
import { ProductReviewForm } from "@/features/commerce/components/product-review-form";
import { ReturnRequestForm } from "@/features/commerce/components/return-request-form";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicOrderReceipt } from "@/features/commerce/data";
import {
  getOrderLifecycleEvents,
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  getReorderCartLines,
  getReorderCheckoutHref,
} from "@/features/commerce/order-reorder";
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
import { getOrderCancellationEligibility } from "@/features/commerce/order-cancellation";
import { getOrderDeliveryRequestEligibility } from "@/features/commerce/order-delivery-request";
import {
  getCustomerReturnRequestEligibility,
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

  const { store, order, products, navigationMenus, productReviews } = data;
  const token = readToken(searchParams.token) || "";
  const shipping = order.shippingAddress;
  const lifecycleEvents = getOrderLifecycleEvents(order);
  const paymentSummary = summarizePaymentTransactions(order.paymentTransactions);
  const paymentTransactions = [...order.paymentTransactions].sort(
    (a, b) =>
      new Date(b.processedAt || b.createdAt).getTime() -
      new Date(a.processedAt || a.createdAt).getTime(),
  );
  const returnEligibility = getCustomerReturnRequestEligibility(order);
  const canRequestReturn = returnEligibility.eligible;
  const cancellationEligibility = getOrderCancellationEligibility(order);
  const canRequestCancellation = cancellationEligibility.eligible;
  const deliveryRequestEligibility = getOrderDeliveryRequestEligibility(order);
  const canRequestDeliveryUpdate = deliveryRequestEligibility.eligible;
  const fulfillments = sortFulfillments(order.fulfillments).filter(
    (fulfillment) => fulfillment.status !== "cancelled",
  );
  const reorderLines = getReorderCartLines(order, products);
  const reorderHref = getReorderCheckoutHref({
    order,
    products,
    storeSlug: store.slug,
  });

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        action="continue"
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        maxWidthClassName="max-w-6xl"
        menus={navigationMenus}
        store={store}
      />

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
            {reorderLines.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
                <Link className="primary-button px-4" href={reorderHref}>
                  Buy again
                  <ArrowRight aria-hidden="true" size={16} />
                </Link>
                <p className="text-sm font-medium text-slate-500">
                  Rebuild checkout with {reorderLines.length} available item
                  {reorderLines.length === 1 ? "" : "s"} from this order.
                </p>
              </div>
            ) : null}
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
                  {returnEligibility.message}
                </p>
              ) : null}
            </div>
          </section>

          <section className="soft-panel p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <XCircle aria-hidden="true" size={18} />
              Cancellation request
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              Ask the merchant to review this order before fulfillment. Captured
              payments may still require refund handling.
            </p>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <OrderCancellationRequestForm
                canRequest={canRequestCancellation}
                orderId={order.id}
                storeSlug={store.slug}
                token={token}
              />
              {!canRequestCancellation ? (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {cancellationEligibility.message}
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
            <div className="mt-4 border-t border-slate-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-950">
                Delivery update request
              </h3>
              <OrderDeliveryRequestForm
                canRequest={canRequestDeliveryUpdate}
                orderId={order.id}
                storeSlug={store.slug}
                token={token}
              />
              {!canRequestDeliveryUpdate ? (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {deliveryRequestEligibility.message}
                </p>
              ) : null}
            </div>
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

      <StorefrontFooter maxWidthClassName="max-w-6xl" menus={navigationMenus} />
    </main>
  );
}
