import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getOrderFulfillmentSummary,
  getOrderRiskAssessment,
  orderRiskLevelLabels,
} from "@/features/commerce/order-insights";
import {
  orderSourceLabels,
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  filterOrders,
  parseOrderFulfillmentStageFilter,
  parseOrderFinancialStatusFilter,
  parseOrderPaymentStatusFilter,
  parseOrderRiskLevelFilter,
  parseOrderSourceFilter,
  parseOrderStatusFilter,
} from "@/features/commerce/orders";
import {
  getOrderFinancialReconciliation,
  orderFinancialReconciliationStatusLabels,
} from "@/features/commerce/payments";
import type { Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const rows = filterOrders({
    orders: workspace.orders,
    query: readParam(searchParams, "q") || "",
    status: parseOrderStatusFilter(readParam(searchParams, "status")),
    paymentStatus: parseOrderPaymentStatusFilter(
      readParam(searchParams, "payment"),
    ),
    source: parseOrderSourceFilter(readParam(searchParams, "source")),
    fulfillmentStage: parseOrderFulfillmentStageFilter(
      readParam(searchParams, "fulfillment"),
    ),
    risk: parseOrderRiskLevelFilter(readParam(searchParams, "risk")),
    financialStatus: parseOrderFinancialStatusFilter(
      readParam(searchParams, "financial"),
    ),
  });

  return csvResponse<Order>({
    filename: `${workspace.store.slug}-orders.csv`,
    rows,
    columns: [
      { header: "order_id", value: (order) => order.id },
      { header: "customer_name", value: (order) => order.customerName },
      { header: "customer_email", value: (order) => order.customerEmail },
      { header: "status", value: (order) => orderStatusLabels[order.status] },
      {
        header: "payment_status",
        value: (order) => paymentStatusLabels[order.paymentStatus],
      },
      {
        header: "payment_method",
        value: (order) => paymentMethodLabels[order.paymentMethod],
      },
      {
        header: "source",
        value: (order) => orderSourceLabels[order.source],
      },
      {
        header: "fulfillment",
        value: (order) => getOrderFulfillmentSummary(order).label,
      },
      {
        header: "risk",
        value: (order) =>
          orderRiskLevelLabels[
            getOrderRiskAssessment(order, { orders: workspace.orders }).level
          ],
      },
      {
        header: "financial_status",
        value: (order) =>
          orderFinancialReconciliationStatusLabels[
            getOrderFinancialReconciliation(order).status
          ],
      },
      {
        header: "balance_due",
        value: (order) =>
          formatCurrency(
            getOrderFinancialReconciliation(order).balanceDueCents,
            order.currency,
          ),
      },
      {
        header: "ledger_delta",
        value: (order) =>
          formatCurrency(
            getOrderFinancialReconciliation(order).ledgerDeltaCents,
            order.currency,
          ),
      },
      {
        header: "total",
        value: (order) => formatCurrency(order.totalCents, order.currency),
      },
      {
        header: "refunded",
        value: (order) => formatCurrency(order.refundedCents, order.currency),
      },
      {
        header: "net_paid",
        value: (order) =>
          formatCurrency(
            Math.max(0, order.totalCents - order.refundedCents),
            order.currency,
          ),
      },
      { header: "payment_provider", value: (order) => order.paymentProvider },
      { header: "payment_reference", value: (order) => order.paymentReference },
      {
        header: "tracking_number",
        value: (order) =>
          getOrderFulfillmentSummary(order).latestFulfillment?.trackingNumber ||
          order.trackingNumber,
      },
      {
        header: "item_count",
        value: (order) =>
          order.items?.reduce((sum, item) => sum + item.quantity, 0) || 0,
      },
      {
        header: "created_at",
        value: (order) => new Date(order.createdAt).toISOString(),
      },
    ],
  });
}
