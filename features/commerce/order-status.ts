import type {
  Order,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/features/commerce/types";

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export const orderSourceLabels: Record<OrderSource, string> = {
  storefront: "Storefront",
  manual: "Manual",
};

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  authorized: "Authorized",
  paid: "Paid",
  partially_refunded: "Partially refunded",
  refunded: "Refunded",
  voided: "Voided",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  manual_invoice: "Manual invoice",
  bank_transfer: "Bank transfer",
  cash_on_delivery: "Cash on delivery",
  card: "Card",
  other: "Other",
};

const transitionOptions: Record<OrderStatus, OrderStatus[]> = {
  pending: ["pending", "paid", "cancelled"],
  paid: ["paid", "fulfilled", "cancelled"],
  fulfilled: ["fulfilled"],
  cancelled: ["cancelled"],
};

export function getOrderStatusOptions(status: OrderStatus) {
  return transitionOptions[status];
}

export function canTransitionOrderStatus(
  currentStatus: OrderStatus,
  nextStatus: OrderStatus,
) {
  return getOrderStatusOptions(currentStatus).includes(nextStatus);
}

export function isRevenueOrderStatus(status: OrderStatus) {
  return status === "paid" || status === "fulfilled";
}

export function getOrderLifecycleEvents(order: Order) {
  return [
    {
      label: "Order created",
      value: order.createdAt,
    },
    {
      label: "Payment marked",
      value: order.paidAt,
    },
    {
      label: "Fulfilled",
      value: order.fulfilledAt,
    },
    {
      label: "Cancelled",
      value: order.cancelledAt,
    },
    {
      label: "Inventory restocked",
      value: order.inventoryRestockedAt,
    },
    ...order.refunds.map((refund) => ({
      label: "Refund recorded",
      value: refund.createdAt,
    })),
  ].filter((event) => Boolean(event.value));
}
