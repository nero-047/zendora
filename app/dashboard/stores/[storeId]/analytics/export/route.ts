import { requireAppUser } from "@/features/auth/app-user";
import { getStoreAnalytics } from "@/features/commerce/analytics";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type AnalyticsExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  count?: number;
  detail?: string;
  date?: string;
  href?: string;
};

function formatPercent(value: number) {
  return `${value}%`;
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const analytics = getStoreAnalytics({
    orders: workspace.orders,
    products: workspace.products,
    abandonedCheckouts: workspace.abandonedCheckouts,
    storeId: workspace.store.id,
    currency: workspace.store.currency,
    dayCount: 14,
  });
  const rows: AnalyticsExportRow[] = [
    {
      section: "kpi",
      metric: "net_sales",
      label: "Net sales",
      value: formatCurrency(analytics.netSalesCents, workspace.store.currency),
      detail: `${formatCurrency(
        analytics.refundCents,
        workspace.store.currency,
      )} refunded`,
    },
    {
      section: "kpi",
      metric: "gross_sales",
      label: "Gross sales",
      value: formatCurrency(analytics.grossSalesCents, workspace.store.currency),
    },
    {
      section: "kpi",
      metric: "pending_revenue",
      label: "Pending revenue",
      value: formatCurrency(
        analytics.pendingRevenueCents,
        workspace.store.currency,
      ),
      count: analytics.pendingOrders,
    },
    {
      section: "kpi",
      metric: "total_orders",
      label: "Orders",
      value: analytics.totalOrders,
      detail: `${analytics.paidOrders} paid or fulfilled`,
    },
    {
      section: "kpi",
      metric: "average_order_value",
      label: "Average order",
      value: formatCurrency(
        analytics.averageOrderValueCents,
        workspace.store.currency,
      ),
      detail: `${analytics.averageItemsPerPaidOrder} items per paid order`,
    },
    {
      section: "kpi",
      metric: "checkout_recovery_rate",
      label: "Cart recovery",
      value: formatPercent(analytics.checkoutRecoveryRate),
      detail: `${analytics.recoveredAbandonedCheckouts}/${analytics.abandonedCheckoutCount} recovered`,
    },
    {
      section: "kpi",
      metric: "repeat_customer_rate",
      label: "Repeat buyers",
      value: formatPercent(analytics.repeatCustomerRate),
    },
    {
      section: "kpi",
      metric: "fulfillment_rate",
      label: "Fulfillment rate",
      value: formatPercent(analytics.fulfillmentRate),
    },
    {
      section: "kpi",
      metric: "refund_rate",
      label: "Refund rate",
      value: formatPercent(analytics.refundRate),
    },
    {
      section: "kpi",
      metric: "customer_concentration_rate",
      label: "Customer concentration",
      value: formatPercent(analytics.customerConcentrationRate),
    },
    ...analytics.days.map((day) => ({
      section: "daily_sales",
      metric: "daily_net_sales",
      label: day.label,
      value: formatCurrency(day.netSalesCents, workspace.store.currency),
      count: day.orderCount,
      detail: `Gross ${formatCurrency(
        day.grossSalesCents,
        workspace.store.currency,
      )}; refunds ${formatCurrency(day.refundCents, workspace.store.currency)}`,
      date: day.key,
    })),
    ...analytics.topProducts.map((product) => ({
      section: "product_performance",
      metric: "top_product",
      label: product.productName,
      value: formatCurrency(product.netSalesCents, workspace.store.currency),
      count: product.quantity,
      detail: `${product.orderCount} orders`,
      href: product.productId
        ? `/dashboard/stores/${workspace.store.id}/products/${product.productId}/edit`
        : undefined,
    })),
    ...analytics.topCustomers.map((customer) => ({
      section: "customer_performance",
      metric: "top_customer",
      label: customer.customerName,
      value: formatCurrency(customer.netSalesCents, workspace.store.currency),
      count: customer.orderCount,
      detail: `${customer.share}% of net sales`,
      href: `/dashboard/stores/${workspace.store.id}/customers/${encodeURIComponent(
        customer.customerEmail,
      )}`,
    })),
    ...analytics.lowStockProducts.map((product) => ({
      section: "inventory_risk",
      metric: "low_stock_product",
      label: product.name,
      value: product.inventoryCount,
      detail: `${product.status} / ${product.category || "uncategorized"}`,
      href: `/dashboard/stores/${workspace.store.id}/products/${product.id}/edit`,
    })),
    ...analytics.insights.map((insight) => ({
      section: "insight",
      metric: insight.id,
      label: insight.title,
      value: insight.severity,
      detail: insight.detail,
      href: insight.href,
    })),
  ];

  return csvResponse<AnalyticsExportRow>({
    filename: `${workspace.store.slug}-analytics.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "count", value: (row) => row.count },
      { header: "detail", value: (row) => row.detail },
      { header: "date", value: (row) => row.date },
      { header: "href", value: (row) => row.href },
    ],
  });
}
