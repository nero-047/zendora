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

type FulfillmentSlaRow = {
  order: Order;
  storeId: string;
};

const SHIP_SLA_HOURS = 48;
const WARNING_WINDOW_HOURS = 12;

const slaStatusRank = {
  late_to_ship: 0,
  due_soon: 1,
  ready_to_ship: 2,
  shipped: 3,
  delivered: 4,
  waiting_payment: 5,
  missing_address: 6,
  cancelled: 7,
} as const;

type SlaStatus = keyof typeof slaStatusRank;

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function addHours(value: string, hours: number) {
  return new Date(new Date(value).getTime() + hours * 3600000);
}

function getHoursBetween(first: string | Date, second: string | Date) {
  const firstTime = new Date(first).getTime();
  const secondTime = new Date(second).getTime();

  if (!Number.isFinite(firstTime) || !Number.isFinite(secondTime)) {
    return "";
  }

  return Math.max(0, Math.round((secondTime - firstTime) / 3600000));
}

function getShipClockStart(order: Order) {
  return order.paidAt || order.createdAt;
}

function getShipDeadline(order: Order) {
  return addHours(getShipClockStart(order), SHIP_SLA_HOURS);
}

function getSlaStatus(order: Order, now = new Date()): SlaStatus {
  const fulfillment = getOrderFulfillmentSummary(order);
  const deadline = getShipDeadline(order);
  const hoursUntilDeadline = Math.round(
    (deadline.getTime() - now.getTime()) / 3600000,
  );

  if (order.status === "cancelled") {
    return "cancelled";
  }

  if (!order.shippingAddress) {
    return "missing_address";
  }

  if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
    return "waiting_payment";
  }

  if (fulfillment.stage === "delivered" || fulfillment.stage === "fulfilled") {
    return "delivered";
  }

  if (fulfillment.stage === "in_transit" || fulfillment.stage === "preparing") {
    return "shipped";
  }

  if (hoursUntilDeadline < 0) {
    return "late_to_ship";
  }

  if (hoursUntilDeadline <= WARNING_WINDOW_HOURS) {
    return "due_soon";
  }

  return "ready_to_ship";
}

function getSlaStatusLabel(status: SlaStatus) {
  return status
    .split("_")
    .map((word) => `${word[0]?.toUpperCase() || ""}${word.slice(1)}`)
    .join(" ");
}

function getRecommendedAction(order: Order) {
  const status = getSlaStatus(order);

  if (status === "late_to_ship") {
    return "Prioritize packing and carrier label creation immediately.";
  }

  if (status === "due_soon") {
    return "Pack before the SLA deadline is missed.";
  }

  if (status === "ready_to_ship") {
    return "Keep in fulfillment queue and prepare label.";
  }

  if (status === "shipped") {
    return "Monitor tracking until delivery.";
  }

  if (status === "waiting_payment") {
    return "Collect payment before SLA clock is actionable.";
  }

  if (status === "missing_address") {
    return "Collect a complete shipping address before fulfillment.";
  }

  if (status === "delivered") {
    return "No SLA action needed.";
  }

  return "No SLA action; order is cancelled.";
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
  }).sort((first, second) => {
    const firstStatus = getSlaStatus(first);
    const secondStatus = getSlaStatus(second);

    return (
      slaStatusRank[firstStatus] - slaStatusRank[secondStatus] ||
      new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
    );
  });
  const rows = filteredOrders.map((order) => ({
    order,
    storeId: workspace.store.id,
  }));

  return csvResponse<FulfillmentSlaRow>({
    filename: `${workspace.store.slug}-fulfillment-sla.csv`,
    rows,
    columns: [
      { header: "order_id", value: (row) => row.order.id },
      {
        header: "sla_status",
        value: (row) => getSlaStatusLabel(getSlaStatus(row.order)),
      },
      { header: "sla_hours", value: () => SHIP_SLA_HOURS },
      {
        header: "ship_clock_start_at",
        value: (row) => new Date(getShipClockStart(row.order)).toISOString(),
      },
      {
        header: "ship_deadline_at",
        value: (row) => getShipDeadline(row.order).toISOString(),
      },
      {
        header: "hours_since_order",
        value: (row) => getHoursBetween(row.order.createdAt, new Date()),
      },
      {
        header: "hours_to_ship",
        value: (row) => {
          const latestFulfillment =
            getOrderFulfillmentSummary(row.order).latestFulfillment;

          return latestFulfillment?.shippedAt
            ? getHoursBetween(getShipClockStart(row.order), latestFulfillment.shippedAt)
            : "";
        },
      },
      {
        header: "hours_overdue",
        value: (row) => {
          const deadline = getShipDeadline(row.order);
          const overdueHours = Math.round(
            (new Date().getTime() - deadline.getTime()) / 3600000,
          );

          return Math.max(0, overdueHours);
        },
      },
      {
        header: "recommended_action",
        value: (row) => getRecommendedAction(row.order),
      },
      {
        header: "fulfillment_stage",
        value: (row) => getOrderFulfillmentSummary(row.order).label,
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
      { header: "item_count", value: (row) => getItemCount(row.order) },
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
