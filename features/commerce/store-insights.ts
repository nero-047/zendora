import {
  canQueueAbandonedCheckoutRecovery,
  summarizeAbandonedCheckoutLines,
} from "@/features/commerce/abandoned-checkouts";
import {
  getNotificationStats,
  notificationTypeLabels,
} from "@/features/commerce/activity-center";
import {
  getCustomerSegmentation,
  getCustomerSummaries,
} from "@/features/commerce/customers";
import { getInventoryPlanningSignals } from "@/features/commerce/inventory-planning";
import { getOrderRiskAssessment } from "@/features/commerce/order-insights";
import { getProductHealth } from "@/features/commerce/product-health";
import { getReturnRequestQueue } from "@/features/commerce/returns";
import { getStoreLaunchReadiness } from "@/features/commerce/launch-readiness";
import type { StoreWorkspace } from "@/features/commerce/types";

export type StoreInsightSeverity = "critical" | "warning" | "info";
export type StoreInsightCategory =
  | "launch"
  | "orders"
  | "catalog"
  | "inventory"
  | "returns"
  | "customers"
  | "conversion"
  | "notifications"
  | "reviews";

export type StoreOperationalInsight = {
  id: string;
  category: StoreInsightCategory;
  severity: StoreInsightSeverity;
  title: string;
  detail: string;
  href?: string;
  actionLabel: string;
};

const severityRank: Record<StoreInsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function sortInsights(insights: StoreOperationalInsight[]) {
  return [...insights].sort((a, b) => {
    if (severityRank[a.severity] !== severityRank[b.severity]) {
      return severityRank[a.severity] - severityRank[b.severity];
    }

    return a.title.localeCompare(b.title);
  });
}

function getDateTimeValue(value?: string) {
  const time = Date.parse(value || "");

  return Number.isFinite(time) ? time : 0;
}

export function getStoreOperationalInsights(
  workspace: StoreWorkspace,
  options: {
    now?: Date;
    limit?: number;
  } = {},
): StoreOperationalInsight[] {
  const limit = Math.max(1, options.limit || 8);
  const insights: StoreOperationalInsight[] = [];
  const readiness = getStoreLaunchReadiness(workspace);

  for (const check of readiness.blockingChecks.slice(0, 3)) {
    insights.push({
      id: `launch:${check.id}`,
      category: "launch",
      severity: "critical",
      title: check.label,
      detail: check.detail,
      href: check.href,
      actionLabel: "Fix launch blocker",
    });
  }

  for (const check of readiness.warningChecks.slice(0, 2)) {
    insights.push({
      id: `launch-warning:${check.id}`,
      category: "launch",
      severity: "warning",
      title: check.label,
      detail: check.detail,
      href: check.href,
      actionLabel: "Review setup",
    });
  }

  for (const order of workspace.orders) {
    const risk = getOrderRiskAssessment(order, {
      orders: workspace.orders,
      now: options.now,
    });

    if (risk.level === "low") {
      continue;
    }

    insights.push({
      id: `order-risk:${order.id}`,
      category: "orders",
      severity: risk.level === "high" ? "critical" : "warning",
      title: `Order ${order.id.slice(0, 8)} needs review`,
      detail:
        risk.factors[0]?.detail ||
        `${risk.factors.length} order risk flags need merchant review.`,
      href: `/dashboard/stores/${workspace.store.id}/orders/${order.id}`,
      actionLabel: "Review order",
    });
  }

  for (const product of workspace.products) {
    const health = getProductHealth(product);

    if (health.status !== "needs_attention") {
      continue;
    }

    insights.push({
      id: `product-health:${product.id}`,
      category: "catalog",
      severity: health.issues.some((issue) => issue.severity === "blocking")
        ? "critical"
        : "warning",
      title: `${product.name} catalog health`,
      detail: health.nextAction,
      href: `/dashboard/stores/${workspace.store.id}/products/${product.id}/edit`,
      actionLabel: "Fix product",
    });
  }

  for (const signal of getInventoryPlanningSignals({
    products: workspace.products,
    orders: workspace.orders,
    limit: workspace.products.length || 1,
  })) {
    if (signal.urgency !== "out_of_stock" && signal.urgency !== "reorder_now") {
      continue;
    }

    insights.push({
      id: `inventory:${signal.productId}`,
      category: "inventory",
      severity: signal.urgency === "out_of_stock" ? "critical" : "warning",
      title: `${signal.productName} inventory plan`,
      detail: signal.detail,
      href: `/dashboard/stores/${workspace.store.id}/products/${signal.productId}/edit`,
      actionLabel: "Plan reorder",
    });
  }

  for (const item of getReturnRequestQueue(workspace.orders, {
    storeId: workspace.store.id,
    now: options.now,
  })) {
    insights.push({
      id: `return-request:${item.request.id}`,
      category: "returns",
      severity: item.priority === "needs_review" ? "warning" : "info",
      title: `${item.order.customerName} return request`,
      detail: item.detail,
      href: item.href,
      actionLabel: "Review return",
    });
  }

  const notificationStats = getNotificationStats(workspace.notifications);
  const failedNotifications = workspace.notifications
    .filter((notification) => notification.status === "failed")
    .sort(
      (a, b) =>
        getDateTimeValue(b.failedAt || b.createdAt) -
        getDateTimeValue(a.failedAt || a.createdAt),
    );
  const pendingNotifications = workspace.notifications
    .filter((notification) => notification.status === "pending")
    .sort(
      (a, b) =>
        getDateTimeValue(a.createdAt) - getDateTimeValue(b.createdAt),
    );

  if (failedNotifications.length > 0) {
    const first = failedNotifications[0];

    insights.push({
      id: "notification-failures",
      category: "notifications",
      severity: "critical",
      title: "Notification delivery failures",
      detail: `${notificationStats.failed} message${
        notificationStats.failed === 1 ? "" : "s"
      } failed to send. Latest: ${notificationTypeLabels[first.type]} to ${
        first.recipientEmail
      }.`,
      href: `/dashboard/stores/${workspace.store.id}`,
      actionLabel: "Review outbox",
    });
  }

  if (pendingNotifications.length > 0) {
    const first = pendingNotifications[0];

    insights.push({
      id: "notification-pending",
      category: "notifications",
      severity: "warning",
      title: "Notifications awaiting delivery",
      detail: `${notificationStats.pending} message${
        notificationStats.pending === 1 ? "" : "s"
      } still pending. Oldest visible: ${notificationTypeLabels[first.type]} to ${
        first.recipientEmail
      }.`,
      href: `/dashboard/stores/${workspace.store.id}`,
      actionLabel: "Review queue",
    });
  }

  const customers = getCustomerSummaries(
    workspace.orders,
    workspace.store.currency,
    workspace.customerProfiles,
  );

  for (const customer of customers) {
    const segmentation = getCustomerSegmentation(customer, {
      now: options.now,
    });

    if (
      segmentation.primarySegment !== "at_risk" &&
      segmentation.primarySegment !== "refund_watch"
    ) {
      continue;
    }

    insights.push({
      id: `customer:${customer.email}`,
      category: "customers",
      severity:
        segmentation.primarySegment === "refund_watch" ? "warning" : "info",
      title: `${customer.name} is ${segmentation.label.toLowerCase()}`,
      detail: segmentation.nextAction,
      href: `/dashboard/stores/${workspace.store.id}/customers/${encodeURIComponent(
        customer.email,
      )}`,
      actionLabel: "Review customer",
    });
  }

  for (const checkout of workspace.abandonedCheckouts) {
    if (!canQueueAbandonedCheckoutRecovery(checkout)) {
      continue;
    }

    const summary = summarizeAbandonedCheckoutLines(checkout.lines);

    insights.push({
      id: `abandoned-checkout:${checkout.id}`,
      category: "conversion",
      severity: "info",
      title: `Recover ${checkout.customerEmail}`,
      detail: `${summary.itemCount} cart item${
        summary.itemCount === 1 ? "" : "s"
      } worth ${(summary.subtotalCents / 100).toFixed(2)} ${
        checkout.currency
      } can be recovered.`,
      href: `/dashboard/stores/${workspace.store.id}`,
      actionLabel: "Queue recovery",
    });
  }

  const pendingReviews = workspace.productReviews.filter(
    (review) => review.status === "pending",
  );

  if (pendingReviews.length > 0) {
    insights.push({
      id: "pending-reviews",
      category: "reviews",
      severity: "info",
      title: "Product reviews pending",
      detail: `${pendingReviews.length} review${
        pendingReviews.length === 1 ? "" : "s"
      } need moderation before appearing on the storefront.`,
      href: `/dashboard/stores/${workspace.store.id}`,
      actionLabel: "Moderate reviews",
    });
  }

  return sortInsights(insights).slice(0, limit);
}
