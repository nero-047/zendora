import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getInventoryPlanningSignals } from "@/features/commerce/inventory-planning";
import { getProductHealth } from "@/features/commerce/product-health";
import {
  filterProducts,
  parseProductHealthFilter,
  parseProductInventoryUrgencyFilter,
  parseProductSortOption,
  parseProductStatusFilter,
  productStatusLabels,
  readProductSearchParam,
} from "@/features/commerce/products";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const inventorySignals = getInventoryPlanningSignals({
    products: workspace.products,
    orders: workspace.orders,
    limit: workspace.products.length || 1,
  });
  const inventorySignalsByProduct = new Map(
    inventorySignals.map((signal) => [signal.productId, signal]),
  );
  const rows = filterProducts({
    products: workspace.products,
    query: readProductSearchParam(readParam(searchParams, "q")),
    status: parseProductStatusFilter(readParam(searchParams, "status")),
    category: readProductSearchParam(readParam(searchParams, "category")),
    health: parseProductHealthFilter(readParam(searchParams, "health")),
    inventory: parseProductInventoryUrgencyFilter(
      readParam(searchParams, "inventory"),
    ),
    sort: parseProductSortOption(readParam(searchParams, "sort")),
    inventorySignalsByProduct,
  });

  return csvResponse<Product>({
    filename: `${workspace.store.slug}-products.csv`,
    rows,
    columns: [
      { header: "product_id", value: (product) => product.id },
      { header: "name", value: (product) => product.name },
      { header: "slug", value: (product) => product.slug },
      {
        header: "status",
        value: (product) => productStatusLabels[product.status],
      },
      { header: "category", value: (product) => product.category },
      { header: "sku", value: (product) => product.sku },
      {
        header: "health",
        value: (product) => getProductHealth(product).label,
      },
      {
        header: "sellable_inventory",
        value: (product) => getProductHealth(product).sellableInventoryCount,
      },
      {
        header: "inventory_plan",
        value: (product) =>
          inventorySignalsByProduct.get(product.id)?.label || "No plan",
      },
      {
        header: "price",
        value: (product) => formatCurrency(product.priceCents, product.currency),
      },
      {
        header: "variants",
        value: (product) => product.variants.length,
      },
      {
        header: "created_at",
        value: (product) => new Date(product.createdAt).toISOString(),
      },
    ],
  });
}
