import { requireAppUser } from "@/features/auth/app-user";
import {
  notificationStatusLabels,
} from "@/features/commerce/activity-center";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getOrderHref } from "@/features/commerce/orders";
import { productReviewStatusLabels } from "@/features/commerce/reviews";
import {
  getReturnRequestQueue,
  returnRequestReasonLabels,
  returnRequestStatusLabels,
} from "@/features/commerce/returns";
import type { ProductReview, StoreNotification } from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type SupportQueuePriority = "critical" | "high" | "normal";

type SupportQueueRow = {
  ticketId: string;
  type: "return" | "review" | "notification";
  priority: SupportQueuePriority;
  status: string;
  customerName: string;
  customerEmail: string;
  subject: string;
  detail: string;
  recommendedAction: string;
  orderId?: string;
  resourceId?: string;
  ageDays: number;
  href?: string;
};

const pendingReviewSlaDays = 2;
const returnReviewSlaDays = 2;
const returnResolutionSlaDays = 5;
const notificationPendingSlaHours = 24;

const priorityRank: Record<SupportQueuePriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
};

function getAgeDays(value: string | undefined, now: Date) {
  const time = value ? new Date(value).getTime() : Number.NaN;

  if (!Number.isFinite(time)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - time) / 86400000));
}

function getAgeHours(value: string | undefined, now: Date) {
  const time = value ? new Date(value).getTime() : Number.NaN;

  if (!Number.isFinite(time)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - time) / 3600000));
}

function getStringMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : undefined;
}

function getReturnRecommendedAction(input: {
  status: string;
  ageDays: number;
}) {
  if (input.status === "requested") {
    return input.ageDays > returnReviewSlaDays
      ? "Review the customer request immediately and approve or reject it."
      : "Review the customer request before the SLA window closes.";
  }

  if (input.status === "approved") {
    return input.ageDays > returnResolutionSlaDays
      ? "Resolve the approved return and issue the eligible refund."
      : "Track the returned item and prepare refund resolution.";
  }

  return "No action needed unless the customer reopens support.";
}

function getReturnPriority(input: {
  status: string;
  ageDays: number;
}): SupportQueuePriority {
  if (
    (input.status === "requested" && input.ageDays > returnReviewSlaDays) ||
    (input.status === "approved" && input.ageDays > returnResolutionSlaDays)
  ) {
    return "critical";
  }

  return "high";
}

function getReviewPriority(
  review: ProductReview,
  ageDays: number,
): SupportQueuePriority {
  if (review.status === "pending" && ageDays > pendingReviewSlaDays) {
    return "critical";
  }

  if (review.status === "pending" || review.rating <= 2) {
    return "high";
  }

  return "normal";
}

function getReviewRecommendedAction(review: ProductReview, ageDays: number) {
  if (review.status === "pending" && ageDays > pendingReviewSlaDays) {
    return "Moderate this review immediately to keep review publishing fresh.";
  }

  if (review.status === "pending") {
    return "Approve, reject, or reply before the moderation SLA window closes.";
  }

  if (review.status === "approved" && !review.merchantReply && review.rating <= 3) {
    return "Add a merchant reply before using this feedback in product marketing.";
  }

  return "No action needed; keep monitoring product review quality.";
}

function getNotificationTimestamp(notification: StoreNotification) {
  return notification.failedAt || notification.sentAt || notification.createdAt;
}

function getNotificationPriority(
  notification: StoreNotification,
  ageHours: number,
): SupportQueuePriority {
  if (notification.status === "failed") {
    return "critical";
  }

  if (notification.status === "pending" && ageHours >= notificationPendingSlaHours) {
    return "critical";
  }

  return "high";
}

function getNotificationRecommendedAction(
  notification: StoreNotification,
  ageHours: number,
) {
  if (notification.resourceType === "customer_cancellation_request") {
    return "Review payment and fulfillment before cancelling this order.";
  }

  if (notification.resourceType === "customer_delivery_request") {
    return "Review delivery details before fulfillment work starts.";
  }

  if (notification.resourceType === "customer_product_question") {
    return "Answer the product question before the customer leaves the product page.";
  }

  if (notification.resourceType === "customer_privacy_request") {
    return "Review the customer privacy request before changing records.";
  }

  if (notification.type === "customer_message") {
    return "Reply to the customer or assign the message from the support queue.";
  }

  if (notification.status === "failed") {
    return "Retry delivery or contact the customer manually.";
  }

  if (notification.status === "pending" && ageHours >= notificationPendingSlaHours) {
    return "Escalate this pending notification before customer trust is affected.";
  }

  return "Monitor delivery and retry if it remains pending.";
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const now = new Date();
  const productsById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const returnRows: SupportQueueRow[] = getReturnRequestQueue(workspace.orders, {
    storeId: workspace.store.id,
  }).map((item) => ({
    ticketId: item.request.id,
    type: "return",
    priority: getReturnPriority({
      status: item.request.status,
      ageDays: item.requestedAgeDays,
    }),
    status: returnRequestStatusLabels[item.request.status],
    customerName: item.order.customerName,
    customerEmail: item.order.customerEmail,
    subject: returnRequestReasonLabels[item.request.reason],
    detail: item.detail,
    recommendedAction: getReturnRecommendedAction({
      status: item.request.status,
      ageDays: item.requestedAgeDays,
    }),
    orderId: item.order.id,
    resourceId: item.request.id,
    ageDays: item.requestedAgeDays,
    href: item.href,
  }));
  const reviewRows: SupportQueueRow[] = workspace.productReviews
    .filter(
      (review) =>
        review.status === "pending" ||
        (review.status === "approved" && !review.merchantReply && review.rating <= 3),
    )
    .map((review) => {
      const ageDays = getAgeDays(review.reviewedAt, now);
      const product = productsById.get(review.productId);

      return {
        ticketId: review.id,
        type: "review",
        priority: getReviewPriority(review, ageDays),
        status: productReviewStatusLabels[review.status],
        customerName: review.customerName,
        customerEmail: review.customerEmail,
        subject: product?.name || review.productId,
        detail: review.body,
        recommendedAction: getReviewRecommendedAction(review, ageDays),
        orderId: review.orderId,
        resourceId: review.id,
        ageDays,
        href: getOrderHref(workspace.store.id, review.orderId),
      };
    });
  const notificationRows: SupportQueueRow[] = workspace.notifications
    .filter(
      (notification) =>
        notification.status === "failed" || notification.status === "pending",
    )
    .map((notification) => {
      const ageHours = getAgeHours(getNotificationTimestamp(notification), now);
      const orderId = getStringMetadataValue(notification.metadata, "orderId");
      const productId = getStringMetadataValue(
        notification.metadata,
        "productId",
      );

      return {
        ticketId: notification.id,
        type: "notification",
        priority: getNotificationPriority(notification, ageHours),
        status: notificationStatusLabels[notification.status],
        customerName: notification.recipientName || "",
        customerEmail: notification.recipientEmail,
        subject: notification.subject,
        detail: notification.preview,
        recommendedAction: getNotificationRecommendedAction(
          notification,
          ageHours,
        ),
        orderId,
        resourceId: notification.resourceId || notification.id,
        ageDays: Math.floor(ageHours / 24),
        href:
          notification.resourceType === "customer_cancellation_request"
            ? orderId
              ? getOrderHref(workspace.store.id, orderId)
              : undefined
            : notification.resourceType === "customer_delivery_request"
              ? orderId
                ? getOrderHref(workspace.store.id, orderId)
                : undefined
            : notification.resourceType === "customer_product_question"
              ? notification.resourceId || productId
                ? `/dashboard/stores/${workspace.store.id}/products/${
                    notification.resourceId || productId
                  }/edit`
                : undefined
            : notification.resourceType === "customer_privacy_request"
            ? `/dashboard/stores/${workspace.store.id}/customers/privacy/export`
            : orderId
              ? getOrderHref(workspace.store.id, orderId)
              : undefined,
      };
    });
  const rows = [...returnRows, ...reviewRows, ...notificationRows].sort(
    (a, b) =>
      priorityRank[a.priority] - priorityRank[b.priority] ||
      b.ageDays - a.ageDays ||
      a.type.localeCompare(b.type) ||
      a.ticketId.localeCompare(b.ticketId),
  );

  return csvResponse<SupportQueueRow>({
    filename: `${workspace.store.slug}-support-queue.csv`,
    rows,
    columns: [
      { header: "ticket_id", value: (row) => row.ticketId },
      { header: "type", value: (row) => row.type },
      { header: "priority", value: (row) => row.priority },
      { header: "status", value: (row) => row.status },
      { header: "customer_name", value: (row) => row.customerName },
      { header: "customer_email", value: (row) => row.customerEmail },
      { header: "subject", value: (row) => row.subject },
      { header: "detail", value: (row) => row.detail },
      {
        header: "recommended_action",
        value: (row) => row.recommendedAction,
      },
      { header: "order_id", value: (row) => row.orderId },
      { header: "resource_id", value: (row) => row.resourceId },
      { header: "age_days", value: (row) => row.ageDays },
      { header: "href", value: (row) => row.href },
    ],
  });
}
