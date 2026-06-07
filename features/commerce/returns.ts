import type {
  Order,
  ReturnRequestReason,
  ReturnRequestStatus,
} from "@/features/commerce/types";

export const RETURN_REQUEST_WINDOW_DAYS = 30;

export const returnRequestReasons = [
  "changed_mind",
  "damaged",
  "wrong_item",
  "quality",
  "other",
] as const satisfies readonly ReturnRequestReason[];

export const returnRequestStatuses = [
  "requested",
  "approved",
  "rejected",
  "resolved",
] as const satisfies readonly ReturnRequestStatus[];

export const returnRequestReasonLabels: Record<ReturnRequestReason, string> = {
  changed_mind: "Changed mind",
  damaged: "Damaged item",
  wrong_item: "Wrong item",
  quality: "Quality issue",
  other: "Other",
};

export const returnRequestStatusLabels: Record<ReturnRequestStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
};

const RETURN_REQUEST_STATUS_TRANSITIONS: Record<
  ReturnRequestStatus,
  ReturnRequestStatus[]
> = {
  requested: ["requested", "approved", "rejected"],
  approved: ["approved", "rejected", "resolved"],
  rejected: ["rejected"],
  resolved: ["resolved"],
};

const ACTIVE_RETURN_REQUEST_STATUSES = new Set<ReturnRequestStatus>([
  "requested",
  "approved",
]);

export function canTransitionReturnRequestStatus(
  currentStatus: ReturnRequestStatus,
  nextStatus: ReturnRequestStatus,
) {
  return RETURN_REQUEST_STATUS_TRANSITIONS[currentStatus].includes(nextStatus);
}

export function getReturnRequestStatusOptions(status: ReturnRequestStatus) {
  return returnRequestStatuses.filter((nextStatus) =>
    canTransitionReturnRequestStatus(status, nextStatus),
  );
}

function getLatestTimestamp(timestamps: Array<string | undefined>) {
  const times = timestamps
    .map((timestamp) => (timestamp ? new Date(timestamp).getTime() : Number.NaN))
    .filter((time) => Number.isFinite(time));

  if (times.length === 0) {
    return undefined;
  }

  return new Date(Math.max(...times)).toISOString();
}

export function getReturnRequestWindowStartedAt(order: Order) {
  const deliveredAt = getLatestTimestamp(
    order.fulfillments
      .filter((fulfillment) => fulfillment.status === "delivered")
      .map((fulfillment) => fulfillment.deliveredAt),
  );

  return deliveredAt || order.fulfilledAt || order.paidAt || order.createdAt;
}

export function getReturnRequestDeadline(
  order: Order,
  windowDays = RETURN_REQUEST_WINDOW_DAYS,
) {
  const startedAt = getReturnRequestWindowStartedAt(order);

  if (!startedAt || windowDays <= 0) {
    return undefined;
  }

  const deadline = new Date(
    new Date(startedAt).getTime() + windowDays * 24 * 60 * 60 * 1000,
  );

  return deadline.toISOString();
}

export function getCustomerReturnRequestEligibility(
  order: Order,
  now = new Date(),
) {
  if (order.status !== "paid" && order.status !== "fulfilled") {
    return {
      eligible: false,
      message: "Returns are available after an order is paid or fulfilled.",
    };
  }

  if (
    order.paymentStatus !== "paid" &&
    order.paymentStatus !== "partially_refunded"
  ) {
    return {
      eligible: false,
      message: "Returns are available after payment is captured.",
    };
  }

  if (order.refundableCents <= 0) {
    return {
      eligible: false,
      message: "This order no longer has a refundable balance.",
    };
  }

  if (
    order.returnRequests.some((request) =>
      ACTIVE_RETURN_REQUEST_STATUSES.has(request.status),
    )
  ) {
    return {
      eligible: false,
      message: "A return request is already open for this order.",
    };
  }

  const deadline = getReturnRequestDeadline(order);

  if (deadline && now.getTime() > new Date(deadline).getTime()) {
    return {
      eligible: false,
      message: `The ${RETURN_REQUEST_WINDOW_DAYS}-day return window has closed.`,
    };
  }

  return {
    eligible: true,
    message: `Returns are available within ${RETURN_REQUEST_WINDOW_DAYS} days while no active return request is open.`,
  };
}

export function canCustomerRequestReturn(order: Order, now = new Date()) {
  return getCustomerReturnRequestEligibility(order, now).eligible;
}
