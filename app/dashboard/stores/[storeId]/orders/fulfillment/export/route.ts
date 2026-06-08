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
import type { Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type FulfillmentExportRow = {
  order: Order;
  storeId: string;
};

const fulfillmentStageRank = {
  unfulfilled: 0,
  preparing: 1,
  in_transit: 2,
  delivered: 3,
  fulfilled: 4,
  cancelled: 5,
} as const;

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function formatAddress(order: Order) {
  const address = order.shippingAddress;

  if (!address) {
    return "";
  }

  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function formatItems(order: Order) {
  return (order.items || [])
    .map((item) =>
      [
        `${item.quantity} x ${item.productName}`,
        item.variantName,
        item.variantSku,
      ]
        .filter(Boolean)
        .join(" / "),
    )
    .join(" | ");
}

function getItemCount(order: Order) {
  return (order.items || []).reduce((sum, item) => sum + item.quantity, 0);
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const filteredOrders = filterOrders({
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
  }).sort((a, b) => {
    const aFulfillment = getOrderFulfillmentSummary(a);
    const bFulfillment = getOrderFulfillmentSummary(b);

    return (
      fulfillmentStageRank[aFulfillment.stage] -
        fulfillmentStageRank[bFulfillment.stage] ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  });
  const rows = filteredOrders.map((order) => ({
    order,
    storeId: workspace.store.id,
  }));

  return csvResponse<FulfillmentExportRow>({
    filename: `${workspace.store.slug}-fulfillment-queue.csv`,
    rows,
    columns: [
      { header: "order_id", value: (row) => row.order.id },
      {
        header: "fulfillment_stage",
        value: (row) => getOrderFulfillmentSummary(row.order).label,
      },
      {
        header: "fulfillment_detail",
        value: (row) => getOrderFulfillmentSummary(row.order).detail,
      },
      {
        header: "risk",
        value: (row) =>
          orderRiskLevelLabels[
            getOrderRiskAssessment(row.order, {
              orders: workspace.orders,
            }).level
          ],
      },
      {
        header: "payment_status",
        value: (row) => paymentStatusLabels[row.order.paymentStatus],
      },
      {
        header: "order_status",
        value: (row) => orderStatusLabels[row.order.status],
      },
      {
        header: "source",
        value: (row) => orderSourceLabels[row.order.source],
      },
      { header: "customer_name", value: (row) => row.order.customerName },
      { header: "customer_email", value: (row) => row.order.customerEmail },
      { header: "customer_phone", value: (row) => row.order.customerPhone },
      {
        header: "ship_to",
        value: (row) => formatAddress(row.order),
      },
      { header: "item_count", value: (row) => getItemCount(row.order) },
      { header: "items", value: (row) => formatItems(row.order) },
      {
        header: "total",
        value: (row) => formatCurrency(row.order.totalCents, row.order.currency),
      },
      {
        header: "tracking_carrier",
        value: (row) =>
          getOrderFulfillmentSummary(row.order).latestFulfillment
            ?.trackingCarrier || row.order.trackingCarrier,
      },
      {
        header: "tracking_number",
        value: (row) =>
          getOrderFulfillmentSummary(row.order).latestFulfillment
            ?.trackingNumber || row.order.trackingNumber,
      },
      {
        header: "tracking_url",
        value: (row) =>
          getOrderFulfillmentSummary(row.order).latestFulfillment?.trackingUrl ||
          row.order.trackingUrl,
      },
      {
        header: "created_at",
        value: (row) => new Date(row.order.createdAt).toISOString(),
      },
      {
        header: "order_href",
        value: (row) =>
          `/dashboard/stores/${row.storeId}/orders/${row.order.id}`,
      },
      {
        header: "packing_slip_href",
        value: (row) =>
          `/dashboard/stores/${row.storeId}/orders/${row.order.id}/packing-slip`,
      },
    ],
  });
}
