import type {
  AuditEventAction,
  NotificationStatus,
  NotificationType,
  StoreAuditEvent,
  StoreNotification,
} from "@/features/commerce/types";

export type ActivityCenterPriority = "critical" | "warning" | "info";
export type ActivityCenterKind = "notification" | "audit_event";

export type StoreNotificationStats = {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  suppressed: number;
  actionRequired: number;
};

export type ActivityCenterItem = {
  id: string;
  kind: ActivityCenterKind;
  priority: ActivityCenterPriority;
  title: string;
  detail: string;
  label: string;
  resourceLabel: string;
  href?: string;
  createdAt: string;
};

export const notificationStatusLabels: Record<NotificationStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  failed: "Failed",
  suppressed: "Suppressed",
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  order_confirmation: "Order confirmation",
  manual_order_invoice: "Manual order invoice",
  payment_receipt: "Payment receipt",
  fulfillment_update: "Fulfillment update",
  checkout_recovery: "Checkout recovery",
  product_review_received: "Product review received",
  product_review_updated: "Product review update",
  gift_card_created: "Gift card created",
  gift_card_status_updated: "Gift card status update",
  return_request_created: "Return request received",
  return_request_updated: "Return request update",
  refund_confirmation: "Refund confirmation",
  team_invitation: "Team invitation",
};

const auditActionLabels: Record<AuditEventAction, string> = {
  store_created: "Store created",
  store_updated: "Store updated",
  customer_profile_updated: "Customer profile updated",
  store_policy_updated: "Store policy updated",
  store_page_created: "Store page created",
  store_page_updated: "Store page updated",
  store_navigation_updated: "Store navigation updated",
  store_published: "Store published",
  store_paused: "Store paused",
  product_created: "Product created",
  product_updated: "Product updated",
  inventory_adjusted: "Inventory adjusted",
  discount_created: "Discount created",
  discount_updated: "Discount updated",
  discount_status_updated: "Discount status updated",
  collection_created: "Collection created",
  collection_updated: "Collection updated",
  collection_status_updated: "Collection status updated",
  shipping_zone_created: "Shipping zone created",
  shipping_zone_updated: "Shipping zone updated",
  shipping_zone_status_updated: "Shipping zone status updated",
  checkout_order_created: "Checkout order created",
  manual_order_created: "Manual order created",
  abandoned_checkout_recovered: "Abandoned checkout recovered",
  abandoned_checkout_recovery_queued: "Abandoned checkout recovery queued",
  abandoned_checkout_dismissed: "Abandoned checkout dismissed",
  product_review_created: "Product review created",
  product_review_moderated: "Product review moderated",
  gift_card_created: "Gift card created",
  gift_card_updated: "Gift card updated",
  gift_card_status_updated: "Gift card status updated",
  order_status_updated: "Order status updated",
  payment_confirmed: "Payment confirmed",
  fulfillment_updated: "Fulfillment updated",
  return_request_created: "Return request created",
  return_request_updated: "Return request updated",
  refund_created: "Refund created",
  team_invited: "Team invited",
  team_invite_revoked: "Team invite revoked",
  team_member_role_updated: "Team member role updated",
  team_member_removed: "Team member removed",
  team_invite_accepted: "Team invite accepted",
};

const resourceLabels: Record<string, string> = {
  abandoned_checkout: "Abandoned checkout",
  collection: "Collection",
  customer_profile: "Customer",
  discount_code: "Discount",
  gift_card: "Gift card",
  order: "Order",
  order_fulfillment: "Fulfillment",
  order_refund: "Refund",
  order_return_request: "Return request",
  product: "Product",
  product_review: "Product review",
  shipping_zone: "Shipping zone",
  store: "Store",
  store_invitation: "Invitation",
  store_membership: "Team member",
  store_navigation_menu: "Navigation",
  store_page: "Page",
  store_policy: "Policy",
};

const priorityRank: Record<ActivityCenterPriority, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function getStringMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
) {
  const value = metadata[key];

  return typeof value === "string" && value.trim() ? value : undefined;
}

function getResourceLabel(resourceType: string) {
  return resourceLabels[resourceType] || resourceType.replaceAll("_", " ");
}

function getResourceHref(input: {
  storeId: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
}) {
  const { storeId, resourceType, resourceId, metadata } = input;
  const orderId = getStringMetadataValue(metadata, "orderId");
  const customerEmail = getStringMetadataValue(metadata, "customerEmail");

  if (resourceType === "order" && resourceId) {
    return `/dashboard/stores/${storeId}/orders/${resourceId}`;
  }

  if (
    resourceType === "order_fulfillment" ||
    resourceType === "order_refund" ||
    resourceType === "order_return_request"
  ) {
    return orderId ? `/dashboard/stores/${storeId}/orders/${orderId}` : undefined;
  }

  if (resourceType === "product" && resourceId) {
    return `/dashboard/stores/${storeId}/products/${resourceId}/edit`;
  }

  if (resourceType === "customer_profile" && customerEmail) {
    return `/dashboard/stores/${storeId}/customers/${encodeURIComponent(
      customerEmail,
    )}`;
  }

  if (
    resourceType === "abandoned_checkout" ||
    resourceType === "collection" ||
    resourceType === "discount_code" ||
    resourceType === "gift_card" ||
    resourceType === "product_review" ||
    resourceType === "shipping_zone" ||
    resourceType === "store" ||
    resourceType === "store_invitation" ||
    resourceType === "store_membership" ||
    resourceType === "store_navigation_menu" ||
    resourceType === "store_page" ||
    resourceType === "store_policy"
  ) {
    return `/dashboard/stores/${storeId}`;
  }

  return undefined;
}

function getNotificationPriority(
  status: NotificationStatus,
): ActivityCenterPriority {
  if (status === "failed") {
    return "critical";
  }

  if (status === "pending") {
    return "warning";
  }

  return "info";
}

function getNotificationDetail(notification: StoreNotification) {
  const typeLabel = notificationTypeLabels[notification.type];
  const recipient = notification.recipientName
    ? `${notification.recipientName} <${notification.recipientEmail}>`
    : notification.recipientEmail;

  if (notification.status === "failed") {
    return `${recipient} did not receive the ${typeLabel.toLowerCase()}. ${notification.preview}`;
  }

  if (notification.status === "pending") {
    return `${recipient} is waiting for the ${typeLabel.toLowerCase()}. ${notification.preview}`;
  }

  if (notification.status === "suppressed") {
    return `${recipient} was skipped for this ${typeLabel.toLowerCase()}. ${notification.preview}`;
  }

  return `${recipient} received the ${typeLabel.toLowerCase()}. ${notification.preview}`;
}

function getNotificationCreatedAt(notification: StoreNotification) {
  if (notification.status === "failed" && notification.failedAt) {
    return notification.failedAt;
  }

  if (notification.status === "sent" && notification.sentAt) {
    return notification.sentAt;
  }

  return notification.createdAt;
}

function toNotificationActivityItem(
  storeId: string,
  notification: StoreNotification,
): ActivityCenterItem {
  const typeLabel = notificationTypeLabels[notification.type];

  return {
    id: `notification:${notification.id}`,
    kind: "notification",
    priority: getNotificationPriority(notification.status),
    title: `${notificationStatusLabels[notification.status]} ${typeLabel}`,
    detail: getNotificationDetail(notification),
    label: notificationStatusLabels[notification.status],
    resourceLabel: getResourceLabel(notification.resourceType),
    href: getResourceHref({
      storeId,
      resourceType: notification.resourceType,
      resourceId: notification.resourceId,
      metadata: notification.metadata,
    }),
    createdAt: getNotificationCreatedAt(notification),
  };
}

function toAuditActivityItem(
  storeId: string,
  event: StoreAuditEvent,
): ActivityCenterItem {
  return {
    id: `audit:${event.id}`,
    kind: "audit_event",
    priority: "info",
    title: event.summary,
    detail: `${auditActionLabels[event.action]} / ${getResourceLabel(
      event.resourceType,
    )}`,
    label: "Audit",
    resourceLabel: getResourceLabel(event.resourceType),
    href: getResourceHref({
      storeId,
      resourceType: event.resourceType,
      resourceId: event.resourceId,
      metadata: event.metadata,
    }),
    createdAt: event.createdAt,
  };
}

function getTimeValue(value: string) {
  const time = Date.parse(value);

  return Number.isFinite(time) ? time : 0;
}

export function getNotificationStats(
  notifications: StoreNotification[],
): StoreNotificationStats {
  const stats: StoreNotificationStats = {
    total: notifications.length,
    pending: 0,
    sent: 0,
    failed: 0,
    suppressed: 0,
    actionRequired: 0,
  };

  for (const notification of notifications) {
    stats[notification.status] += 1;

    if (notification.status === "failed" || notification.status === "pending") {
      stats.actionRequired += 1;
    }
  }

  return stats;
}

export function getActivityCenter(
  input: {
    auditEvents: StoreAuditEvent[];
    notifications: StoreNotification[];
    storeId: string;
  },
  options: {
    limit?: number;
  } = {},
): ActivityCenterItem[] {
  const limit = Math.max(1, options.limit || 12);
  const items = [
    ...input.notifications.map((notification) =>
      toNotificationActivityItem(input.storeId, notification),
    ),
    ...input.auditEvents.map((event) =>
      toAuditActivityItem(input.storeId, event),
    ),
  ];

  return items
    .sort((a, b) => {
      if (priorityRank[a.priority] !== priorityRank[b.priority]) {
        return priorityRank[a.priority] - priorityRank[b.priority];
      }

      return getTimeValue(b.createdAt) - getTimeValue(a.createdAt);
    })
    .slice(0, limit);
}
