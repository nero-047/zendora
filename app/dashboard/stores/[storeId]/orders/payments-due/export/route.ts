import { requireAppUser } from "@/features/auth/app-user";
import { getCustomerHref } from "@/features/commerce/customers";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  orderSourceLabels,
  orderStatusLabels,
  paymentMethodLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import {
  filterOrders,
  getOrderHref,
  parseOrderFulfillmentStageFilter,
  parseOrderFinancialStatusFilter,
  parseOrderPaymentStatusFilter,
  parseOrderRiskLevelFilter,
  parseOrderSourceFilter,
  parseOrderStatusFilter,
} from "@/features/commerce/orders";
import {
  getOrderFinancialReconciliation,
  isPaymentCollectionOpen,
  orderFinancialReconciliationStatusLabels,
} from "@/features/commerce/payments";
import type { Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type PaymentDuePriority = "critical" | "high" | "medium";

type PaymentDueRow = {
  ageDays: number;
  amountDueCents: number;
  financialStatus: string;
  order: Order;
  priority: PaymentDuePriority;
  recommendedAction: string;
  storeId: string;
};

const priorityRank: Record<PaymentDuePriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function getAgeDays(value: string, now: Date) {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86400000));
}

function getPaymentDuePriority(
  order: Order,
  amountDueCents: number,
  ageDays: number,
) {
  if (
    ageDays >= 7 ||
    amountDueCents >= 10000 ||
    (order.paymentStatus === "pending" && order.paymentMethod === "manual_invoice")
  ) {
    return "critical";
  }

  if (ageDays >= 3 || order.paymentStatus === "authorized") {
    return "high";
  }

  return "medium";
}

function getRecommendedAction(order: Order) {
  if (
    order.paymentStatus === "pending" &&
    order.paymentMethod === "manual_invoice"
  ) {
    return "Send invoice reminder and hold fulfillment until payment is collected.";
  }

  if (order.paymentStatus === "authorized") {
    return "Capture the authorization before fulfillment is released.";
  }

  if (order.source === "manual") {
    return "Follow up with the customer and record payment before packing.";
  }

  return "Collect outstanding payment before fulfillment is released.";
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const now = new Date();
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
  });
  const rows: PaymentDueRow[] = [];

  for (const order of filteredOrders) {
    const reconciliation = getOrderFinancialReconciliation(order);

    if (
      reconciliation.status !== "open_balance" ||
      reconciliation.balanceDueCents <= 0 ||
      !isPaymentCollectionOpen(order.paymentStatus)
    ) {
      continue;
    }

    const ageDays = getAgeDays(order.createdAt, now);

    rows.push({
      ageDays,
      amountDueCents: reconciliation.balanceDueCents,
      financialStatus:
        orderFinancialReconciliationStatusLabels[reconciliation.status],
      order,
      priority: getPaymentDuePriority(
        order,
        reconciliation.balanceDueCents,
        ageDays,
      ),
      recommendedAction: getRecommendedAction(order),
      storeId: workspace.store.id,
    });
  }

  rows.sort(
    (first, second) =>
      priorityRank[first.priority] - priorityRank[second.priority] ||
      second.amountDueCents - first.amountDueCents ||
      second.ageDays - first.ageDays ||
      new Date(first.order.createdAt).getTime() -
        new Date(second.order.createdAt).getTime(),
  );

  return csvResponse<PaymentDueRow>({
    filename: `${workspace.store.slug}-payments-due.csv`,
    rows,
    columns: [
      { header: "order_id", value: (row) => row.order.id },
      { header: "customer_name", value: (row) => row.order.customerName },
      { header: "customer_email", value: (row) => row.order.customerEmail },
      {
        header: "payment_status",
        value: (row) => paymentStatusLabels[row.order.paymentStatus],
      },
      { header: "financial_status", value: (row) => row.financialStatus },
      {
        header: "amount_due",
        value: (row) =>
          formatCurrency(row.amountDueCents, row.order.currency),
      },
      { header: "age_days", value: (row) => row.ageDays },
      { header: "priority", value: (row) => row.priority },
      {
        header: "recommended_action",
        value: (row) => row.recommendedAction,
      },
      {
        header: "order_status",
        value: (row) => orderStatusLabels[row.order.status],
      },
      {
        header: "payment_method",
        value: (row) => paymentMethodLabels[row.order.paymentMethod],
      },
      { header: "source", value: (row) => orderSourceLabels[row.order.source] },
      {
        header: "total",
        value: (row) =>
          formatCurrency(row.order.totalCents, row.order.currency),
      },
      {
        header: "gift_card_applied",
        value: (row) =>
          formatCurrency(row.order.giftCardCents, row.order.currency),
      },
      {
        header: "payment_reference",
        value: (row) => row.order.paymentReference,
      },
      {
        header: "created_at",
        value: (row) => new Date(row.order.createdAt).toISOString(),
      },
      {
        header: "order_href",
        value: (row) => getOrderHref(row.storeId, row.order.id),
      },
      {
        header: "customer_href",
        value: (row) => getCustomerHref(row.storeId, row.order.customerEmail),
      },
    ],
  });
}
