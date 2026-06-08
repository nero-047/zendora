import type { Order } from "@/features/commerce/types";

export const orderDeliveryRequestTypes = [
  "address_change",
  "delivery_instructions",
  "hold_for_pickup",
  "other",
] as const;

export type OrderDeliveryRequestType =
  (typeof orderDeliveryRequestTypes)[number];

export const orderDeliveryRequestTypeLabels: Record<
  OrderDeliveryRequestType,
  string
> = {
  address_change: "Address change",
  delivery_instructions: "Delivery instructions",
  hold_for_pickup: "Hold for pickup",
  other: "Other delivery request",
};

export function getOrderDeliveryRequestEligibility(order: Order) {
  if (order.status === "cancelled" || order.cancelledAt) {
    return {
      eligible: false,
      message: "Cancelled orders cannot receive delivery updates.",
    };
  }

  if (order.status === "fulfilled" || order.fulfilledAt) {
    return {
      eligible: false,
      message: "Fulfilled orders should use carrier support or return support.",
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
    message: "The merchant will review delivery details before fulfillment.",
  };
}

export function normalizeDeliveryRequestText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function createDeliveryRequestPreview(input: {
  message: string;
  orderId: string;
  requestType: OrderDeliveryRequestType;
}) {
  const message = normalizeDeliveryRequestText(input.message);

  return (
    message ||
    `Customer requested ${orderDeliveryRequestTypeLabels[
      input.requestType
    ].toLowerCase()} for ${input.orderId}.`
  );
}

export function createDeliveryRequestSubject(input: {
  requestType: OrderDeliveryRequestType;
  storeName: string;
}) {
  return `${input.storeName} delivery request: ${
    orderDeliveryRequestTypeLabels[input.requestType]
  }`;
}
