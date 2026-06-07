import type {
  Order,
  ReturnRequestReason,
  ReturnRequestStatus,
} from "@/features/commerce/types";

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

export function canCustomerRequestReturn(order: Order) {
  if (order.status !== "paid" && order.status !== "fulfilled") {
    return false;
  }

  if (order.paymentStatus === "refunded" || order.refundableCents <= 0) {
    return false;
  }

  return !order.returnRequests.some(
    (request) =>
      request.status === "requested" || request.status === "approved",
  );
}
