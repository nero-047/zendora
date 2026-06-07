import { canQueueAbandonedCheckoutRecovery } from "@/features/commerce/abandoned-checkouts";
import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type {
  AbandonedCheckout,
  Order,
  Product,
} from "@/features/commerce/types";

export type AnalyticsDay = {
  key: string;
  label: string;
  grossSalesCents: number;
  netSalesCents: number;
  refundCents: number;
  orderCount: number;
};

export type ProductPerformance = {
  productId?: string;
  productName: string;
  quantity: number;
  grossSalesCents: number;
  netSalesCents: number;
  orderCount: number;
};

export type CustomerPerformance = {
  customerEmail: string;
  customerName: string;
  orderCount: number;
  netSalesCents: number;
  share: number;
};

export type StoreAnalyticsInsightSeverity = "critical" | "warning" | "info";

export type StoreAnalyticsInsight = {
  id: string;
  severity: StoreAnalyticsInsightSeverity;
  title: string;
  detail: string;
  href?: string;
  actionLabel: string;
};

export type StoreAnalytics = {
  totalOrders: number;
  paidOrders: number;
  pendingOrders: number;
  fulfilledOrders: number;
  cancelledOrders: number;
  manualOrders: number;
  storefrontOrders: number;
  grossSalesCents: number;
  netSalesCents: number;
  refundCents: number;
  pendingRevenueCents: number;
  unfulfilledRevenueCents: number;
  averageOrderValueCents: number;
  averageItemsPerPaidOrder: number;
  paidRate: number;
  fulfillmentRate: number;
  refundRate: number;
  repeatCustomerRate: number;
  returnRequestRate: number;
  openReturnRequests: number;
  abandonedCheckoutCount: number;
  recoverableAbandonedCheckouts: number;
  recoveredAbandonedCheckouts: number;
  abandonedCheckoutValueCents: number;
  recoveredCheckoutValueCents: number;
  checkoutRecoveryRate: number;
  customerConcentrationRate: number;
  sourceMix: Array<{
    source: "storefront" | "manual";
    count: number;
    share: number;
  }>;
  days: AnalyticsDay[];
  topProducts: ProductPerformance[];
  topCustomers: CustomerPerformance[];
  lowStockProducts: Product[];
  insights: StoreAnalyticsInsight[];
};

function getDayKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

function getRevenueDate(order: Order) {
  return new Date(order.paidAt || order.createdAt);
}

function getNetOrderCents(order: Order) {
  return Math.max(0, order.totalCents - order.refundedCents);
}

function getShare(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function formatInsightMoney(cents: number, currency?: string) {
  const amount = (Math.max(0, cents) / 100).toFixed(2);

  return currency ? `${amount} ${currency}` : amount;
}

const analyticsInsightRank: Record<StoreAnalyticsInsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function getOrderAmountDueCents(order: Order) {
  return Math.max(0, order.amountDueCents ?? order.totalCents ?? 0);
}

function getDashboardHref(storeId?: string) {
  return storeId ? `/dashboard/stores/${storeId}` : undefined;
}

function getOrdersHref(storeId: string | undefined, query?: string) {
  if (!storeId) {
    return undefined;
  }

  return query
    ? `/dashboard/stores/${storeId}/orders?${query}`
    : `/dashboard/stores/${storeId}/orders`;
}

function getProductsHref(storeId?: string) {
  return storeId ? `/dashboard/stores/${storeId}/products` : undefined;
}

function sortAnalyticsInsights(insights: StoreAnalyticsInsight[]) {
  return [...insights].sort((a, b) => {
    if (analyticsInsightRank[a.severity] !== analyticsInsightRank[b.severity]) {
      return analyticsInsightRank[a.severity] - analyticsInsightRank[b.severity];
    }

    return a.title.localeCompare(b.title);
  });
}

export function getStoreAnalytics(input: {
  orders: Order[];
  products: Product[];
  abandonedCheckouts?: AbandonedCheckout[];
  storeId?: string;
  currency?: string;
  now?: Date;
  dayCount?: number;
  lowStockThreshold?: number;
}): StoreAnalytics {
  const now = input.now || new Date();
  const dayCount = Math.max(1, input.dayCount || 14);
  const lowStockThreshold = input.lowStockThreshold ?? 5;
  const insightCurrency = input.currency || input.orders[0]?.currency;
  const revenueOrders = input.orders.filter((order) =>
    isRevenueOrderStatus(order.status),
  );
  const grossSalesCents = revenueOrders.reduce(
    (sum, order) => sum + order.totalCents,
    0,
  );
  const refundCents = revenueOrders.reduce(
    (sum, order) => sum + order.refundedCents,
    0,
  );
  const netSalesCents = Math.max(0, grossSalesCents - refundCents);
  const pendingRevenueCents = input.orders
    .filter(
      (order) =>
        order.status === "pending" &&
        (order.paymentStatus === "pending" ||
          order.paymentStatus === "authorized") &&
        getOrderAmountDueCents(order) > 0,
    )
    .reduce((sum, order) => sum + getOrderAmountDueCents(order), 0);
  const unfulfilledRevenueCents = revenueOrders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + getNetOrderCents(order), 0);
  const paidOrders = revenueOrders.length;
  const paidOrderItems = revenueOrders.reduce(
    (sum, order) =>
      sum +
      (order.items || []).reduce(
        (itemSum, item) => itemSum + item.quantity,
        0,
      ),
    0,
  );
  const customerOrderCounts = new Map<string, number>();
  const customerSales = new Map<
    string,
    {
      customerEmail: string;
      customerName: string;
      orderCount: number;
      netSalesCents: number;
    }
  >();

  for (const order of input.orders) {
    const customerKey = order.customerEmail.toLowerCase();
    customerOrderCounts.set(
      customerKey,
      (customerOrderCounts.get(customerKey) || 0) + 1,
    );
  }

  for (const order of revenueOrders) {
    const customerKey = order.customerEmail.toLowerCase();
    const current = customerSales.get(customerKey) || {
      customerEmail: order.customerEmail,
      customerName: order.customerName || order.customerEmail,
      orderCount: 0,
      netSalesCents: 0,
    };

    current.orderCount += 1;
    current.netSalesCents += getNetOrderCents(order);
    customerSales.set(customerKey, current);
  }

  const days = Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (dayCount - 1 - index));

    return {
      key: getDayKey(date),
      label: getDayLabel(date),
      grossSalesCents: 0,
      netSalesCents: 0,
      refundCents: 0,
      orderCount: 0,
    };
  });
  const daysByKey = new Map(days.map((day) => [day.key, day]));

  for (const order of revenueOrders) {
    const key = getDayKey(getRevenueDate(order));
    const day = daysByKey.get(key);

    if (!day) {
      continue;
    }

    day.grossSalesCents += order.totalCents;
    day.netSalesCents += getNetOrderCents(order);
    day.refundCents += order.refundedCents;
    day.orderCount += 1;
  }

  const productPerformance = new Map<string, ProductPerformance>();

  for (const order of revenueOrders) {
    const orderNetRatio =
      order.totalCents > 0 ? getNetOrderCents(order) / order.totalCents : 0;
    const seenProducts = new Set<string>();

    for (const item of order.items || []) {
      const key = item.productId || item.productName.toLowerCase();
      const current = productPerformance.get(key) || {
        productId: item.productId,
        productName: item.productName,
        quantity: 0,
        grossSalesCents: 0,
        netSalesCents: 0,
        orderCount: 0,
      };
      const grossLineCents = item.unitPriceCents * item.quantity;

      current.quantity += item.quantity;
      current.grossSalesCents += grossLineCents;
      current.netSalesCents += Math.round(grossLineCents * orderNetRatio);

      if (!seenProducts.has(key)) {
        current.orderCount += 1;
        seenProducts.add(key);
      }

      productPerformance.set(key, current);
    }
  }

  const manualOrders = input.orders.filter((order) => order.source === "manual")
    .length;
  const storefrontOrders = input.orders.filter(
    (order) => order.source === "storefront",
  ).length;
  const totalCustomers = customerOrderCounts.size;
  const repeatCustomers = [...customerOrderCounts.values()].filter(
    (count) => count > 1,
  ).length;
  const abandonedCheckouts = input.abandonedCheckouts || [];
  const recoverableAbandonedCheckouts = abandonedCheckouts.filter((checkout) =>
    canQueueAbandonedCheckoutRecovery(checkout),
  );
  const recoveredAbandonedCheckouts = abandonedCheckouts.filter(
    (checkout) => checkout.status === "recovered",
  );
  const openReturnRequests = revenueOrders.reduce(
    (sum, order) =>
      sum +
      (order.returnRequests || []).filter(
        (request) =>
          request.status === "requested" || request.status === "approved",
      ).length,
    0,
  );
  const ordersWithReturnRequests = revenueOrders.filter((order) =>
    (order.returnRequests || []).some(
      (request) =>
        request.status === "requested" || request.status === "approved",
    ),
  ).length;
  const topCustomers = [...customerSales.values()]
    .sort((a, b) => {
      if (b.netSalesCents !== a.netSalesCents) {
        return b.netSalesCents - a.netSalesCents;
      }

      return b.orderCount - a.orderCount;
    })
    .slice(0, 5)
    .map((customer) => ({
      ...customer,
      share: getShare(customer.netSalesCents, netSalesCents),
    }));
  const lowStockProducts = input.products
    .filter(
      (product) =>
        product.status !== "archived" &&
        product.inventoryCount <= lowStockThreshold,
    )
    .sort((a, b) => a.inventoryCount - b.inventoryCount)
    .slice(0, 8);
  const returnRequestRate = getShare(ordersWithReturnRequests, paidOrders);
  const checkoutRecoveryRate = getShare(
    recoveredAbandonedCheckouts.length,
    abandonedCheckouts.length,
  );
  const customerConcentrationRate = topCustomers[0]?.share || 0;
  const insights: StoreAnalyticsInsight[] = [];

  if (pendingRevenueCents > 0) {
    insights.push({
      id: "pending-revenue",
      severity: "warning",
      title: "Unpaid revenue waiting",
      detail: `${formatInsightMoney(
        pendingRevenueCents,
        insightCurrency,
      )} is still due across pending or authorized orders.`,
      href: getOrdersHref(input.storeId, "payment=pending"),
      actionLabel: "Review payments",
    });
  }

  if (unfulfilledRevenueCents > 0 && paidOrders > 0) {
    insights.push({
      id: "fulfillment-backlog",
      severity: "warning",
      title: "Paid orders need fulfillment",
      detail: `${formatInsightMoney(
        unfulfilledRevenueCents,
        insightCurrency,
      )} of paid net sales is not fully fulfilled yet.`,
      href: getOrdersHref(input.storeId, "status=paid&fulfillment=unfulfilled"),
      actionLabel: "Open backlog",
    });
  }

  if (refundCents > 0 && (refundCents >= grossSalesCents * 0.2 || openReturnRequests > 0)) {
    insights.push({
      id: "refund-exposure",
      severity: refundCents >= grossSalesCents * 0.4 ? "critical" : "warning",
      title: "Refund exposure needs attention",
      detail: `${getShare(refundCents, grossSalesCents)}% of gross sales has already been refunded.`,
      href: getOrdersHref(input.storeId, "payment=partially_refunded"),
      actionLabel: "Review refunds",
    });
  }

  if (openReturnRequests > 0) {
    insights.push({
      id: "open-return-requests",
      severity: "warning",
      title: "Return requests are open",
      detail: `${openReturnRequests} active return request${
        openReturnRequests === 1 ? "" : "s"
      } need approval, rejection, or refund resolution.`,
      href: getDashboardHref(input.storeId),
      actionLabel: "Open return queue",
    });
  }

  if (recoverableAbandonedCheckouts.length > 0) {
    insights.push({
      id: "abandoned-checkout-recovery",
      severity:
        recoverableAbandonedCheckouts.length >= 3 ? "warning" : "info",
      title: "Recoverable carts are waiting",
      detail: `${recoverableAbandonedCheckouts.length} cart${
        recoverableAbandonedCheckouts.length === 1 ? "" : "s"
      } worth ${formatInsightMoney(
        recoverableAbandonedCheckouts.reduce(
          (sum, checkout) => sum + checkout.subtotalCents,
          0,
        ),
        insightCurrency,
      )} can still be followed up.`,
      href: getDashboardHref(input.storeId),
      actionLabel: "Review carts",
    });
  }

  if (customerConcentrationRate >= 50 && paidOrders >= 2) {
    const topCustomer = topCustomers[0];

    if (topCustomer) {
      insights.push({
        id: "customer-concentration",
        severity: customerConcentrationRate >= 70 ? "warning" : "info",
        title: "Sales are concentrated",
        detail: `${topCustomer.customerName} represents ${customerConcentrationRate}% of net sales.`,
        href: input.storeId
          ? `/dashboard/stores/${input.storeId}/customers/${encodeURIComponent(
              topCustomer.customerEmail,
            )}`
          : undefined,
        actionLabel: "Review customer",
      });
    }
  }

  if (lowStockProducts.length > 0) {
    insights.push({
      id: "low-stock-products",
      severity: "warning",
      title: "Inventory is constraining sales",
      detail: `${lowStockProducts.length} active product${
        lowStockProducts.length === 1 ? "" : "s"
      } are at or below the low-stock threshold.`,
      href: getProductsHref(input.storeId),
      actionLabel: "Plan inventory",
    });
  }

  return {
    totalOrders: input.orders.length,
    paidOrders,
    pendingOrders: input.orders.filter((order) => order.status === "pending")
      .length,
    fulfilledOrders: input.orders.filter(
      (order) => order.status === "fulfilled",
    ).length,
    cancelledOrders: input.orders.filter((order) => order.status === "cancelled")
      .length,
    manualOrders,
    storefrontOrders,
    grossSalesCents,
    netSalesCents,
    refundCents,
    pendingRevenueCents,
    unfulfilledRevenueCents,
    averageOrderValueCents:
      paidOrders > 0 ? Math.round(netSalesCents / paidOrders) : 0,
    averageItemsPerPaidOrder:
      paidOrders > 0 ? Math.round((paidOrderItems / paidOrders) * 10) / 10 : 0,
    paidRate: getShare(paidOrders, input.orders.length),
    fulfillmentRate: getShare(
      input.orders.filter((order) => order.status === "fulfilled").length,
      paidOrders,
    ),
    refundRate: getShare(refundCents, grossSalesCents),
    repeatCustomerRate: getShare(repeatCustomers, totalCustomers),
    returnRequestRate,
    openReturnRequests,
    abandonedCheckoutCount: abandonedCheckouts.length,
    recoverableAbandonedCheckouts: recoverableAbandonedCheckouts.length,
    recoveredAbandonedCheckouts: recoveredAbandonedCheckouts.length,
    abandonedCheckoutValueCents: recoverableAbandonedCheckouts.reduce(
      (sum, checkout) => sum + checkout.subtotalCents,
      0,
    ),
    recoveredCheckoutValueCents: recoveredAbandonedCheckouts.reduce(
      (sum, checkout) => sum + checkout.subtotalCents,
      0,
    ),
    checkoutRecoveryRate,
    customerConcentrationRate,
    sourceMix: [
      {
        source: "storefront",
        count: storefrontOrders,
        share: getShare(storefrontOrders, input.orders.length),
      },
      {
        source: "manual",
        count: manualOrders,
        share: getShare(manualOrders, input.orders.length),
      },
    ],
    days,
    topProducts: [...productPerformance.values()]
      .sort((a, b) => {
        if (b.netSalesCents !== a.netSalesCents) {
          return b.netSalesCents - a.netSalesCents;
        }

        return b.quantity - a.quantity;
      })
      .slice(0, 8),
    topCustomers,
    lowStockProducts,
    insights: sortAnalyticsInsights(insights),
  };
}
