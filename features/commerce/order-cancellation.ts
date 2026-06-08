import type { Order } from "@/features/commerce/types";

export const orderCancellationReasons = [
  "changed_mind",
  "ordered_by_mistake",
  "shipping_timeline",
  "other",
] as const;

export type OrderCancellationReason =
  (typeof orderCancellationReasons)[number];

export const orderCancellationReasonLabels: Record<
  OrderCancellationReason,
  string
> = {
  changed_mind: "Changed mind",
  ordered_by_mistake: "Ordered by mistake",
  shipping_timeline: "Shipping timeline",
  other: "Other",
};

export function getOrderCancellationEligibility(order: Order) {
  if (order.status === "cancelled" || order.cancelledAt) {
    return {
      eligible: false,
      message: "This order is already cancelled.",
    };
  }

  if (order.status === "fulfilled" || order.fulfilledAt) {
    return {
      eligible: false,
      message: "Fulfilled orders should use return support instead.",
    };
  }

  const activeFulfillment = order.fulfillments.some(
    (fulfillment) => fulfillment.status !== "cancelled",
  );

  if (activeFulfillment) {
    return {
      eligible: false,
      message: "This order already has fulfillment activity.",
    };
  }

  return {
    eligible: true,
    message: "The merchant will review payment and fulfillment before cancelling.",
  };
}

export function normalizeCancellationText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function createCancellationPreview(input: {
  message?: string;
  orderId: string;
  reason: OrderCancellationReason;
}) {
  const message = normalizeCancellationText(input.message || "");

  return (
    message ||
    `Customer requested cancellation for ${input.orderId}: ${
      orderCancellationReasonLabels[input.reason]
    }.`
  );
}

export function createCancellationSubject(input: {
  reason: OrderCancellationReason;
  storeName: string;
}) {
  return `${input.storeName} cancellation request: ${
    orderCancellationReasonLabels[input.reason]
  }`;
}
