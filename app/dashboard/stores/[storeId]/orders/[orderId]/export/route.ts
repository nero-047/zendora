import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  fulfillmentStatusLabels,
  sortFulfillments,
} from "@/features/commerce/fulfillments";
import {
  getOrderFulfillmentSummary,
  getOrderRiskAssessment,
  orderRiskLevelLabels,
} from "@/features/commerce/order-insights";
import {
  getOrderLifecycleEvents,
  orderSourceLabels,
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
  returnRequestReasonLabels,
  returnRequestStatusLabels,
} from "@/features/commerce/returns";
import { productReviewStatusLabels } from "@/features/commerce/reviews";
import type { RefundReason } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string; orderId: string }>;
};

type OrderExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number | boolean;
  status?: string;
  detail?: string;
  href?: string;
};

const refundReasonLabels: Record<RefundReason, string> = {
  customer_request: "Customer request",
  damaged: "Damaged item",
  fraud: "Fraud",
  other: "Other",
};

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId, orderId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const order = workspace.orders.find((item) => item.id === orderId);

  if (!order) {
    return new Response("Order not found.", { status: 404 });
  }

  const fulfillmentSummary = getOrderFulfillmentSummary(order);
  const riskAssessment = getOrderRiskAssessment(order, {
    orders: workspace.orders,
  });
  const paymentSummary = summarizePaymentTransactions(order.paymentTransactions);
  const financialReconciliation = getOrderFinancialReconciliation(order);
  const productReviews = workspace.productReviews.filter(
    (review) => review.orderId === order.id,
  );
  const rows: OrderExportRow[] = [
    {
      section: "summary",
      metric: "order_id",
      label: "Order ID",
      value: order.id,
    },
    {
      section: "summary",
      metric: "customer",
      label: "Customer",
      value: order.customerName,
      detail: order.customerEmail,
      href: `/dashboard/stores/${workspace.store.id}/customers/${encodeURIComponent(
        order.customerEmail,
      )}`,
    },
    {
      section: "summary",
      metric: "status",
      label: "Status",
      value: orderStatusLabels[order.status],
      status: order.status,
    },
    {
      section: "summary",
      metric: "source",
      label: "Source",
      value: orderSourceLabels[order.source],
    },
    {
      section: "summary",
      metric: "payment_status",
      label: "Payment status",
      value: paymentStatusLabels[order.paymentStatus],
      status: order.paymentStatus,
    },
    {
      section: "summary",
      metric: "fulfillment",
      label: "Fulfillment",
      value: fulfillmentSummary.label,
      status: fulfillmentSummary.stage,
      detail: fulfillmentSummary.detail,
    },
    {
      section: "summary",
      metric: "risk",
      label: "Risk",
      value: orderRiskLevelLabels[riskAssessment.level],
      status: riskAssessment.level,
      detail: `${riskAssessment.factors.length} risk factors`,
    },
    {
      section: "summary",
      metric: "settlement",
      label: "Settlement",
      value: financialReconciliation.label,
      status: financialReconciliation.status,
      detail: financialReconciliation.detail,
    },
    {
      section: "money",
      metric: "subtotal",
      label: "Subtotal",
      value: formatCurrency(order.subtotalCents, order.currency),
    },
    {
      section: "money",
      metric: "discount",
      label: order.discountCode || "Discount",
      value: formatCurrency(order.discountCents, order.currency),
    },
    {
      section: "money",
      metric: "shipping",
      label: "Shipping",
      value: formatCurrency(order.shippingCents, order.currency),
    },
    {
      section: "money",
      metric: "tax",
      label: `Tax ${(order.taxRateBps / 100).toFixed(2)}%`,
      value: formatCurrency(order.taxCents, order.currency),
    },
    {
      section: "money",
      metric: "gift_card",
      label: "Gift card",
      value: formatCurrency(order.giftCardCents, order.currency),
    },
    {
      section: "money",
      metric: "total",
      label: "Total",
      value: formatCurrency(order.totalCents, order.currency),
    },
    {
      section: "money",
      metric: "refunded",
      label: "Refunded",
      value: formatCurrency(order.refundedCents, order.currency),
    },
    {
      section: "money",
      metric: "amount_due",
      label: "Amount due",
      value: formatCurrency(order.amountDueCents, order.currency),
    },
    {
      section: "ledger",
      metric: "captured",
      label: "Captured",
      value: formatCurrency(paymentSummary.capturedCents, order.currency),
    },
    {
      section: "ledger",
      metric: "payment_refunds",
      label: "Payment refunds",
      value: formatCurrency(paymentSummary.refundedCents, order.currency),
    },
    {
      section: "ledger",
      metric: "net_collected",
      label: "Net collected",
      value: formatCurrency(
        financialReconciliation.netCollectedCents,
        order.currency,
      ),
    },
    {
      section: "ledger",
      metric: "ledger_delta",
      label: "Ledger delta",
      value: formatCurrency(
        financialReconciliation.ledgerDeltaCents,
        order.currency,
      ),
      status: financialReconciliation.severity,
    },
    ...(order.items || []).map((item) => ({
      section: "line_item",
      metric: item.id,
      label: item.productName,
      value: formatCurrency(item.unitPriceCents * item.quantity, order.currency),
      detail: [
        `${item.quantity} x ${formatCurrency(item.unitPriceCents, order.currency)}`,
        item.variantName,
        item.variantSku,
      ]
        .filter(Boolean)
        .join(" / "),
      href: item.productId
        ? `/dashboard/stores/${workspace.store.id}/products/${item.productId}/edit`
        : undefined,
    })),
    ...riskAssessment.factors.map((factor) => ({
      section: "risk_factor",
      metric: factor.id,
      label: factor.label,
      value: factor.severity,
      status: factor.severity,
      detail: factor.detail,
    })),
    ...order.paymentTransactions.map((transaction) => ({
      section: "payment_transaction",
      metric: transaction.id,
      label: paymentTransactionTypeLabels[transaction.type],
      value: formatCurrency(transaction.amountCents, transaction.currency),
      status: paymentTransactionStatusLabels[transaction.status],
      detail: [
        paymentMethodLabels[transaction.paymentMethod],
        transaction.paymentProvider,
        transaction.providerReference,
      ]
        .filter(Boolean)
        .join(" / "),
    })),
    ...sortFulfillments(order.fulfillments).map((fulfillment) => ({
      section: "fulfillment",
      metric: fulfillment.id,
      label:
        [fulfillment.trackingCarrier, fulfillment.trackingNumber]
          .filter(Boolean)
          .join(" / ") || `Shipment ${fulfillment.id.slice(0, 8)}`,
      value: fulfillmentStatusLabels[fulfillment.status],
      status: fulfillment.status,
      detail: fulfillment.note,
      href: fulfillment.trackingUrl,
    })),
    ...order.returnRequests.map((request) => ({
      section: "return_request",
      metric: request.id,
      label: returnRequestReasonLabels[request.reason],
      value: returnRequestStatusLabels[request.status],
      status: request.status,
      detail: [request.note, request.merchantNote].filter(Boolean).join(" / "),
    })),
    ...order.refunds.map((refund) => ({
      section: "refund",
      metric: refund.id,
      label: refundReasonLabels[refund.reason],
      value: formatCurrency(refund.amountCents, order.currency),
      status: refund.restockedInventory ? "restocked" : "no_restock",
      detail: [
        `Payment ${formatCurrency(refund.paymentCents, order.currency)}`,
        `Gift card ${formatCurrency(refund.giftCardCents, order.currency)}`,
        refund.note,
      ]
        .filter(Boolean)
        .join(" / "),
    })),
    ...productReviews.map((review) => ({
      section: "product_review",
      metric: review.id,
      label: review.title || "Product review",
      value: `${review.rating}/5`,
      status: productReviewStatusLabels[review.status],
      detail: review.body,
      href: review.productId
        ? `/dashboard/stores/${workspace.store.id}/products/${review.productId}/edit`
        : undefined,
    })),
    ...getOrderLifecycleEvents(order).map((event) => ({
      section: "timeline",
      metric: event.label.toLowerCase().replaceAll(" ", "_"),
      label: event.label,
      value: event.value ? new Date(event.value).toISOString() : "",
    })),
    ...(order.customerNote
      ? [
          {
            section: "note",
            metric: "customer_note",
            label: "Customer note",
            value: order.customerNote,
          },
        ]
      : []),
    ...(order.internalNote
      ? [
          {
            section: "note",
            metric: "internal_note",
            label: "Internal note",
            value: order.internalNote,
          },
        ]
      : []),
  ];

  return csvResponse<OrderExportRow>({
    filename: `${workspace.store.slug}-${order.id}-order.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
