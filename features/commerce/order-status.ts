import type { Order, OrderStatus } from "@/features/commerce/types";

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
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
  ].filter((event) => Boolean(event.value));
}
