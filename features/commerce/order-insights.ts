import { getActiveFulfillments, getLatestFulfillment } from "@/features/commerce/fulfillments";
import {
  getOrderAmountDueCents,
  isPaymentCollectionOpen,
  summarizePaymentTransactions,
} from "@/features/commerce/payments";
import type { Order, OrderFulfillment } from "@/features/commerce/types";

export type OrderFulfillmentStage =
  | "unfulfilled"
  | "preparing"
  | "in_transit"
  | "delivered"
  | "fulfilled"
  | "cancelled";

export type OrderRiskLevel = "low" | "medium" | "high";
export type OrderRiskFactorSeverity = "info" | "warning" | "critical";

export type OrderRiskFactor = {
  id: string;
  label: string;
  severity: OrderRiskFactorSeverity;
  detail: string;
};

export type OrderRiskAssessment = {
  level: OrderRiskLevel;
  score: number;
  amountDueCents: number;
  factors: OrderRiskFactor[];
};

export type OrderFulfillmentSummary = {
  stage: OrderFulfillmentStage;
  label: string;
  detail: string;
  activeFulfillmentCount: number;
  latestFulfillment?: OrderFulfillment;
  hasTracking: boolean;
};

export const orderFulfillmentStageLabels: Record<OrderFulfillmentStage, string> = {
  unfulfilled: "Unfulfilled",
  preparing: "Preparing shipment",
  in_transit: "In transit",
  delivered: "Delivered",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export const orderRiskLevelLabels: Record<OrderRiskLevel, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
};

const HIGH_VALUE_ORDER_CENTS = 100000;
const CASH_ON_DELIVERY_REVIEW_CENTS = 50000;
const STALE_PENDING_ORDER_HOURS = 48;

function hasTrackingDetails(
  order: Pick<Order, "trackingCarrier" | "trackingNumber" | "trackingUrl">,
  latestFulfillment?: OrderFulfillment,
) {
  return Boolean(
    order.trackingCarrier ||
      order.trackingNumber ||
      order.trackingUrl ||
      latestFulfillment?.trackingCarrier ||
      latestFulfillment?.trackingNumber ||
      latestFulfillment?.trackingUrl,
  );
}

export function getOrderFulfillmentSummary(
  order: Pick<
    Order,
    | "status"
    | "paymentStatus"
    | "trackingCarrier"
    | "trackingNumber"
    | "trackingUrl"
    | "fulfillments"
  >,
): OrderFulfillmentSummary {
  const activeFulfillments = getActiveFulfillments(order.fulfillments);
  const latestFulfillment = getLatestFulfillment(order.fulfillments);
  const hasTracking = hasTrackingDetails(order, latestFulfillment);

  if (order.status === "cancelled") {
    return {
      stage: "cancelled",
      label: orderFulfillmentStageLabels.cancelled,
      detail: "Order is cancelled and fulfillment is closed.",
      activeFulfillmentCount: activeFulfillments.length,
      latestFulfillment,
      hasTracking,
    };
  }

  if (activeFulfillments.length === 0) {
    if (order.status === "fulfilled") {
      return {
        stage: "fulfilled",
        label: orderFulfillmentStageLabels.fulfilled,
        detail: hasTracking
          ? "Order is marked fulfilled with legacy tracking details."
          : "Order is marked fulfilled without a shipment record.",
        activeFulfillmentCount: 0,
        latestFulfillment,
        hasTracking,
      };
    }

    return {
      stage: "unfulfilled",
      label: orderFulfillmentStageLabels.unfulfilled,
      detail:
        order.paymentStatus === "paid"
          ? "Paid order is ready for fulfillment."
          : "Awaiting payment before fulfillment.",
      activeFulfillmentCount: 0,
      latestFulfillment,
      hasTracking,
    };
  }

  if (activeFulfillments.every((fulfillment) => fulfillment.status === "delivered")) {
    return {
      stage: "delivered",
      label: orderFulfillmentStageLabels.delivered,
      detail: `${activeFulfillments.length} shipment${
        activeFulfillments.length === 1 ? "" : "s"
      } delivered.`,
      activeFulfillmentCount: activeFulfillments.length,
      latestFulfillment,
      hasTracking,
    };
  }

  if (activeFulfillments.some((fulfillment) => fulfillment.status === "in_transit")) {
    return {
      stage: "in_transit",
      label: orderFulfillmentStageLabels.in_transit,
      detail: `${activeFulfillments.length} active shipment${
        activeFulfillments.length === 1 ? "" : "s"
      } in progress.`,
      activeFulfillmentCount: activeFulfillments.length,
      latestFulfillment,
      hasTracking,
    };
  }

  return {
    stage: "preparing",
    label: orderFulfillmentStageLabels.preparing,
    detail: `${activeFulfillments.length} shipment${
      activeFulfillments.length === 1 ? "" : "s"
    } created and waiting for carrier handoff.`,
    activeFulfillmentCount: activeFulfillments.length,
    latestFulfillment,
    hasTracking,
  };
}

function getRiskScore(factor: OrderRiskFactor) {
  if (factor.severity === "critical") {
    return 2;
  }

  if (factor.severity === "warning") {
    return 1;
  }

  return 0.25;
}

function getRiskLevel(factors: OrderRiskFactor[]): OrderRiskLevel {
  const score = factors.reduce((sum, factor) => sum + getRiskScore(factor), 0);

  if (factors.some((factor) => factor.severity === "critical") || score >= 3) {
    return "high";
  }

  return score >= 1 ? "medium" : "low";
}

function getHoursSince(value: string, now: Date) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - timestamp) / 3600000));
}

export function getOrderRiskAssessment(
  order: Order,
  context: {
    orders?: Order[];
    now?: Date;
  } = {},
): OrderRiskAssessment {
  const now = context.now || new Date();
  const amountDueCents = getOrderAmountDueCents({
    amountDueCents: order.amountDueCents,
    giftCardCents: order.giftCardCents,
    paymentStatus: order.paymentStatus,
    totalCents: order.totalCents,
  });
  const paymentSummary = summarizePaymentTransactions(order.paymentTransactions);
  const paymentRefundedCents = order.refunds.reduce(
    (sum, refund) => sum + refund.paymentCents,
    0,
  );
  const expectedNetPaymentCents = Math.max(
    0,
    order.totalCents - order.giftCardCents - paymentRefundedCents,
  );
  const factors: OrderRiskFactor[] = [];

  if (order.status !== "cancelled" && amountDueCents > 0) {
    factors.push({
      id: "payment_open",
      label: "Payment still open",
      severity: order.paymentStatus === "authorized" ? "warning" : "critical",
      detail: "The order still has an amount due before it can be treated as settled.",
    });
  }

  if (
    order.paymentStatus === "pending" &&
    getHoursSince(order.createdAt, now) >= STALE_PENDING_ORDER_HOURS
  ) {
    factors.push({
      id: "stale_pending_payment",
      label: "Stale pending payment",
      severity: "warning",
      detail: "Payment has been pending for more than 48 hours.",
    });
  }

  if (order.totalCents >= HIGH_VALUE_ORDER_CENTS) {
    factors.push({
      id: "high_value_order",
      label: "High value order",
      severity: "warning",
      detail: "Review shipping and payment details before fulfillment.",
    });
  }

  if (
    order.paymentMethod === "cash_on_delivery" &&
    order.totalCents >= CASH_ON_DELIVERY_REVIEW_CENTS
  ) {
    factors.push({
      id: "cash_on_delivery_review",
      label: "COD review",
      severity: "warning",
      detail: "Large cash-on-delivery orders should be confirmed before dispatch.",
    });
  }

  if (!order.shippingAddress && order.status !== "cancelled") {
    factors.push({
      id: "missing_shipping_address",
      label: "Missing shipping address",
      severity: "warning",
      detail: "The order cannot be shipped until a delivery address is available.",
    });
  }

  if (
    !isPaymentCollectionOpen(order.paymentStatus) &&
    paymentSummary.netCapturedCents < expectedNetPaymentCents
  ) {
    factors.push({
      id: "ledger_below_amount_due",
      label: "Payment ledger mismatch",
      severity: "warning",
      detail: "Captured payment records are lower than the current amount due.",
    });
  }

  const relatedOrders = (context.orders || []).filter(
    (candidate) =>
      candidate.id !== order.id &&
      candidate.customerEmail.trim().toLowerCase() ===
        order.customerEmail.trim().toLowerCase(),
  );
  const cancelledRelatedOrders = relatedOrders.filter(
    (candidate) => candidate.status === "cancelled",
  );
  const refundedRelatedOrders = relatedOrders.filter(
    (candidate) =>
      candidate.paymentStatus === "refunded" ||
      candidate.paymentStatus === "partially_refunded",
  );

  if (cancelledRelatedOrders.length >= 2) {
    factors.push({
      id: "repeat_cancelled_customer_orders",
      label: "Repeat cancelled orders",
      severity: "warning",
      detail: "This customer has multiple previously cancelled orders.",
    });
  }

  if (refundedRelatedOrders.length >= 2) {
    factors.push({
      id: "repeat_refunded_customer_orders",
      label: "Repeat refunded orders",
      severity: "warning",
      detail: "This customer has multiple previously refunded orders.",
    });
  }

  const level = getRiskLevel(factors);

  return {
    level,
    score: factors.reduce((sum, factor) => sum + getRiskScore(factor), 0),
    amountDueCents,
    factors,
  };
}
