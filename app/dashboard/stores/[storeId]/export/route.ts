import { requireAppUser } from "@/features/auth/app-user";
import { getNotificationStats } from "@/features/commerce/activity-center";
import {
  getCustomerStats,
  getCustomerSummaries,
} from "@/features/commerce/customers";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getStoreLaunchReadiness } from "@/features/commerce/launch-readiness";
import {
  getReturnRequestQueue,
  getReturnRequestQueueStats,
} from "@/features/commerce/returns";
import { getStoreOperationalInsights } from "@/features/commerce/store-insights";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type OperationsExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  status?: string;
  detail?: string;
  href?: string;
};

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const customers = getCustomerSummaries(
    workspace.orders,
    store.currency,
    workspace.customerProfiles,
  );
  const customerStats = getCustomerStats(customers);
  const notificationStats = getNotificationStats(workspace.notifications);
  const returnQueueStats = getReturnRequestQueueStats(
    getReturnRequestQueue(workspace.orders, { storeId: store.id }),
  );
  const readiness = getStoreLaunchReadiness(workspace);
  const operations = getStoreOperationalInsights(workspace, { limit: 50 });
  const activeGiftCardBalanceCents = workspace.giftCards
    .filter((giftCard) => giftCard.status === "active")
    .reduce((sum, giftCard) => sum + giftCard.balanceCents, 0);
  const rows: OperationsExportRow[] = [
    {
      section: "summary",
      metric: "store_status",
      label: "Store status",
      value: store.status,
      status: store.status,
    },
    {
      section: "summary",
      metric: "launch_readiness",
      label: "Launch readiness",
      value: `${readiness.completionPercent}%`,
      status: readiness.canPublish ? "publishable" : "blocked",
      detail: `${readiness.blockingCount} blockers, ${readiness.warningCount} warnings`,
    },
    {
      section: "summary",
      metric: "revenue",
      label: "Revenue",
      value: formatCurrency(store.revenueCents, store.currency),
    },
    {
      section: "summary",
      metric: "orders",
      label: "Orders",
      value: store.orderCount,
    },
    {
      section: "summary",
      metric: "customers",
      label: "Customers",
      value: customerStats.totalCustomers,
      detail: `${customerStats.repeatCustomers} repeat buyers`,
    },
    {
      section: "summary",
      metric: "abandoned_checkouts",
      label: "Abandoned checkouts",
      value: workspace.abandonedCheckouts.filter(
        (checkout) => checkout.status === "open",
      ).length,
      detail: `${workspace.abandonedCheckouts.length} total checkouts`,
    },
    {
      section: "summary",
      metric: "reviews",
      label: "Reviews",
      value: workspace.productReviews.filter((review) => review.status === "pending")
        .length,
      detail: `${workspace.productReviews.length} total reviews`,
    },
    {
      section: "summary",
      metric: "returns",
      label: "Returns",
      value: returnQueueStats.needsReview,
      detail: `${returnQueueStats.totalOpen} open returns`,
    },
    {
      section: "summary",
      metric: "outbox",
      label: "Outbox",
      value: notificationStats.failed,
      detail: `${notificationStats.actionRequired} messages need review`,
    },
    {
      section: "summary",
      metric: "gift_cards",
      label: "Gift cards",
      value: formatCurrency(activeGiftCardBalanceCents, store.currency),
      detail: "Active balance",
    },
    {
      section: "summary",
      metric: "inventory",
      label: "Inventory",
      value: store.inventoryCount,
    },
    {
      section: "summary",
      metric: "products",
      label: "Products",
      value: store.productCount,
    },
    ...readiness.checks.map((check) => ({
      section: "launch_readiness",
      metric: check.id,
      label: check.label,
      value: check.status,
      status: check.status,
      detail: check.detail,
      href: check.href,
    })),
    ...operations.map((insight) => ({
      section: "operations_queue",
      metric: insight.id,
      label: insight.title,
      value: insight.severity,
      status: insight.category,
      detail: insight.detail,
      href: insight.href,
    })),
  ];

  return csvResponse<OperationsExportRow>({
    filename: `${store.slug}-operations.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
