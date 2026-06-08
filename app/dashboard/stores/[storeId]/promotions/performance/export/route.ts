import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { orderStatusLabels, paymentStatusLabels } from "@/features/commerce/order-status";
import type { Discount, DiscountType, Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type DiscountPerformanceRow = {
  rowType: string;
  code: string;
  status?: string;
  value?: string;
  configuredRedemptions?: number;
  observedRedemptions?: number;
  utilizationRate?: string;
  remainingRedemptions?: number | string;
  grossSales?: string;
  discountAmount?: string;
  netSales?: string;
  averageOrderValue?: string;
  customerCount?: number;
  recommendedAction?: string;
  detail?: string;
  href?: string;
};

const discountStatusLabels: Record<Discount["status"], string> = {
  active: "Active",
  paused: "Paused",
};

function formatDiscountValue(input: {
  currency: string;
  type: DiscountType;
  value: number;
}) {
  if (input.type === "percent") {
    return `${input.value}% off`;
  }

  return `${formatCurrency(input.value, input.currency)} off`;
}

function normalizeCode(value: string | undefined) {
  return value?.trim().toUpperCase() || "";
}

function getUsageRate(used: number, limit: number | undefined) {
  if (!limit || limit <= 0) {
    return "Unlimited";
  }

  return `${Math.round((used / limit) * 100)}%`;
}

function getRemainingRedemptions(discount: Discount) {
  if (!discount.usageLimit) {
    return "Unlimited";
  }

  return Math.max(0, discount.usageLimit - discount.redemptionCount);
}

function getRecommendedAction(input: {
  discount: Discount;
  observedRedemptions: number;
  discountAmountCents: number;
}) {
  if (input.discount.status === "paused") {
    return input.observedRedemptions > 0
      ? "Review paused code before reactivation; it has historical usage."
      : "Keep paused or archive if the campaign is no longer planned.";
  }

  if (
    input.discount.usageLimit &&
    input.discount.redemptionCount >= input.discount.usageLimit
  ) {
    return "Usage limit is reached; raise the cap only after margin review.";
  }

  if (input.observedRedemptions === 0) {
    return "Promote this active code or review campaign placement.";
  }

  if (input.discountAmountCents <= 0) {
    return "Audit discount application because no discount value was recorded.";
  }

  return "Campaign is active; monitor redemptions and order value.";
}

function getDiscountOrders(orders: Order[], code: string) {
  const normalizedCode = normalizeCode(code);

  return orders.filter(
    (order) =>
      normalizeCode(order.discountCode) === normalizedCode ||
      (!normalizedCode && order.discountCents > 0),
  );
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { discounts, orders, store } = workspace;
  const configuredCodes = new Set(discounts.map((discount) => normalizeCode(discount.code)));
  const manualDiscountOrders = orders.filter(
    (order) =>
      order.discountCents > 0 && !configuredCodes.has(normalizeCode(order.discountCode)),
  );
  const rows: DiscountPerformanceRow[] = [
    {
      rowType: "summary",
      code: "all_discounts",
      status: "Tracked",
      configuredRedemptions: discounts.reduce(
        (sum, discount) => sum + discount.redemptionCount,
        0,
      ),
      observedRedemptions:
        orders.filter((order) => order.discountCode || order.discountCents > 0)
          .length,
      discountAmount: formatCurrency(
        orders.reduce((sum, order) => sum + order.discountCents, 0),
        store.currency,
      ),
      detail: `${discounts.length} configured codes / ${manualDiscountOrders.length} manual or unconfigured discount orders`,
    },
    ...discounts.flatMap((discount) => {
      const discountOrders = getDiscountOrders(orders, discount.code);
      const grossSalesCents = discountOrders.reduce(
        (sum, order) => sum + order.totalCents + order.discountCents,
        0,
      );
      const discountAmountCents = discountOrders.reduce(
        (sum, order) => sum + order.discountCents,
        0,
      );
      const netSalesCents = discountOrders.reduce(
        (sum, order) => sum + Math.max(0, order.totalCents - order.refundedCents),
        0,
      );
      const customers = new Set(
        discountOrders.map((order) => order.customerEmail.toLowerCase()),
      );
      const discountRow: DiscountPerformanceRow = {
        rowType: "discount",
        code: discount.code,
        status: discountStatusLabels[discount.status],
        value: formatDiscountValue({
          currency: store.currency,
          type: discount.type,
          value: discount.value,
        }),
        configuredRedemptions: discount.redemptionCount,
        observedRedemptions: discountOrders.length,
        utilizationRate: getUsageRate(discount.redemptionCount, discount.usageLimit),
        remainingRedemptions: getRemainingRedemptions(discount),
        grossSales: formatCurrency(grossSalesCents, store.currency),
        discountAmount: formatCurrency(discountAmountCents, store.currency),
        netSales: formatCurrency(netSalesCents, store.currency),
        averageOrderValue: formatCurrency(
          discountOrders.length > 0
            ? Math.round(netSalesCents / discountOrders.length)
            : 0,
          store.currency,
        ),
        customerCount: customers.size,
        recommendedAction: getRecommendedAction({
          discount,
          observedRedemptions: discountOrders.length,
          discountAmountCents,
        }),
        detail: [
          discount.minSubtotalCents > 0
            ? `minimum ${formatCurrency(discount.minSubtotalCents, store.currency)}`
            : "no minimum",
          discount.usageLimit ? `${discount.usageLimit} usage limit` : "unlimited",
        ].join(" / "),
      };
      const orderRows = discountOrders.map((order) => ({
        rowType: "discount_order",
        code: discount.code,
        status: orderStatusLabels[order.status],
        value: paymentStatusLabels[order.paymentStatus],
        observedRedemptions: 1,
        grossSales: formatCurrency(order.totalCents + order.discountCents, order.currency),
        discountAmount: formatCurrency(order.discountCents, order.currency),
        netSales: formatCurrency(
          Math.max(0, order.totalCents - order.refundedCents),
          order.currency,
        ),
        averageOrderValue: formatCurrency(
          Math.max(0, order.totalCents - order.refundedCents),
          order.currency,
        ),
        customerCount: 1,
        detail: [order.customerName, order.customerEmail, order.createdAt]
          .filter(Boolean)
          .join(" / "),
        href: `/dashboard/stores/${store.id}/orders/${order.id}`,
      }));

      return [discountRow, ...orderRows];
    }),
    ...manualDiscountOrders.map((order) => ({
      rowType: "manual_discount_order",
      code: order.discountCode || "MANUAL",
      status: orderStatusLabels[order.status],
      value: paymentStatusLabels[order.paymentStatus],
      observedRedemptions: 1,
      grossSales: formatCurrency(order.totalCents + order.discountCents, order.currency),
      discountAmount: formatCurrency(order.discountCents, order.currency),
      netSales: formatCurrency(
        Math.max(0, order.totalCents - order.refundedCents),
        order.currency,
      ),
      averageOrderValue: formatCurrency(
        Math.max(0, order.totalCents - order.refundedCents),
        order.currency,
      ),
      customerCount: 1,
      recommendedAction:
        "Review manual or unconfigured discount usage before repeating the campaign.",
      detail: [order.customerName, order.customerEmail, order.createdAt]
        .filter(Boolean)
        .join(" / "),
      href: `/dashboard/stores/${store.id}/orders/${order.id}`,
    })),
  ];

  return csvResponse<DiscountPerformanceRow>({
    filename: `${store.slug}-discount-performance.csv`,
    rows,
    columns: [
      { header: "row_type", value: (row) => row.rowType },
      { header: "code", value: (row) => row.code },
      { header: "status", value: (row) => row.status },
      { header: "value", value: (row) => row.value },
      {
        header: "configured_redemptions",
        value: (row) => row.configuredRedemptions,
      },
      {
        header: "observed_redemptions",
        value: (row) => row.observedRedemptions,
      },
      { header: "utilization_rate", value: (row) => row.utilizationRate },
      {
        header: "remaining_redemptions",
        value: (row) => row.remainingRedemptions,
      },
      { header: "gross_sales", value: (row) => row.grossSales },
      { header: "discount_amount", value: (row) => row.discountAmount },
      { header: "net_sales", value: (row) => row.netSales },
      { header: "average_order_value", value: (row) => row.averageOrderValue },
      { header: "customer_count", value: (row) => row.customerCount },
      { header: "recommended_action", value: (row) => row.recommendedAction },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
