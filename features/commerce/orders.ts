import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import {
  type OrderFulfillmentStage,
  type OrderRiskLevel,
  getOrderFulfillmentSummary,
  getOrderRiskAssessment,
  orderFulfillmentStageLabels,
  orderRiskLevelLabels,
} from "@/features/commerce/order-insights";
import type {
  Order,
  OrderSource,
  OrderStatus,
  PaymentStatus,
} from "@/features/commerce/types";

export const orderStatusFilters = [
  "all",
  "pending",
  "paid",
  "fulfilled",
  "cancelled",
] as const;

export type OrderStatusFilter = (typeof orderStatusFilters)[number];

export const orderPaymentStatusFilters = [
  "all",
  "pending",
  "authorized",
  "paid",
  "partially_refunded",
  "refunded",
  "voided",
] as const;

export type OrderPaymentStatusFilter =
  (typeof orderPaymentStatusFilters)[number];

export const orderSourceFilters = ["all", "storefront", "manual"] as const;

export type OrderSourceFilter = (typeof orderSourceFilters)[number];

export const orderFulfillmentStageFilters = [
  "all",
  "unfulfilled",
  "preparing",
  "in_transit",
  "delivered",
  "fulfilled",
  "cancelled",
] as const;

export type OrderFulfillmentStageFilter =
  (typeof orderFulfillmentStageFilters)[number];

export const orderRiskLevelFilters = ["all", "low", "medium", "high"] as const;

export type OrderRiskLevelFilter = (typeof orderRiskLevelFilters)[number];

export function getOrderHref(storeId: string, orderId: string) {
  return `/dashboard/stores/${storeId}/orders/${orderId}`;
}

export function parseOrderStatusFilter(value: string | string[] | undefined) {
  const status = Array.isArray(value) ? value[0] : value;

  if (orderStatusFilters.includes(status as OrderStatusFilter)) {
    return status as OrderStatusFilter;
  }

  return "all";
}

export function parseOrderPaymentStatusFilter(
  value: string | string[] | undefined,
) {
  const status = Array.isArray(value) ? value[0] : value;

  if (orderPaymentStatusFilters.includes(status as OrderPaymentStatusFilter)) {
    return status as OrderPaymentStatusFilter;
  }

  return "all";
}

export function parseOrderSourceFilter(value: string | string[] | undefined) {
  const source = Array.isArray(value) ? value[0] : value;

  if (orderSourceFilters.includes(source as OrderSourceFilter)) {
    return source as OrderSourceFilter;
  }

  return "all";
}

export function parseOrderFulfillmentStageFilter(
  value: string | string[] | undefined,
) {
  const stage = Array.isArray(value) ? value[0] : value;

  if (orderFulfillmentStageFilters.includes(stage as OrderFulfillmentStageFilter)) {
    return stage as OrderFulfillmentStageFilter;
  }

  return "all";
}

export function parseOrderRiskLevelFilter(value: string | string[] | undefined) {
  const risk = Array.isArray(value) ? value[0] : value;

  if (orderRiskLevelFilters.includes(risk as OrderRiskLevelFilter)) {
    return risk as OrderRiskLevelFilter;
  }

  return "all";
}

export function getOrderStats(orders: Order[]) {
  const paidOrders = orders.filter((order) =>
    isRevenueOrderStatus(order.status),
  );
  const needsFulfillment = orders.filter((order) => {
    const fulfillment = getOrderFulfillmentSummary(order);

    return (
      order.status === "paid" &&
      (fulfillment.stage === "unfulfilled" || fulfillment.stage === "preparing")
    );
  });
  const highRiskOrders = orders.filter(
    (order) => getOrderRiskAssessment(order, { orders }).level === "high",
  );
  const totalRevenueCents = paidOrders.reduce(
    (sum, order) => sum + Math.max(0, order.totalCents - order.refundedCents),
    0,
  );

  return {
    totalOrders: orders.length,
    pendingOrders: orders.filter((order) => order.status === "pending").length,
    paidOrders: paidOrders.length,
    fulfilledOrders: orders.filter((order) => order.status === "fulfilled")
      .length,
    cancelledOrders: orders.filter((order) => order.status === "cancelled")
      .length,
    needsFulfillment: needsFulfillment.length,
    highRiskOrders: highRiskOrders.length,
    totalRevenueCents,
    averagePaidOrderCents:
      paidOrders.length > 0
        ? Math.round(totalRevenueCents / paidOrders.length)
        : 0,
  };
}

function getOrderSearchText(order: Order) {
  const fulfillmentSummary = getOrderFulfillmentSummary(order);
  const riskAssessment = getOrderRiskAssessment(order);

  return [
    order.id,
    order.customerName,
    order.customerEmail,
    order.customerPhone,
    order.source,
    order.internalNote,
    order.discountCode,
    order.paymentStatus,
    order.paymentMethod,
    order.paymentProvider,
    order.paymentReference,
    order.trackingCarrier,
    order.trackingNumber,
    fulfillmentSummary.label,
    fulfillmentSummary.detail,
    orderFulfillmentStageLabels[fulfillmentSummary.stage],
    orderRiskLevelLabels[riskAssessment.level],
    riskAssessment.factors.map((factor) => factor.label).join(" "),
    order.fulfillments
      .flatMap((fulfillment) => [
        fulfillment.status,
        fulfillment.trackingCarrier,
        fulfillment.trackingNumber,
        fulfillment.note,
      ])
      .filter(Boolean)
      .join(" "),
    order.shippingAddress?.city,
    order.shippingAddress?.region,
    order.items
      ?.flatMap((item) => [item.productName, item.variantName, item.variantSku])
      .filter(Boolean)
      .join(" "),
    order.refunds
      .flatMap((refund) => [refund.reason, refund.note])
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function filterOrders(input: {
  orders: Order[];
  query: string;
  status: OrderStatusFilter;
  paymentStatus?: OrderPaymentStatusFilter;
  source?: OrderSourceFilter;
  fulfillmentStage?: OrderFulfillmentStageFilter;
  risk?: OrderRiskLevelFilter;
}) {
  const normalizedQuery = input.query.trim().toLowerCase();
  const paymentStatus = input.paymentStatus || "all";
  const source = input.source || "all";
  const fulfillmentStage = input.fulfillmentStage || "all";
  const risk = input.risk || "all";

  return input.orders.filter((order) => {
    const fulfillmentSummary = getOrderFulfillmentSummary(order);
    const riskAssessment = getOrderRiskAssessment(order, {
      orders: input.orders,
    });
    const statusMatches =
      input.status === "all" || order.status === (input.status as OrderStatus);
    const paymentMatches =
      paymentStatus === "all" ||
      order.paymentStatus === (paymentStatus as PaymentStatus);
    const sourceMatches =
      source === "all" || order.source === (source as OrderSource);
    const fulfillmentMatches =
      fulfillmentStage === "all" ||
      fulfillmentSummary.stage === (fulfillmentStage as OrderFulfillmentStage);
    const riskMatches =
      risk === "all" || riskAssessment.level === (risk as OrderRiskLevel);
    const queryMatches =
      !normalizedQuery || getOrderSearchText(order).includes(normalizedQuery);

    return (
      statusMatches &&
      paymentMatches &&
      sourceMatches &&
      fulfillmentMatches &&
      riskMatches &&
      queryMatches
    );
  });
}
