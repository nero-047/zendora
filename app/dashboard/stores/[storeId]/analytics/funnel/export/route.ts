import { requireAppUser } from "@/features/auth/app-user";
import { canQueueAbandonedCheckoutRecovery } from "@/features/commerce/abandoned-checkouts";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type { AbandonedCheckout, Order } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type FunnelExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  count?: number;
  rate?: string;
  status?: string;
  detail?: string;
  href?: string;
};

type ProductFunnel = {
  productId: string;
  productName: string;
  checkoutQuantity: number;
  checkoutValueCents: number;
  orderQuantity: number;
  orderValueCents: number;
  recoveredQuantity: number;
};

function formatPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return "0%";
  }

  return `${Math.round((numerator / denominator) * 100)}%`;
}

function getOpenAbandonedCheckouts(checkouts: AbandonedCheckout[]) {
  return checkouts.filter((checkout) => checkout.status === "open");
}

function getRecoveredAbandonedCheckouts(checkouts: AbandonedCheckout[]) {
  return checkouts.filter((checkout) => checkout.status === "recovered");
}

function summarizeProductFunnel(input: {
  abandonedCheckouts: AbandonedCheckout[];
  orders: Order[];
}) {
  const rows = new Map<string, ProductFunnel>();

  for (const checkout of input.abandonedCheckouts) {
    for (const line of checkout.lines) {
      const current = rows.get(line.productId) || {
        productId: line.productId,
        productName: line.productName,
        checkoutQuantity: 0,
        checkoutValueCents: 0,
        orderQuantity: 0,
        orderValueCents: 0,
        recoveredQuantity: 0,
      };

      current.checkoutQuantity += line.quantity;
      current.checkoutValueCents += line.unitPriceCents * line.quantity;

      if (checkout.status === "recovered") {
        current.recoveredQuantity += line.quantity;
      }

      rows.set(line.productId, current);
    }
  }

  for (const order of input.orders) {
    if (order.source !== "storefront") {
      continue;
    }

    for (const item of order.items || []) {
      const productId = item.productId || item.productName.toLowerCase();
      const current = rows.get(productId) || {
        productId,
        productName: item.productName,
        checkoutQuantity: 0,
        checkoutValueCents: 0,
        orderQuantity: 0,
        orderValueCents: 0,
        recoveredQuantity: 0,
      };

      current.orderQuantity += item.quantity;
      current.orderValueCents += item.unitPriceCents * item.quantity;
      rows.set(productId, current);
    }
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.checkoutValueCents + b.orderValueCents -
        (a.checkoutValueCents + a.orderValueCents) ||
      a.productName.localeCompare(b.productName),
  );
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { abandonedCheckouts, orders, store } = workspace;
  const storefrontOrders = orders.filter((order) => order.source === "storefront");
  const completedOrderCount = storefrontOrders.length;
  const paidStorefrontOrders = storefrontOrders.filter((order) =>
    isRevenueOrderStatus(order.status),
  );
  const openAbandonedCheckouts = getOpenAbandonedCheckouts(abandonedCheckouts);
  const recoverableAbandonedCheckouts = abandonedCheckouts.filter((checkout) =>
    canQueueAbandonedCheckoutRecovery(checkout),
  );
  const recoveredAbandonedCheckouts =
    getRecoveredAbandonedCheckouts(abandonedCheckouts);
  const checkoutStarts = completedOrderCount + abandonedCheckouts.length;
  const lostCheckoutCount =
    openAbandonedCheckouts.length +
    abandonedCheckouts.filter((checkout) => checkout.status === "dismissed").length;
  const abandonedValueCents = abandonedCheckouts.reduce(
    (sum, checkout) => sum + checkout.subtotalCents,
    0,
  );
  const recoveredValueCents = recoveredAbandonedCheckouts.reduce(
    (sum, checkout) => sum + checkout.subtotalCents,
    0,
  );
  const paidOrderValueCents = paidStorefrontOrders.reduce(
    (sum, order) => sum + Math.max(0, order.totalCents - order.refundedCents),
    0,
  );
  const productFunnel = summarizeProductFunnel({
    abandonedCheckouts,
    orders,
  });
  const rows: FunnelExportRow[] = [
    {
      section: "funnel_summary",
      metric: "checkout_starts",
      label: "Checkout starts",
      value: checkoutStarts,
      count: checkoutStarts,
      status: checkoutStarts > 0 ? "Tracked" : "No signal",
      detail: `${completedOrderCount} completed storefront orders / ${abandonedCheckouts.length} abandoned checkouts`,
    },
    {
      section: "funnel_summary",
      metric: "completed_orders",
      label: "Completed orders",
      value: completedOrderCount,
      count: completedOrderCount,
      rate: formatPercent(completedOrderCount, checkoutStarts),
      status: "Conversion",
      detail: `${paidStorefrontOrders.length} paid or fulfilled storefront orders`,
      href: `/dashboard/stores/${store.id}/orders?source=storefront`,
    },
    {
      section: "funnel_summary",
      metric: "paid_order_value",
      label: "Paid order value",
      value: formatCurrency(paidOrderValueCents, store.currency),
      count: paidStorefrontOrders.length,
      rate: formatPercent(paidStorefrontOrders.length, checkoutStarts),
      status: "Revenue",
    },
    {
      section: "funnel_summary",
      metric: "abandoned_checkouts",
      label: "Abandoned checkouts",
      value: formatCurrency(abandonedValueCents, store.currency),
      count: abandonedCheckouts.length,
      rate: formatPercent(abandonedCheckouts.length, checkoutStarts),
      status: lostCheckoutCount > 0 ? "Recovery opportunity" : "Recovered",
      href: `/dashboard/stores/${store.id}/checkouts`,
    },
    {
      section: "funnel_summary",
      metric: "recoverable_checkouts",
      label: "Recoverable checkouts",
      value: recoverableAbandonedCheckouts.length,
      count: recoverableAbandonedCheckouts.length,
      status:
        recoverableAbandonedCheckouts.length > 0 ? "Action required" : "Clear",
      detail: "Open carts with customer email and recovery eligibility.",
      href: `/dashboard/stores/${store.id}/checkouts?status=open&sort=recovery_priority`,
    },
    {
      section: "funnel_summary",
      metric: "recovered_checkouts",
      label: "Recovered checkouts",
      value: formatCurrency(recoveredValueCents, store.currency),
      count: recoveredAbandonedCheckouts.length,
      rate: formatPercent(recoveredAbandonedCheckouts.length, abandonedCheckouts.length),
      status: "Recovered",
      detail: "Recovered abandoned carts that became orders.",
    },
    ...productFunnel.map((product) => ({
      section: "product_funnel",
      metric: product.productId,
      label: product.productName,
      value: formatCurrency(
        product.checkoutValueCents + product.orderValueCents,
        store.currency,
      ),
      count: product.checkoutQuantity + product.orderQuantity,
      rate: formatPercent(product.orderQuantity, product.checkoutQuantity),
      status:
        product.checkoutQuantity > product.orderQuantity
          ? "Recovery opportunity"
          : "Converting",
      detail: [
        `${product.checkoutQuantity} checkout units`,
        `${product.orderQuantity} ordered units`,
        `${product.recoveredQuantity} recovered units`,
        `${formatCurrency(product.checkoutValueCents, store.currency)} cart value`,
        `${formatCurrency(product.orderValueCents, store.currency)} order value`,
      ].join(" / "),
      href: `/dashboard/stores/${store.id}/products/${product.productId}/edit`,
    })),
  ];

  return csvResponse<FunnelExportRow>({
    filename: `${store.slug}-conversion-funnel.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "count", value: (row) => row.count },
      { header: "rate", value: (row) => row.rate },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
