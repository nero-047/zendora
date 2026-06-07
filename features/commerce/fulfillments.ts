import type {
  OrderFulfillment,
  OrderFulfillmentStatus,
} from "@/features/commerce/types";

export const fulfillmentStatuses = [
  "created",
  "in_transit",
  "delivered",
  "cancelled",
] as const satisfies readonly OrderFulfillmentStatus[];

export const fulfillmentStatusLabels: Record<OrderFulfillmentStatus, string> = {
  created: "Created",
  in_transit: "In transit",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export function sortFulfillments(fulfillments: OrderFulfillment[]) {
  return [...fulfillments].sort(
    (a, b) =>
      new Date(b.shippedAt || b.createdAt).getTime() -
      new Date(a.shippedAt || a.createdAt).getTime(),
  );
}

export function getActiveFulfillments(fulfillments: OrderFulfillment[]) {
  return sortFulfillments(
    fulfillments.filter((fulfillment) => fulfillment.status !== "cancelled"),
  );
}

export function getLatestFulfillment(fulfillments: OrderFulfillment[]) {
  return getActiveFulfillments(fulfillments)[0];
}

export function canTransitionFulfillmentStatus(
  current: OrderFulfillmentStatus,
  next: OrderFulfillmentStatus,
) {
  if (current === next) {
    return true;
  }

  if (current === "cancelled" || current === "delivered") {
    return false;
  }

  if (next === "cancelled") {
    return true;
  }

  if (current === "created") {
    return next === "in_transit" || next === "delivered";
  }

  return current === "in_transit" && next === "delivered";
}
