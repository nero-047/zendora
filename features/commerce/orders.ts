import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type { Order, OrderStatus } from "@/features/commerce/types";

export const orderStatusFilters = [
  "all",
  "pending",
  "paid",
  "fulfilled",
  "cancelled",
] as const;

export type OrderStatusFilter = (typeof orderStatusFilters)[number];

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

export function getOrderStats(orders: Order[]) {
  const paidOrders = orders.filter((order) =>
    isRevenueOrderStatus(order.status),
  );
  const needsFulfillment = orders.filter((order) => order.status === "paid");
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
    totalRevenueCents,
    averagePaidOrderCents:
      paidOrders.length > 0
        ? Math.round(totalRevenueCents / paidOrders.length)
        : 0,
  };
}

function getOrderSearchText(order: Order) {
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
}) {
  const normalizedQuery = input.query.trim().toLowerCase();

  return input.orders.filter((order) => {
    const statusMatches =
      input.status === "all" || order.status === (input.status as OrderStatus);
    const queryMatches =
      !normalizedQuery || getOrderSearchText(order).includes(normalizedQuery);

    return statusMatches && queryMatches;
  });
}
