import { requireAppUser } from "@/features/auth/app-user";
import { getCustomerHref } from "@/features/commerce/customers";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getOrderFulfillmentSummary,
  getOrderRiskAssessment,
  orderFulfillmentStageLabels,
  orderRiskLevelLabels,
  type OrderRiskAssessment,
} from "@/features/commerce/order-insights";
import {
  orderSourceLabels,
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

function countFactorsBySeverity(
  riskAssessment: OrderRiskAssessment,
  severity: "critical" | "warning" | "info",
) {
  return riskAssessment.factors.filter((factor) => factor.severity === severity)
    .length;
}

function joinRiskFactorLabels(riskAssessment: OrderRiskAssessment) {
  return riskAssessment.factors.map((factor) => factor.label).join(" | ");
}

function joinRiskFactorDetails(riskAssessment: OrderRiskAssessment) {
  return riskAssessment.factors
    .map((factor) => `${factor.label}: ${factor.detail}`)
    .join(" | ");
}

function getRecommendedAction(order: Order, riskAssessment: OrderRiskAssessment) {
  if (riskAssessment.factors.some((factor) => factor.id === "payment_open")) {
    return "Hold fulfillment until the remaining payment is collected.";
  }

  if (
    riskAssessment.factors.some(
      (factor) => factor.id === "ledger_below_amount_due",
    )
  ) {
    return "Reconcile payment records before shipping or refunding.";
  }

  if (
    riskAssessment.factors.some((factor) => factor.id === "missing_shipping_address")
  ) {
    return "Collect a valid shipping address before fulfillment.";
  }

  if (riskAssessment.level === "high") {
    return "Review payment, customer, and fulfillment details before release.";
  }

  if (riskAssessment.level === "medium") {
    return "Review the warning factors before packing this order.";
  }

  return order.status === "paid"
    ? "Order can proceed through normal fulfillment."
    : "Monitor order until payment and fulfillment are complete.";
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
  }).sort((first, second) => {
    const firstRisk = getOrderRiskAssessment(first, { orders: workspace.orders });
    const secondRisk = getOrderRiskAssessment(second, { orders: workspace.orders });

    return (
      secondRisk.score - firstRisk.score ||
      second.totalCents - first.totalCents ||
      new Date(first.createdAt).getTime() - new Date(second.createdAt).getTime()
    );
  });

  return csvResponse<Order>({
    filename: `${workspace.store.slug}-order-risk-review.csv`,
    rows,
    columns: [
      { header: "order_id", value: (order) => order.id },
      { header: "customer_name", value: (order) => order.customerName },
      { header: "customer_email", value: (order) => order.customerEmail },
      {
        header: "risk_level",
        value: (order) =>
          orderRiskLevelLabels[
            getOrderRiskAssessment(order, { orders: workspace.orders }).level
          ],
      },
      {
        header: "risk_score",
        value: (order) =>
          getOrderRiskAssessment(order, { orders: workspace.orders }).score,
      },
      {
        header: "critical_factors",
        value: (order) =>
          countFactorsBySeverity(
            getOrderRiskAssessment(order, { orders: workspace.orders }),
            "critical",
          ),
      },
      {
        header: "warning_factors",
        value: (order) =>
          countFactorsBySeverity(
            getOrderRiskAssessment(order, { orders: workspace.orders }),
            "warning",
          ),
      },
      {
        header: "info_factors",
        value: (order) =>
          countFactorsBySeverity(
            getOrderRiskAssessment(order, { orders: workspace.orders }),
            "info",
          ),
      },
      {
        header: "risk_factors",
        value: (order) =>
          joinRiskFactorLabels(
            getOrderRiskAssessment(order, { orders: workspace.orders }),
          ),
      },
      {
        header: "risk_factor_details",
        value: (order) =>
          joinRiskFactorDetails(
            getOrderRiskAssessment(order, { orders: workspace.orders }),
          ),
      },
      {
        header: "recommended_action",
        value: (order) =>
          getRecommendedAction(
            order,
            getOrderRiskAssessment(order, { orders: workspace.orders }),
          ),
      },
      {
        header: "amount_due",
        value: (order) =>
          formatCurrency(
            getOrderRiskAssessment(order, { orders: workspace.orders })
              .amountDueCents,
            order.currency,
          ),
      },
      {
        header: "financial_status",
        value: (order) =>
          orderFinancialReconciliationStatusLabels[
            getOrderFinancialReconciliation(order).status
          ],
      },
      {
        header: "fulfillment_stage",
        value: (order) =>
          orderFulfillmentStageLabels[getOrderFulfillmentSummary(order).stage],
      },
      {
        header: "payment_status",
        value: (order) => paymentStatusLabels[order.paymentStatus],
      },
      {
        header: "payment_method",
        value: (order) => paymentMethodLabels[order.paymentMethod],
      },
      { header: "source", value: (order) => orderSourceLabels[order.source] },
      {
        header: "total",
        value: (order) => formatCurrency(order.totalCents, order.currency),
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
      {
        header: "order_href",
        value: (order) => getOrderHref(workspace.store.id, order.id),
      },
      {
        header: "customer_href",
        value: (order) => getCustomerHref(workspace.store.id, order.customerEmail),
      },
    ],
  });
}
