import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { fulfillmentStatusLabels } from "@/features/commerce/fulfillments";
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

type ShippingManifestRow = {
  order: Order;
  storeId: string;
};

const manifestStatusRank = {
  ready_for_label: 0,
  ready_for_handoff: 1,
  in_transit: 2,
  delivered: 3,
  needs_payment: 4,
  missing_address: 5,
  cancelled: 6,
} as const;

type ManifestStatus = keyof typeof manifestStatusRank;

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function getManifestStatus(order: Order): ManifestStatus {
  const fulfillment = getOrderFulfillmentSummary(order);

  if (order.status === "cancelled" || fulfillment.stage === "cancelled") {
    return "cancelled";
  }

  if (!order.shippingAddress) {
    return "missing_address";
  }

  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
    return "needs_payment";
  }

  if (fulfillment.stage === "delivered" || fulfillment.stage === "fulfilled") {
    return "delivered";
  }

  if (fulfillment.stage === "in_transit") {
    return "in_transit";
  }

  if (fulfillment.hasTracking) {
    return "ready_for_handoff";
  }

  return "ready_for_label";
}

function getManifestStatusLabel(status: ManifestStatus) {
  return status
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() || ""}${word.slice(1)}`)
    .join(" ");
}

function getItemCount(order: Order) {
  return (order.items || []).reduce((sum, item) => sum + item.quantity, 0);
}

function getItems(order: Order) {
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

function getCarrierAction(order: Order) {
  const status = getManifestStatus(order);

  if (status === "ready_for_label") {
    return "Create label and assign carrier before handoff.";
  }

  if (status === "ready_for_handoff") {
    return "Hand off to carrier and mark shipment in transit.";
  }

  if (status === "needs_payment") {
    return "Collect payment before shipping.";
  }

  if (status === "missing_address") {
    return "Add a complete shipping address before fulfillment.";
  }

  if (status === "in_transit") {
    return "Monitor tracking until delivered.";
  }

  if (status === "delivered") {
    return "No carrier action needed.";
  }

  return "No carrier action; order is cancelled.";
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
  }).sort((first, second) => {
    const firstStatus = getManifestStatus(first);
    const secondStatus = getManifestStatus(second);

    return (
      manifestStatusRank[firstStatus] - manifestStatusRank[secondStatus] ||
      new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
    );
  });
  const rows = filteredOrders.map((order) => ({
    order,
    storeId: workspace.store.id,
  }));

  return csvResponse<ShippingManifestRow>({
    filename: `${workspace.store.slug}-shipping-manifest.csv`,
    rows,
    columns: [
      { header: "order_id", value: (row) => row.order.id },
      {
        header: "manifest_status",
        value: (row) => getManifestStatusLabel(getManifestStatus(row.order)),
      },
      {
        header: "carrier_action",
        value: (row) => getCarrierAction(row.order),
      },
      {
        header: "fulfillment_stage",
        value: (row) => getOrderFulfillmentSummary(row.order).label,
      },
      {
        header: "shipment_id",
        value: (row) =>
          getOrderFulfillmentSummary(row.order).latestFulfillment?.id || "",
      },
      {
        header: "shipment_status",
        value: (row) => {
          const latestFulfillment =
            getOrderFulfillmentSummary(row.order).latestFulfillment;

          return latestFulfillment
            ? fulfillmentStatusLabels[latestFulfillment.status]
            : "";
        },
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
      { header: "source", value: (row) => orderSourceLabels[row.order.source] },
      { header: "customer_name", value: (row) => row.order.customerName },
      { header: "customer_email", value: (row) => row.order.customerEmail },
      { header: "customer_phone", value: (row) => row.order.customerPhone },
      {
        header: "ship_to_line1",
        value: (row) => row.order.shippingAddress?.line1,
      },
      {
        header: "ship_to_line2",
        value: (row) => row.order.shippingAddress?.line2,
      },
      {
        header: "ship_to_city",
        value: (row) => row.order.shippingAddress?.city,
      },
      {
        header: "ship_to_region",
        value: (row) => row.order.shippingAddress?.region,
      },
      {
        header: "ship_to_postal_code",
        value: (row) => row.order.shippingAddress?.postalCode,
      },
      {
        header: "ship_to_country",
        value: (row) => row.order.shippingAddress?.country,
      },
      { header: "item_count", value: (row) => getItemCount(row.order) },
      { header: "items", value: (row) => getItems(row.order) },
      {
        header: "order_value",
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
