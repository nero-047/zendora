import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type { Order, Product } from "@/features/commerce/types";

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
  averageOrderValueCents: number;
  averageItemsPerPaidOrder: number;
  paidRate: number;
  fulfillmentRate: number;
  refundRate: number;
  repeatCustomerRate: number;
  sourceMix: Array<{
    source: "storefront" | "manual";
    count: number;
    share: number;
  }>;
  days: AnalyticsDay[];
  topProducts: ProductPerformance[];
  lowStockProducts: Product[];
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

export function getStoreAnalytics(input: {
  orders: Order[];
  products: Product[];
  now?: Date;
  dayCount?: number;
  lowStockThreshold?: number;
}): StoreAnalytics {
  const now = input.now || new Date();
  const dayCount = Math.max(1, input.dayCount || 14);
  const lowStockThreshold = input.lowStockThreshold ?? 5;
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

  for (const order of input.orders) {
    const customerKey = order.customerEmail.toLowerCase();
    customerOrderCounts.set(
      customerKey,
      (customerOrderCounts.get(customerKey) || 0) + 1,
    );
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
    lowStockProducts: input.products
      .filter(
        (product) =>
          product.status !== "archived" &&
          product.inventoryCount <= lowStockThreshold,
      )
      .sort((a, b) => a.inventoryCount - b.inventoryCount)
      .slice(0, 8),
  };
}
