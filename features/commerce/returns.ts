import type {
  Order,
  OrderReturnRequest,
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

export type ReturnRequestQueuePriority =
  | "needs_review"
  | "awaiting_resolution"
  | "closed";

export type ReturnRequestQueueItem = {
  request: OrderReturnRequest;
  order: Order;
  priority: ReturnRequestQueuePriority;
  label: string;
  detail: string;
  requestedAgeDays: number;
  href: string;
};

const returnQueuePriorityRank: Record<ReturnRequestQueuePriority, number> = {
  needs_review: 0,
  awaiting_resolution: 1,
  closed: 2,
};

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

function getRequestedAgeDays(requestedAt: string, now: Date) {
  const requestedTime = new Date(requestedAt).getTime();

  if (!Number.isFinite(requestedTime)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - requestedTime) / 86400000));
}

function getQueuePriority(status: ReturnRequestStatus): ReturnRequestQueuePriority {
  if (status === "requested") {
    return "needs_review";
  }

  if (status === "approved") {
    return "awaiting_resolution";
  }

  return "closed";
}

function getQueueLabel(priority: ReturnRequestQueuePriority) {
  if (priority === "needs_review") {
    return "Needs review";
  }

  if (priority === "awaiting_resolution") {
    return "Awaiting resolution";
  }

  return "Closed";
}

function getQueueDetail(input: {
  request: OrderReturnRequest;
  order: Order;
  requestedAgeDays: number;
  priority: ReturnRequestQueuePriority;
}) {
  const reason = returnRequestReasonLabels[input.request.reason];
  const age = `${input.requestedAgeDays} day${
    input.requestedAgeDays === 1 ? "" : "s"
  }`;

  if (input.priority === "needs_review") {
    return `${reason} return request has been waiting ${age}.`;
  }

  if (input.priority === "awaiting_resolution") {
    return `Approved return has ${(input.order.refundableCents / 100).toFixed(2)} ${
      input.order.currency
    } still refundable.`;
  }

  return `${reason} return request is ${returnRequestStatusLabels[
    input.request.status
  ].toLowerCase()}.`;
}

export function getReturnRequestQueue(
  orders: Order[],
  input: {
    storeId: string;
    now?: Date;
    includeClosed?: boolean;
  },
): ReturnRequestQueueItem[] {
  const now = input.now || new Date();

  return orders
    .flatMap((order) =>
      order.returnRequests
        .filter((request) => input.includeClosed || request.status !== "rejected")
        .filter((request) => input.includeClosed || request.status !== "resolved")
        .map((request) => {
          const priority = getQueuePriority(request.status);
          const requestedAgeDays = getRequestedAgeDays(request.requestedAt, now);

          return {
            request,
            order,
            priority,
            label: getQueueLabel(priority),
            detail: getQueueDetail({
              request,
              order,
              priority,
              requestedAgeDays,
            }),
            requestedAgeDays,
            href: `/dashboard/stores/${input.storeId}/orders/${order.id}`,
          };
        }),
    )
    .sort((a, b) => {
      if (returnQueuePriorityRank[a.priority] !== returnQueuePriorityRank[b.priority]) {
        return returnQueuePriorityRank[a.priority] - returnQueuePriorityRank[b.priority];
      }

      if (b.requestedAgeDays !== a.requestedAgeDays) {
        return b.requestedAgeDays - a.requestedAgeDays;
      }

      return (
        new Date(b.request.requestedAt).getTime() -
        new Date(a.request.requestedAt).getTime()
      );
    });
}

export function getReturnRequestQueueStats(queue: ReturnRequestQueueItem[]) {
  return {
    totalOpen: queue.filter((item) => item.priority !== "closed").length,
    needsReview: queue.filter((item) => item.priority === "needs_review").length,
    awaitingResolution: queue.filter(
      (item) => item.priority === "awaiting_resolution",
    ).length,
  };
}
