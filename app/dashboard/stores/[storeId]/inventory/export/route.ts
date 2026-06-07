import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  filterInventoryPlanningSignals,
  getInventoryPlanningSignals,
  parseInventoryPlanningSortOption,
  parseInventoryPlanningUrgencyFilter,
  readInventorySearchParam,
  type InventoryPlanningSignal,
} from "@/features/commerce/inventory-planning";
import type { Product } from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type InventoryExportRow = {
  product?: Product;
  signal: InventoryPlanningSignal;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function getRunwayDays(signal: InventoryPlanningSignal) {
  if (signal.urgency === "out_of_stock") {
    return 0;
  }

  return signal.estimatedDaysUntilStockout ?? "";
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const productsById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const signals = getInventoryPlanningSignals({
    products: workspace.products,
    orders: workspace.orders,
    limit: workspace.products.length || 1,
  });
  const rows = filterInventoryPlanningSignals({
    signals,
    query: readInventorySearchParam(readParam(searchParams, "q")),
    urgency: parseInventoryPlanningUrgencyFilter(
      readParam(searchParams, "inventory"),
    ),
    sort: parseInventoryPlanningSortOption(readParam(searchParams, "sort")),
    productsById,
  }).map((signal) => ({
    product: productsById.get(signal.productId),
    signal,
  }));

  return csvResponse<InventoryExportRow>({
    filename: `${workspace.store.slug}-inventory.csv`,
    rows,
    columns: [
      { header: "product_id", value: (row) => row.signal.productId },
      { header: "name", value: (row) => row.signal.productName },
      { header: "sku", value: (row) => row.product?.sku },
      { header: "category", value: (row) => row.product?.category },
      { header: "priority", value: (row) => row.signal.label },
      {
        header: "sellable_inventory",
        value: (row) => row.signal.sellableInventoryCount,
      },
      { header: "runway_days", value: (row) => getRunwayDays(row.signal) },
      {
        header: "sales_velocity_per_day",
        value: (row) => row.signal.salesVelocityPerDay,
      },
      { header: "sold_quantity", value: (row) => row.signal.soldQuantity },
      {
        header: "recommended_reorder_quantity",
        value: (row) => row.signal.reorderQuantity,
      },
      { header: "detail", value: (row) => row.signal.detail },
    ],
  });
}
