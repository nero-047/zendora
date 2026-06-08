import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import type {
  Order,
  ShippingZone,
  ShippingZoneStatus,
} from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ShippingRateMatrixRow = {
  rowType: "store_default" | "shipping_zone";
  zone: ShippingZone | null;
  country: string;
  checkoutPriority: number;
  orderCount: number;
  revenueCents: number;
  latestOrderAt?: string;
};

const shippingZoneStatusLabels: Record<ShippingZoneStatus, string> = {
  active: "Active",
  paused: "Paused",
};

function normalizeCountry(value: string | undefined) {
  return value?.trim().toLowerCase() || "";
}

function getZoneCountries(zone: ShippingZone) {
  return zone.countries.length > 0 ? zone.countries : ["*"];
}

function getOrdersForCountry(orders: Order[], country: string) {
  const normalizedCountry = normalizeCountry(country);

  if (!normalizedCountry || normalizedCountry === "*") {
    return [];
  }

  return orders.filter(
    (order) => normalizeCountry(order.shippingAddress?.country) === normalizedCountry,
  );
}

function getLatestOrderAt(orders: Order[]) {
  return orders
    .map((order) => order.createdAt)
    .sort((first, second) => new Date(second).getTime() - new Date(first).getTime())[0];
}

function getCoverageStatus(row: ShippingRateMatrixRow) {
  if (row.rowType === "store_default") {
    return "Fallback";
  }

  if (row.zone?.status !== "active") {
    return "Paused";
  }

  return row.orderCount > 0 ? "Receiving orders" : "Configured";
}

function getRecommendedAction(row: ShippingRateMatrixRow) {
  if (row.rowType === "store_default") {
    return "Use only when no specific active zone matches the checkout country.";
  }

  if (row.zone?.status !== "active") {
    return "Review before relying on this rate at checkout.";
  }

  if (row.orderCount === 0) {
    return "Monitor traffic before tuning the rate.";
  }

  return "Review margin and delivery performance for this destination.";
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const rows: ShippingRateMatrixRow[] = [
    {
      rowType: "store_default",
      zone: null,
      country: "*",
      checkoutPriority: 999,
      orderCount: workspace.orders.length,
      revenueCents: workspace.orders.reduce(
        (sum, order) => sum + order.totalCents,
        0,
      ),
      latestOrderAt: getLatestOrderAt(workspace.orders),
    },
    ...workspace.shippingZones
      .slice()
      .sort((first, second) => {
        const statusRank =
          Number(first.status !== "active") - Number(second.status !== "active");

        return statusRank || first.name.localeCompare(second.name);
      })
      .flatMap((zone, zoneIndex) =>
        getZoneCountries(zone).map((country) => {
          const orders = getOrdersForCountry(workspace.orders, country);

          return {
            rowType: "shipping_zone" as const,
            zone,
            country,
            checkoutPriority: zone.status === "active" ? zoneIndex + 1 : 900 + zoneIndex,
            orderCount: orders.length,
            revenueCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
            latestOrderAt: getLatestOrderAt(orders),
          };
        }),
      ),
  ];

  return csvResponse<ShippingRateMatrixRow>({
    filename: `${store.slug}-shipping-rate-matrix.csv`,
    rows,
    columns: [
      { header: "row_type", value: (row) => row.rowType },
      { header: "zone_id", value: (row) => row.zone?.id || "store_default" },
      { header: "zone_name", value: (row) => row.zone?.name || "Store default" },
      {
        header: "status",
        value: (row) =>
          row.zone ? shippingZoneStatusLabels[row.zone.status] : "Fallback",
      },
      { header: "country", value: (row) => row.country },
      { header: "checkout_priority", value: (row) => row.checkoutPriority },
      {
        header: "rate",
        value: (row) =>
          formatCurrency(row.zone?.rateCents ?? store.shippingRateCents, store.currency),
      },
      {
        header: "rate_cents",
        value: (row) => row.zone?.rateCents ?? store.shippingRateCents,
      },
      {
        header: "free_shipping_threshold",
        value: (row) =>
          formatCurrency(
            row.zone?.freeShippingThresholdCents ??
              store.freeShippingThresholdCents,
            store.currency,
          ),
      },
      {
        header: "free_shipping_threshold_cents",
        value: (row) =>
          row.zone?.freeShippingThresholdCents ??
          store.freeShippingThresholdCents,
      },
      { header: "coverage_status", value: (row) => getCoverageStatus(row) },
      { header: "order_count", value: (row) => row.orderCount },
      {
        header: "order_revenue",
        value: (row) => formatCurrency(row.revenueCents, store.currency),
      },
      {
        header: "latest_order_at",
        value: (row) =>
          row.latestOrderAt ? new Date(row.latestOrderAt).toISOString() : "",
      },
      { header: "recommended_action", value: (row) => getRecommendedAction(row) },
      {
        header: "created_at",
        value: (row) =>
          row.zone ? new Date(row.zone.createdAt).toISOString() : "",
      },
    ],
  });
}
