import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  notificationStatusLabels,
  notificationTypeLabels,
} from "@/features/commerce/activity-center";
import type { StoreNotification } from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type OutboxExportRow = {
  notificationId: string;
  type: string;
  status: string;
  priority: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  preview: string;
  resourceType: string;
  resourceId?: string;
  ageHours: number;
  recommendedAction: string;
  createdAt: string;
  sentAt?: string;
  failedAt?: string;
  href?: string;
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function getAgeHours(notification: StoreNotification, now: Date) {
  const timestamp = notification.failedAt || notification.sentAt || notification.createdAt;
  const time = new Date(timestamp).getTime();

  if (!Number.isFinite(time)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - time) / 3600000));
}

function getPriority(notification: StoreNotification, ageHours: number) {
  if (notification.status === "failed") {
    return "critical";
  }

  if (notification.status === "pending" && ageHours >= 24) {
    return "critical";
  }

  if (notification.status === "pending") {
    return "warning";
  }

  return "info";
}

function getRecommendedAction(notification: StoreNotification, ageHours: number) {
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

  if (notification.status === "pending" && ageHours >= 24) {
    return "Escalate this pending notification before customer trust is affected.";
  }

  if (notification.status === "pending") {
    return "Monitor delivery and retry if it remains pending.";
  }

  if (notification.status === "suppressed") {
    return "Confirm suppression rules before sending related campaigns.";
  }

  return "No action needed; notification was delivered.";
}

function getResourceHref(storeId: string, notification: StoreNotification) {
  const orderId =
    typeof notification.metadata.orderId === "string"
      ? notification.metadata.orderId
      : undefined;
  const productId =
    typeof notification.metadata.productId === "string"
      ? notification.metadata.productId
      : undefined;

  if (notification.resourceType === "order" && notification.resourceId) {
    return `/dashboard/stores/${storeId}/orders/${notification.resourceId}`;
  }

  if (notification.resourceType === "customer_cancellation_request") {
    return orderId ? `/dashboard/stores/${storeId}/orders/${orderId}` : undefined;
  }

  if (notification.resourceType === "customer_delivery_request") {
    return orderId ? `/dashboard/stores/${storeId}/orders/${orderId}` : undefined;
  }

  if (notification.resourceType === "customer_product_question") {
    const id = notification.resourceId || productId;

    return id ? `/dashboard/stores/${storeId}/products/${id}/edit` : undefined;
  }

  if (
    notification.resourceType === "order_fulfillment" ||
    notification.resourceType === "order_refund" ||
    notification.resourceType === "order_return_request"
  ) {
    return orderId ? `/dashboard/stores/${storeId}/orders/${orderId}` : undefined;
  }

  if (notification.resourceType === "abandoned_checkout") {
    return `/dashboard/stores/${storeId}/checkouts`;
  }

  if (notification.resourceType === "product_review") {
    return `/dashboard/stores/${storeId}`;
  }

  if (notification.resourceType === "customer_privacy_request") {
    return `/dashboard/stores/${storeId}/customers/privacy/export`;
  }

  return undefined;
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const now = new Date();
  const rows: OutboxExportRow[] = workspace.notifications
    .slice()
    .sort((a, b) => {
      const priorityRank = { critical: 0, warning: 1, info: 2 };
      const aAge = getAgeHours(a, now);
      const bAge = getAgeHours(b, now);
      const aPriority = getPriority(a, aAge);
      const bPriority = getPriority(b, bAge);

      return (
        priorityRank[aPriority] - priorityRank[bPriority] ||
        bAge - aAge ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    })
    .map((notification) => {
      const ageHours = getAgeHours(notification, now);

      return {
        notificationId: notification.id,
        type: notificationTypeLabels[notification.type],
        status: notificationStatusLabels[notification.status],
        priority: getPriority(notification, ageHours),
        recipientEmail: notification.recipientEmail,
        recipientName: notification.recipientName,
        subject: notification.subject,
        preview: notification.preview,
        resourceType: notification.resourceType,
        resourceId: notification.resourceId,
        ageHours,
        recommendedAction: getRecommendedAction(notification, ageHours),
        createdAt: formatDate(notification.createdAt),
        sentAt: formatDate(notification.sentAt),
        failedAt: formatDate(notification.failedAt),
        href: getResourceHref(workspace.store.id, notification),
      };
    });

  return csvResponse<OutboxExportRow>({
    filename: `${workspace.store.slug}-notification-outbox.csv`,
    rows,
    columns: [
      { header: "notification_id", value: (row) => row.notificationId },
      { header: "type", value: (row) => row.type },
      { header: "status", value: (row) => row.status },
      { header: "priority", value: (row) => row.priority },
      { header: "recipient_email", value: (row) => row.recipientEmail },
      { header: "recipient_name", value: (row) => row.recipientName },
      { header: "subject", value: (row) => row.subject },
      { header: "preview", value: (row) => row.preview },
      { header: "resource_type", value: (row) => row.resourceType },
      { header: "resource_id", value: (row) => row.resourceId },
      { header: "age_hours", value: (row) => row.ageHours },
      {
        header: "recommended_action",
        value: (row) => row.recommendedAction,
      },
      { header: "created_at", value: (row) => row.createdAt },
      { header: "sent_at", value: (row) => row.sentAt },
      { header: "failed_at", value: (row) => row.failedAt },
      { header: "href", value: (row) => row.href },
    ],
  });
}
