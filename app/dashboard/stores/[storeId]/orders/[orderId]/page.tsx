import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  BanknoteArrowDown,
  CheckCircle,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  ReceiptText,
  RotateCcw,
  ShoppingBag,
  Star,
  ShieldCheck,
  Truck,
} from "lucide-react";

import { ProductReviewStatusForm } from "@/features/commerce/components/product-review-status-form";
import { requireAppUser } from "@/features/auth/app-user";
import { RefundForm } from "@/features/commerce/components/refund-form";
import { ReturnRequestStatusForm } from "@/features/commerce/components/return-request-status-form";
import {
  confirmOrderPaymentAction,
  updateOrderFulfillmentAction,
  updateOrderFulfillmentStatusAction,
  updateOrderStatusAction,
} from "@/features/commerce/actions";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getOrderLifecycleEvents,
  orderSourceLabels,
  getOrderStatusOptions,
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  getOrderFinancialReconciliation,
  paymentTransactionStatusLabels,
  paymentTransactionTypeLabels,
  summarizePaymentTransactions,
} from "@/features/commerce/payments";
import {
  getOrderFulfillmentSummary,
  getOrderRiskAssessment,
  orderRiskLevelLabels,
} from "@/features/commerce/order-insights";
import {
  fulfillmentStatuses,
  fulfillmentStatusLabels,
  sortFulfillments,
} from "@/features/commerce/fulfillments";
import { maskGiftCardCode } from "@/features/commerce/gift-cards";
import {
  returnRequestReasonLabels,
  returnRequestStatusLabels,
} from "@/features/commerce/returns";
import { productReviewStatusLabels } from "@/features/commerce/reviews";
import type { RefundReason } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

const refundReasonLabels: Record<RefundReason, string> = {
  customer_request: "Customer request",
  damaged: "Damaged item",
  fraud: "Fraud",
  other: "Other",
};

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
  const paymentSummary = summarizePaymentTransactions(order.paymentTransactions);
  const financialReconciliation = getOrderFinancialReconciliation(order);
  const paymentTransactions = [...order.paymentTransactions].sort(
    (a, b) =>
      new Date(b.processedAt || b.createdAt).getTime() -
      new Date(a.processedAt || a.createdAt).getTime(),
  );
  const canConfirmPayment =
    order.status !== "cancelled" &&
    (order.paymentStatus === "pending" || order.paymentStatus === "authorized");
  const orderStatusOptions = getOrderStatusOptions(
    order.status,
    order.paymentStatus,
  );
  const productReviews = workspace.productReviews.filter(
    (review) => review.orderId === order.id,
  );
  const fulfillments = sortFulfillments(order.fulfillments);
  const fulfillmentSummary = getOrderFulfillmentSummary(order);
  const riskAssessment = getOrderRiskAssessment(order, {
    orders: workspace.orders,
  });

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
            <span className="status-pill mb-3 ml-2">
              {orderSourceLabels[order.source]}
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
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            className="secondary-button px-4 text-sm"
            href={`/dashboard/stores/${workspace.store.id}/orders/${order.id}/invoice`}
          >
            <FileText aria-hidden="true" size={16} />
            Invoice
          </Link>
          <Link
            className="secondary-button px-4 text-sm"
            href={`/dashboard/stores/${workspace.store.id}/orders/${order.id}/packing-slip`}
          >
            <PackageCheck aria-hidden="true" size={16} />
            Packing slip
          </Link>
          <Link
            className="secondary-button px-4 text-sm"
            href={`/dashboard/stores/${workspace.store.id}/orders/${order.id}/export`}
          >
            <Download aria-hidden="true" size={16} />
            Export CSV
          </Link>
        </div>

        <form
          action={updateOrderStatusAction.bind(null, workspace.store.id, order.id)}
          className="mt-5 grid gap-2 sm:max-w-xl sm:grid-cols-[1fr_auto]"
        >
          <select className="field" defaultValue={order.status} name="status">
            {orderStatusOptions.map((status) => (
              <option key={status} value={status}>
                {orderStatusLabels[status]}
              </option>
            ))}
          </select>
          <button
            className="secondary-button px-4 text-sm"
            disabled={orderStatusOptions.length === 1}
            type="submit"
          >
            <CheckCircle aria-hidden="true" size={16} />
            Update status
          </button>
        </form>
      </section>

      <section className="grid gap-5 lg:grid-cols-4">
        <div className="soft-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase text-slate-400">
              Fulfillment state
            </h2>
            <Truck aria-hidden="true" className="text-sky-700" size={18} />
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {fulfillmentSummary.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {fulfillmentSummary.detail}
          </p>
        </div>

        <div className="soft-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase text-slate-400">
              Risk review
            </h2>
            {riskAssessment.level === "low" ? (
              <ShieldCheck aria-hidden="true" className="text-emerald-700" size={18} />
            ) : (
              <AlertTriangle aria-hidden="true" className="text-amber-700" size={18} />
            )}
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {orderRiskLevelLabels[riskAssessment.level]}
          </p>
          <div className="mt-3 grid gap-2">
            {riskAssessment.factors.length > 0 ? (
              riskAssessment.factors.slice(0, 3).map((factor) => (
                <p className="text-sm leading-6 text-slate-600" key={factor.id}>
                  <span className="font-semibold text-slate-950">
                    {factor.label}:
                  </span>{" "}
                  {factor.detail}
                </p>
              ))
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                No payment, shipping, or customer-history risk flags.
              </p>
            )}
          </div>
        </div>

        <div className="soft-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase text-slate-400">
              Payment due
            </h2>
            <CreditCard aria-hidden="true" className="text-sky-700" size={18} />
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {formatCurrency(riskAssessment.amountDueCents, order.currency)}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {paymentStatusLabels[order.paymentStatus]} payment status with{" "}
            {formatCurrency(financialReconciliation.netCollectedCents, order.currency)} net
            collected.
          </p>
        </div>

        <div className="soft-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase text-slate-400">
              Settlement
            </h2>
            {financialReconciliation.severity === "success" ? (
              <CheckCircle aria-hidden="true" className="text-emerald-700" size={18} />
            ) : (
              <AlertTriangle aria-hidden="true" className="text-amber-700" size={18} />
            )}
          </div>
          <p className="mt-4 text-2xl font-semibold text-slate-950">
            {financialReconciliation.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {financialReconciliation.detail}
          </p>
        </div>
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
              {order.giftCardCents > 0 ? (
                <div className="flex items-center justify-between gap-3 text-pink-700">
                  <span>
                    Gift card{" "}
                    {order.giftCardCode
                      ? maskGiftCardCode(order.giftCardCode)
                      : ""}
                  </span>
                  <span>-{formatCurrency(order.giftCardCents, order.currency)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 pt-2 text-base font-semibold text-slate-950">
                <span>Total</span>
                <span>{formatCurrency(order.totalCents, order.currency)}</span>
              </div>
              {order.giftCardCents > 0 ? (
                <div className="flex items-center justify-between gap-3 text-base font-semibold text-slate-950">
                  <span>Amount due</span>
                  <span>{formatCurrency(order.amountDueCents, order.currency)}</span>
                </div>
              ) : null}
              {order.refundedCents > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-red-600">
                    <span>Refunded</span>
                    <span>-{formatCurrency(order.refundedCents, order.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 pt-2 text-base font-semibold text-slate-950">
                    <span>Net paid</span>
                    <span>
                      {formatCurrency(order.refundableCents, order.currency)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-5">
          <RefundForm order={order} storeId={workspace.store.id} />

          <section className="soft-panel p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-950">Payment</h2>
              <CreditCard aria-hidden="true" className="text-sky-700" size={18} />
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <p>
                <span className="font-semibold text-slate-950">Status:</span>{" "}
                {paymentStatusLabels[order.paymentStatus]}
              </p>
              <p>
                <span className="font-semibold text-slate-950">Method:</span>{" "}
                {paymentMethodLabels[order.paymentMethod]}
              </p>
              <p>
                <span className="font-semibold text-slate-950">Provider:</span>{" "}
                {order.paymentProvider}
              </p>
              {order.paymentReference ? (
                <p>
                  <span className="font-semibold text-slate-950">Reference:</span>{" "}
                  {order.paymentReference}
                </p>
              ) : null}
              {order.paidAt ? (
                <p>
                  <span className="font-semibold text-slate-950">Captured:</span>{" "}
                  {new Date(order.paidAt).toLocaleString()}
                </p>
              ) : null}
            </div>

            {canConfirmPayment ? (
              <form
                action={confirmOrderPaymentAction.bind(
                  null,
                  workspace.store.id,
                  order.id,
                )}
                className="mt-4 grid gap-3"
              >
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Payment method
                  <select
                    className="field"
                    defaultValue={order.paymentMethod}
                    name="paymentMethod"
                  >
                    <option value="manual_invoice">Manual invoice</option>
                    <option value="bank_transfer">Bank transfer</option>
                    <option value="cash_on_delivery">Cash on delivery</option>
                    <option value="card">Card</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Provider
                  <input
                    className="field"
                    defaultValue={order.paymentProvider}
                    name="paymentProvider"
                    placeholder="Manual, Stripe, bank transfer"
                  />
                </label>
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  Reference
                  <input
                    className="field"
                    defaultValue={order.paymentReference || ""}
                    name="paymentReference"
                    placeholder="Receipt, transfer, or capture id"
                  />
                </label>
                <button className="secondary-button w-fit px-4 text-sm" type="submit">
                  <CheckCircle aria-hidden="true" size={16} />
                  Confirm payment
                </button>
              </form>
            ) : order.status !== "cancelled" ? (
              <p className="mt-4 rounded-[8px] bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                Captured, refunded, or voided payments cannot be captured again.
              </p>
            ) : null}
          </section>

          <section className="soft-panel overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <RotateCcw aria-hidden="true" size={18} />
                Return requests
              </h2>
            </div>
            {order.returnRequests.length > 0 ? (
              order.returnRequests.map((request) => (
                <div
                  className="border-b border-slate-100 p-4 last:border-0"
                  key={request.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {returnRequestReasonLabels[request.reason]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {request.customerEmail} /{" "}
                        {new Date(request.requestedAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="status-pill">
                      {returnRequestStatusLabels[request.status]}
                    </span>
                  </div>
                  {request.note ? (
                    <p className="mt-3 rounded-[8px] bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                      {request.note}
                    </p>
                  ) : null}
                  <ReturnRequestStatusForm
                    orderId={order.id}
                    request={request}
                    storeId={workspace.store.id}
                  />
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">
                No return requests submitted.
              </p>
            )}
          </section>

          <section className="soft-panel overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <Star aria-hidden="true" size={18} />
                Product reviews
              </h2>
            </div>
            {productReviews.length > 0 ? (
              productReviews.map((review) => {
                const orderItem = order.items?.find(
                  (item) =>
                    item.id === review.orderItemId ||
                    item.productId === review.productId,
                );

                return (
                  <div
                    className="border-b border-slate-100 p-4 last:border-0"
                    key={review.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">
                          {orderItem?.productName || "Product review"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {review.customerEmail} /{" "}
                          {new Date(review.reviewedAt).toLocaleString()}
                        </p>
                      </div>
                      <span className="status-pill">
                        {productReviewStatusLabels[review.status]}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-1 text-slate-950">
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
                    <p className="mt-2 rounded-[8px] bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                      {review.body}
                    </p>
                    <ProductReviewStatusForm
                      review={review}
                      storeId={workspace.store.id}
                    />
                  </div>
                );
              })
            ) : (
              <p className="p-4 text-sm text-slate-500">
                Product reviews for this order will appear here.
              </p>
            )}
          </section>

          <section className="soft-panel overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <CreditCard aria-hidden="true" size={18} />
                Payment ledger
              </h2>
            </div>
            <div className="grid gap-2 border-b border-slate-100 p-4 text-sm">
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Captured</span>
                <span className="font-semibold text-slate-950">
                  {formatCurrency(paymentSummary.capturedCents, order.currency)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Payment refunds</span>
                <span className="font-semibold text-red-600">
                  -{formatCurrency(paymentSummary.refundedCents, order.currency)}
                </span>
              </div>
              {financialReconciliation.expectedGiftCardCents > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-slate-600">
                    <span>Gift card tender</span>
                    <span className="font-semibold text-slate-950">
                      {formatCurrency(
                        financialReconciliation.expectedGiftCardCents,
                        order.currency,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-slate-600">
                    <span>Gift card refunds</span>
                    <span className="font-semibold text-red-600">
                      -{formatCurrency(
                        financialReconciliation.giftCardRefundedCents,
                        order.currency,
                      )}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-2 text-slate-600">
                <span>Expected net</span>
                <span className="font-semibold">
                  {formatCurrency(
                    financialReconciliation.expectedNetCents,
                    order.currency,
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-950">
                <span className="font-semibold">Net collected</span>
                <span className="font-semibold">
                  {formatCurrency(
                    financialReconciliation.netCollectedCents,
                    order.currency,
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-600">
                <span>Ledger delta</span>
                <span
                  className={
                    financialReconciliation.ledgerDeltaCents === 0
                      ? "font-semibold text-emerald-700"
                      : "font-semibold text-amber-700"
                  }
                >
                  {formatCurrency(
                    financialReconciliation.ledgerDeltaCents,
                    order.currency,
                  )}
                </span>
              </div>
            </div>
            {paymentTransactions.length > 0 ? (
              paymentTransactions.map((transaction) => (
                <div
                  className="border-b border-slate-100 p-4 last:border-0"
                  key={transaction.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {paymentTransactionTypeLabels[transaction.type]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {transaction.processedAt
                          ? new Date(transaction.processedAt).toLocaleString()
                          : new Date(transaction.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={
                        transaction.type === "refund"
                          ? "text-sm font-semibold text-red-600"
                          : "text-sm font-semibold text-slate-950"
                      }
                    >
                      {transaction.type === "refund" ? "-" : ""}
                      {formatCurrency(
                        transaction.amountCents,
                        transaction.currency,
                      )}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="status-pill">
                      {paymentTransactionStatusLabels[transaction.status]}
                    </span>
                    <span className="status-pill">
                      {paymentMethodLabels[transaction.paymentMethod]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {transaction.paymentProvider}
                    {transaction.providerReference
                      ? ` / ${transaction.providerReference}`
                      : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">
                No payment transactions recorded yet.
              </p>
            )}
          </section>

          <section className="soft-panel overflow-hidden">
            <div className="border-b border-slate-100 p-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                <BanknoteArrowDown aria-hidden="true" size={18} />
                Refund history
              </h2>
            </div>
            {order.refunds.length > 0 ? (
              order.refunds.map((refund) => (
                <div
                  className="border-b border-slate-100 p-4 last:border-0"
                  key={refund.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">
                        {refundReasonLabels[refund.reason]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(refund.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-red-600">
                      -{formatCurrency(refund.amountCents, order.currency)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {refund.restockedInventory ? "Inventory restocked" : "No restock"}
                  </p>
                  {refund.giftCardCents > 0 || refund.paymentCents > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {refund.giftCardCents > 0 ? (
                        <span className="status-pill">
                          Gift card {formatCurrency(refund.giftCardCents, order.currency)}
                        </span>
                      ) : null}
                      {refund.paymentCents > 0 ? (
                        <span className="status-pill">
                          Payment {formatCurrency(refund.paymentCents, order.currency)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {refund.note ? (
                    <p className="mt-2 rounded-[8px] bg-slate-50 p-3 text-sm text-slate-600">
                      {refund.note}
                    </p>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">No refunds recorded.</p>
            )}
          </section>

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
              {fulfillments.length > 0 ? (
                fulfillments.map((fulfillment) => (
                  <div
                    className="rounded-[8px] border border-slate-100 bg-white/70 p-3"
                    key={fulfillment.id}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
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
                        className="mt-2 inline-flex items-center gap-2 font-semibold text-sky-700"
                        href={fulfillment.trackingUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Tracking link
                        <ExternalLink aria-hidden="true" size={14} />
                      </a>
                    ) : null}
                    {fulfillment.note ? (
                      <p className="mt-2 rounded-[8px] bg-slate-50 p-3">
                        {fulfillment.note}
                      </p>
                    ) : null}
                    <form
                      action={updateOrderFulfillmentStatusAction.bind(
                        null,
                        workspace.store.id,
                        order.id,
                        fulfillment.id,
                      )}
                      className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]"
                    >
                      <select
                        aria-label={`Status for fulfillment ${fulfillment.id.slice(0, 8)}`}
                        className="field min-h-10 py-2 text-sm"
                        defaultValue={fulfillment.status}
                        name="status"
                      >
                        {fulfillmentStatuses.map((status) => (
                          <option key={status} value={status}>
                            {fulfillmentStatusLabels[status]}
                          </option>
                        ))}
                      </select>
                      <button className="secondary-button min-h-10 px-3 text-sm" type="submit">
                        <CheckCircle aria-hidden="true" size={16} />
                        Update
                      </button>
                    </form>
                  </div>
                ))
              ) : order.trackingCarrier || order.trackingNumber ? (
                <div className="rounded-[8px] border border-slate-100 bg-white/70 p-3">
                  <p className="font-semibold text-slate-950">
                    {[order.trackingCarrier, order.trackingNumber]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                  {order.trackingUrl ? (
                    <a
                      className="mt-2 inline-flex items-center gap-2 font-semibold text-sky-700"
                      href={order.trackingUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Tracking link
                      <ExternalLink aria-hidden="true" size={14} />
                    </a>
                  ) : null}
                  {order.fulfillmentNote ? (
                    <p className="mt-2 rounded-[8px] bg-slate-50 p-3">
                      {order.fulfillmentNote}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p>No shipments saved yet.</p>
              )}
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
                Shipment status
                <select className="field" defaultValue="in_transit" name="status">
                  {fulfillmentStatuses
                    .filter((status) => status !== "cancelled")
                    .map((status) => (
                      <option key={status} value={status}>
                        {fulfillmentStatusLabels[status]}
                      </option>
                    ))}
                </select>
              </label>
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
                Add shipment
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

          {order.internalNote ? (
            <section className="soft-panel p-4">
              <h2 className="text-lg font-semibold text-slate-950">Internal note</h2>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {order.internalNote}
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
