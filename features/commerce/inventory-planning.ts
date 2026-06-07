import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import { getProductHealth } from "@/features/commerce/product-health";
import type { Order, Product } from "@/features/commerce/types";

export type InventoryReorderUrgency =
  | "out_of_stock"
  | "reorder_now"
  | "watch"
  | "healthy"
  | "not_tracked";

export type InventoryPlanningSignal = {
  productId: string;
  productName: string;
  urgency: InventoryReorderUrgency;
  label: string;
  soldQuantity: number;
  salesVelocityPerDay: number;
  sellableInventoryCount: number;
  estimatedDaysUntilStockout?: number;
  reorderQuantity: number;
  detail: string;
};

export const inventoryReorderUrgencyLabels: Record<
  InventoryReorderUrgency,
  string
> = {
  out_of_stock: "Out of stock",
  reorder_now: "Reorder now",
  watch: "Watch stock",
  healthy: "Healthy",
  not_tracked: "No recent sales",
};

export const inventoryPlanningUrgencyFilters = [
  "all",
  "action_required",
  "out_of_stock",
  "reorder_now",
  "watch",
  "healthy",
  "not_tracked",
] as const;

export type InventoryPlanningUrgencyFilter =
  (typeof inventoryPlanningUrgencyFilters)[number];

export const inventoryPlanningUrgencyFilterLabels: Record<
  InventoryPlanningUrgencyFilter,
  string
> = {
  all: "All inventory",
  action_required: "Action required",
  out_of_stock: inventoryReorderUrgencyLabels.out_of_stock,
  reorder_now: inventoryReorderUrgencyLabels.reorder_now,
  watch: inventoryReorderUrgencyLabels.watch,
  healthy: inventoryReorderUrgencyLabels.healthy,
  not_tracked: inventoryReorderUrgencyLabels.not_tracked,
};

export const inventoryPlanningSortOptions = [
  "urgency",
  "runway_asc",
  "velocity_desc",
  "stock_asc",
  "reorder_desc",
  "name_asc",
] as const;

export type InventoryPlanningSortOption =
  (typeof inventoryPlanningSortOptions)[number];

export const inventoryPlanningSortLabels: Record<
  InventoryPlanningSortOption,
  string
> = {
  urgency: "Urgency",
  runway_asc: "Shortest runway",
  velocity_desc: "Fastest sellers",
  stock_asc: "Lowest stock",
  reorder_desc: "Largest reorder",
  name_asc: "Name A-Z",
};

const urgencyRank: Record<InventoryReorderUrgency, number> = {
  out_of_stock: 0,
  reorder_now: 1,
  watch: 2,
  healthy: 3,
  not_tracked: 4,
};

function getDayWindow(input: { now: Date; days: number }) {
  const end = new Date(input.now);
  const start = new Date(input.now);

  start.setUTCDate(start.getUTCDate() - Math.max(1, input.days));

  return { start, end };
}

function isWithinWindow(value: string | undefined, start: Date, end: Date) {
  if (!value) {
    return false;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
}

function roundVelocity(value: number) {
  return Math.round(value * 10) / 10;
}

function getUrgency(input: {
  sellableInventoryCount: number;
  soldQuantity: number;
  estimatedDaysUntilStockout?: number;
  reorderPointDays: number;
  watchPointDays: number;
}): InventoryReorderUrgency {
  if (input.sellableInventoryCount <= 0) {
    return "out_of_stock";
  }

  if (input.soldQuantity <= 0 || !input.estimatedDaysUntilStockout) {
    return "not_tracked";
  }

  if (input.estimatedDaysUntilStockout <= input.reorderPointDays) {
    return "reorder_now";
  }

  if (input.estimatedDaysUntilStockout <= input.watchPointDays) {
    return "watch";
  }

  return "healthy";
}

function getDetail(input: {
  urgency: InventoryReorderUrgency;
  productName: string;
  sellableInventoryCount: number;
  estimatedDaysUntilStockout?: number;
  reorderQuantity: number;
}) {
  if (input.urgency === "out_of_stock") {
    return `${input.productName} has no sellable inventory available.`;
  }

  if (input.urgency === "not_tracked") {
    return "No recent paid sales were found in the planning window.";
  }

  const days =
    typeof input.estimatedDaysUntilStockout === "number"
      ? `${input.estimatedDaysUntilStockout} day${
          input.estimatedDaysUntilStockout === 1 ? "" : "s"
        }`
      : "unknown";

  if (input.urgency === "reorder_now") {
    return `Estimated stockout in ${days}; reorder about ${input.reorderQuantity} units.`;
  }

  if (input.urgency === "watch") {
    return `Estimated stockout in ${days}; watch replenishment timing.`;
  }

  return `${input.sellableInventoryCount} sellable units cover about ${days}.`;
}

export function readInventorySearchParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export function parseInventoryPlanningUrgencyFilter(
  value: string | string[] | undefined,
) {
  const urgency = Array.isArray(value) ? value[0] : value;

  if (
    inventoryPlanningUrgencyFilters.includes(
      urgency as InventoryPlanningUrgencyFilter,
    )
  ) {
    return urgency as InventoryPlanningUrgencyFilter;
  }

  return "all";
}

export function parseInventoryPlanningSortOption(
  value: string | string[] | undefined,
) {
  const sort = Array.isArray(value) ? value[0] : value;

  if (inventoryPlanningSortOptions.includes(sort as InventoryPlanningSortOption)) {
    return sort as InventoryPlanningSortOption;
  }

  return "urgency";
}

export function getInventoryPlanningStats(signals: InventoryPlanningSignal[]) {
  const outOfStock = signals.filter(
    (signal) => signal.urgency === "out_of_stock",
  ).length;
  const reorderNow = signals.filter(
    (signal) => signal.urgency === "reorder_now",
  ).length;
  const watchStock = signals.filter((signal) => signal.urgency === "watch")
    .length;
  const healthy = signals.filter((signal) => signal.urgency === "healthy")
    .length;
  const notTracked = signals.filter((signal) => signal.urgency === "not_tracked")
    .length;

  return {
    totalProducts: signals.length,
    actionRequired: outOfStock + reorderNow,
    outOfStock,
    reorderNow,
    watchStock,
    healthy,
    notTracked,
    totalReorderQuantity: signals.reduce(
      (sum, signal) => sum + signal.reorderQuantity,
      0,
    ),
  };
}

function urgencyMatchesFilter(
  urgency: InventoryReorderUrgency,
  filter: InventoryPlanningUrgencyFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "action_required") {
    return urgency === "out_of_stock" || urgency === "reorder_now";
  }

  return urgency === filter;
}

function getSignalSearchText(
  signal: InventoryPlanningSignal,
  product: Product | undefined,
) {
  return [
    signal.productName,
    signal.label,
    signal.urgency,
    signal.detail,
    product?.slug,
    product?.sku,
    product?.category,
    product?.description,
    ...(product?.variants || []).flatMap((variant) => [
      variant.optionName,
      variant.optionValue,
      variant.sku,
      variant.status,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getRunwaySortValue(signal: InventoryPlanningSignal) {
  if (signal.urgency === "out_of_stock") {
    return 0;
  }

  return signal.estimatedDaysUntilStockout ?? Number.POSITIVE_INFINITY;
}

export function filterInventoryPlanningSignals(input: {
  signals: InventoryPlanningSignal[];
  query: string;
  urgency: InventoryPlanningUrgencyFilter;
  sort?: InventoryPlanningSortOption;
  productsById?: Map<string, Product> | ReadonlyMap<string, Product>;
}) {
  const normalizedQuery = input.query.trim().toLowerCase();
  const selectedSort = input.sort || "urgency";

  return input.signals
    .filter((signal) => {
      const urgencyMatches = urgencyMatchesFilter(signal.urgency, input.urgency);
      const queryMatches =
        !normalizedQuery ||
        getSignalSearchText(
          signal,
          input.productsById?.get(signal.productId),
        ).includes(normalizedQuery);

      return urgencyMatches && queryMatches;
    })
    .sort((a, b) => {
      if (selectedSort === "name_asc") {
        return a.productName.localeCompare(b.productName);
      }

      if (selectedSort === "velocity_desc") {
        return (
          b.salesVelocityPerDay - a.salesVelocityPerDay ||
          urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
          a.productName.localeCompare(b.productName)
        );
      }

      if (selectedSort === "stock_asc") {
        return (
          a.sellableInventoryCount - b.sellableInventoryCount ||
          urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
          a.productName.localeCompare(b.productName)
        );
      }

      if (selectedSort === "reorder_desc") {
        return (
          b.reorderQuantity - a.reorderQuantity ||
          urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
          a.productName.localeCompare(b.productName)
        );
      }

      if (selectedSort === "runway_asc") {
        return (
          getRunwaySortValue(a) - getRunwaySortValue(b) ||
          urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
          a.productName.localeCompare(b.productName)
        );
      }

      return (
        urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
        getRunwaySortValue(a) - getRunwaySortValue(b) ||
        b.soldQuantity - a.soldQuantity ||
        a.productName.localeCompare(b.productName)
      );
    });
}

export function getInventoryPlanningSignals(input: {
  products: Product[];
  orders: Order[];
  now?: Date;
  salesWindowDays?: number;
  reorderPointDays?: number;
  watchPointDays?: number;
  coverDays?: number;
  limit?: number;
}): InventoryPlanningSignal[] {
  const now = input.now || new Date();
  const salesWindowDays = Math.max(1, input.salesWindowDays || 30);
  const reorderPointDays = Math.max(1, input.reorderPointDays || 14);
  const watchPointDays = Math.max(reorderPointDays, input.watchPointDays || 30);
  const coverDays = Math.max(watchPointDays, input.coverDays || 45);
  const limit = Math.max(1, input.limit || input.products.length || 1);
  const { start, end } = getDayWindow({
    now,
    days: salesWindowDays,
  });
  const quantitiesByProduct = new Map<string, number>();

  for (const order of input.orders) {
    if (!isRevenueOrderStatus(order.status)) {
      continue;
    }

    if (!isWithinWindow(order.paidAt || order.createdAt, start, end)) {
      continue;
    }

    for (const item of order.items || []) {
      if (!item.productId) {
        continue;
      }

      quantitiesByProduct.set(
        item.productId,
        (quantitiesByProduct.get(item.productId) || 0) +
          Math.max(0, item.quantity),
      );
    }
  }

  return input.products
    .map((product) => {
      const health = getProductHealth(product);
      const soldQuantity = quantitiesByProduct.get(product.id) || 0;
      const salesVelocityPerDay = roundVelocity(soldQuantity / salesWindowDays);
      const estimatedDaysUntilStockout =
        salesVelocityPerDay > 0
          ? Math.max(
              0,
              Math.floor(health.sellableInventoryCount / salesVelocityPerDay),
            )
          : undefined;
      const urgency = getUrgency({
        sellableInventoryCount: health.sellableInventoryCount,
        soldQuantity,
        estimatedDaysUntilStockout,
        reorderPointDays,
        watchPointDays,
      });
      const reorderQuantity =
        salesVelocityPerDay > 0
          ? Math.max(
              0,
              Math.ceil(salesVelocityPerDay * coverDays) -
                health.sellableInventoryCount,
            )
          : 0;

      return {
        productId: product.id,
        productName: product.name,
        urgency,
        label: inventoryReorderUrgencyLabels[urgency],
        soldQuantity,
        salesVelocityPerDay,
        sellableInventoryCount: health.sellableInventoryCount,
        estimatedDaysUntilStockout,
        reorderQuantity,
        detail: getDetail({
          urgency,
          productName: product.name,
          sellableInventoryCount: health.sellableInventoryCount,
          estimatedDaysUntilStockout,
          reorderQuantity,
        }),
      };
    })
    .sort((a, b) => {
      if (urgencyRank[a.urgency] !== urgencyRank[b.urgency]) {
        return urgencyRank[a.urgency] - urgencyRank[b.urgency];
      }

      if (
        typeof a.estimatedDaysUntilStockout === "number" &&
        typeof b.estimatedDaysUntilStockout === "number" &&
        a.estimatedDaysUntilStockout !== b.estimatedDaysUntilStockout
      ) {
        return a.estimatedDaysUntilStockout - b.estimatedDaysUntilStockout;
      }

      return b.soldQuantity - a.soldQuantity;
    })
    .slice(0, limit);
}
