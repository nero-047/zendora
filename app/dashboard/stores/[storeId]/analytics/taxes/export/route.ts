import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  isRevenueOrderStatus,
  orderStatusLabels,
  paymentStatusLabels,
} from "@/features/commerce/order-status";
import type { Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type TaxExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  count?: number;
  status?: string;
  detail?: string;
  date?: string;
  href?: string;
};

type RegionTaxSummary = {
  region: string;
  orderCount: number;
  taxableBasisCents: number;
  grossTaxCents: number;
  estimatedRefundedTaxCents: number;
  netTaxCents: number;
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function formatTaxRate(bps: number) {
  return `${Number((bps / 100).toFixed(2))}%`;
}

function getTaxRegion(order: Order) {
  const address = order.shippingAddress;

  if (!address) {
    return "Unknown region";
  }

  return [address.country, address.region].filter(Boolean).join(" / ");
}

function getTaxableBasisCents(order: Order) {
  return Math.max(
    0,
    order.subtotalCents - order.discountCents + order.shippingCents,
  );
}

function getEstimatedRefundedTaxCents(order: Order) {
  if (order.totalCents <= 0 || order.refundedCents <= 0 || order.taxCents <= 0) {
    return 0;
  }

  return Math.min(
    order.taxCents,
    Math.round((order.taxCents * order.refundedCents) / order.totalCents),
  );
}

function getNetTaxCents(order: Order) {
  return Math.max(0, order.taxCents - getEstimatedRefundedTaxCents(order));
}

function getRegionSummaries(orders: Order[]) {
  const summaries = new Map<string, RegionTaxSummary>();

  for (const order of orders) {
    const region = getTaxRegion(order);
    const current = summaries.get(region) || {
      region,
      orderCount: 0,
      taxableBasisCents: 0,
      grossTaxCents: 0,
      estimatedRefundedTaxCents: 0,
      netTaxCents: 0,
    };

    current.orderCount += 1;
    current.taxableBasisCents += getTaxableBasisCents(order);
    current.grossTaxCents += order.taxCents;
    current.estimatedRefundedTaxCents += getEstimatedRefundedTaxCents(order);
    current.netTaxCents += getNetTaxCents(order);
    summaries.set(region, current);
  }

  return [...summaries.values()].sort(
    (a, b) => b.netTaxCents - a.netTaxCents || a.region.localeCompare(b.region),
  );
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const revenueOrders = workspace.orders
    .filter((order) => isRevenueOrderStatus(order.status))
    .sort(
      (a, b) =>
        new Date(b.paidAt || b.createdAt).getTime() -
        new Date(a.paidAt || a.createdAt).getTime(),
    );
  const pendingTaxOrders = workspace.orders.filter(
    (order) => order.status === "pending" && order.taxCents > 0,
  );
  const grossTaxCents = revenueOrders.reduce(
    (sum, order) => sum + order.taxCents,
    0,
  );
  const estimatedRefundedTaxCents = revenueOrders.reduce(
    (sum, order) => sum + getEstimatedRefundedTaxCents(order),
    0,
  );
  const netTaxCents = revenueOrders.reduce(
    (sum, order) => sum + getNetTaxCents(order),
    0,
  );
  const pendingTaxCents = pendingTaxOrders.reduce(
    (sum, order) => sum + order.taxCents,
    0,
  );
  const rows: TaxExportRow[] = [
    {
      section: "tax_summary",
      metric: "tax_collected",
      label: "Tax collected",
      value: formatCurrency(netTaxCents, store.currency),
      count: revenueOrders.length,
      detail: `${formatCurrency(
        grossTaxCents,
        store.currency,
      )} gross tax / ${formatCurrency(
        estimatedRefundedTaxCents,
        store.currency,
      )} estimated refunded tax`,
    },
    {
      section: "tax_summary",
      metric: "pending_tax",
      label: "Pending tax",
      value: formatCurrency(pendingTaxCents, store.currency),
      count: pendingTaxOrders.length,
      detail: "Tax on pending or unpaid orders is shown separately from collected tax.",
    },
    ...getRegionSummaries(revenueOrders).map((summary) => ({
      section: "tax_region",
      metric: summary.region,
      label: summary.region,
      value: formatCurrency(summary.netTaxCents, store.currency),
      count: summary.orderCount,
      detail: `${formatCurrency(
        summary.taxableBasisCents,
        store.currency,
      )} taxable basis / ${formatCurrency(
        summary.grossTaxCents,
        store.currency,
      )} gross tax / ${formatCurrency(
        summary.estimatedRefundedTaxCents,
        store.currency,
      )} estimated refunded tax`,
    })),
    ...revenueOrders.map((order) => ({
      section: "tax_order",
      metric: order.id,
      label: order.customerName || order.customerEmail,
      value: formatCurrency(getNetTaxCents(order), order.currency),
      count: (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
      status: `${orderStatusLabels[order.status]} / ${
        paymentStatusLabels[order.paymentStatus]
      }`,
      detail: [
        getTaxRegion(order),
        `${formatTaxRate(order.taxRateBps)} tax rate`,
        `${formatCurrency(getTaxableBasisCents(order), order.currency)} taxable basis`,
        `${formatCurrency(order.taxCents, order.currency)} gross tax`,
        `${formatCurrency(
          getEstimatedRefundedTaxCents(order),
          order.currency,
        )} estimated refunded tax`,
        `${formatCurrency(order.totalCents, order.currency)} order total`,
      ].join(" / "),
      date: formatDate(order.paidAt || order.createdAt),
      href: `/dashboard/stores/${store.id}/orders/${order.id}`,
    })),
    ...pendingTaxOrders.map((order) => ({
      section: "pending_tax_order",
      metric: order.id,
      label: order.customerName || order.customerEmail,
      value: formatCurrency(order.taxCents, order.currency),
      count: (order.items || []).reduce((sum, item) => sum + item.quantity, 0),
      status: `${orderStatusLabels[order.status]} / ${
        paymentStatusLabels[order.paymentStatus]
      }`,
      detail: [
        getTaxRegion(order),
        `${formatTaxRate(order.taxRateBps)} tax rate`,
        `${formatCurrency(getTaxableBasisCents(order), order.currency)} taxable basis`,
        `${formatCurrency(order.amountDueCents, order.currency)} amount due`,
      ].join(" / "),
      date: formatDate(order.createdAt),
      href: `/dashboard/stores/${store.id}/orders/${order.id}`,
    })),
  ];

  return csvResponse<TaxExportRow>({
    filename: `${store.slug}-tax-report.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "count", value: (row) => row.count },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "date", value: (row) => row.date },
      { header: "href", value: (row) => row.href },
    ],
  });
}
