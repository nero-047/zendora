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
import {
  defaultProductLowStockThreshold,
  getProductHealth,
} from "@/features/commerce/product-health";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type PurchaseOrderRow = {
  product: Product;
  quantity: number;
  signal: InventoryPlanningSignal;
  storeId: string;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

function normalizePoToken(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function getVariantSkus(product: Product) {
  return product.variants
    .map((variant) => variant.sku)
    .filter(Boolean)
    .join(" / ");
}

function getSuggestedPoQuantity(product: Product, signal: InventoryPlanningSignal) {
  if (signal.reorderQuantity > 0) {
    return signal.reorderQuantity;
  }

  const health = getProductHealth(product);
  const isOutOfStock = health.issues.some((issue) => issue.id === "out_of_stock");
  const isLowStock = health.issues.some((issue) => issue.id === "low_stock");

  if (isOutOfStock) {
    return defaultProductLowStockThreshold;
  }

  if (isLowStock) {
    return Math.max(
      1,
      defaultProductLowStockThreshold - health.sellableInventoryCount,
    );
  }

  return 0;
}

function getProcurementPriority(product: Product, signal: InventoryPlanningSignal) {
  const health = getProductHealth(product);

  if (health.issues.some((issue) => issue.id === "out_of_stock")) {
    return "out_of_stock";
  }

  if (signal.urgency === "reorder_now") {
    return "reorder_now";
  }

  if (health.issues.some((issue) => issue.id === "low_stock")) {
    return "low_stock";
  }

  if (signal.urgency === "watch") {
    return "watch";
  }

  return signal.urgency;
}

function getReceivingNote(product: Product, signal: InventoryPlanningSignal) {
  const priority = getProcurementPriority(product, signal);

  if (priority === "out_of_stock") {
    return `Receive urgently; ${product.name} is not purchasable until replenished.`;
  }

  if (priority === "low_stock") {
    return `Restock sellable inventory to at least ${defaultProductLowStockThreshold} units.`;
  }

  if (priority === "reorder_now") {
    return signal.detail;
  }

  return "Review demand and confirm supplier availability before ordering.";
}

function getUnitCostEstimateCents(product: Product) {
  return Math.max(1, Math.round(product.priceCents * 0.6));
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
  const selectedUrgency = parseInventoryPlanningUrgencyFilter(
    readParam(searchParams, "inventory"),
  );
  const selectedSort = readParam(searchParams, "sort")
    ? parseInventoryPlanningSortOption(readParam(searchParams, "sort"))
    : "reorder_desc";
  const signals = getInventoryPlanningSignals({
    products: workspace.products,
    orders: workspace.orders,
    limit: workspace.products.length || 1,
  });
  const rows = filterInventoryPlanningSignals({
    signals,
    query: readInventorySearchParam(readParam(searchParams, "q")),
    urgency: selectedUrgency,
    sort: selectedSort,
    productsById,
  })
    .map((signal) => {
      const product = productsById.get(signal.productId);

      if (!product) {
        return null;
      }

      return {
        product,
        quantity: getSuggestedPoQuantity(product, signal),
        signal,
        storeId: workspace.store.id,
      };
    })
    .filter((row): row is PurchaseOrderRow => Boolean(row && row.quantity > 0));
  const now = new Date();

  return csvResponse<PurchaseOrderRow>({
    filename: `${workspace.store.slug}-purchase-order.csv`,
    rows,
    columns: [
      {
        header: "po_number",
        value: (row) =>
          `PO-${normalizePoToken(workspace.store.slug)}-${normalizePoToken(
            row.product.sku || row.product.id,
          )}`,
      },
      {
        header: "supplier_name",
        value: (row) =>
          row.product.category
            ? `${row.product.category} supplier`
            : "Default supplier",
      },
      { header: "product_id", value: (row) => row.product.id },
      { header: "product_name", value: (row) => row.product.name },
      { header: "sku", value: (row) => row.product.sku },
      { header: "variant_skus", value: (row) => getVariantSkus(row.product) },
      {
        header: "procurement_priority",
        value: (row) => getProcurementPriority(row.product, row.signal),
      },
      { header: "order_quantity", value: (row) => row.quantity },
      {
        header: "current_sellable_inventory",
        value: (row) => row.signal.sellableInventoryCount,
      },
      {
        header: "runway_days",
        value: (row) =>
          row.signal.urgency === "out_of_stock"
            ? 0
            : row.signal.estimatedDaysUntilStockout || "",
      },
      {
        header: "sales_velocity_per_day",
        value: (row) => row.signal.salesVelocityPerDay,
      },
      {
        header: "unit_cost_estimate",
        value: (row) =>
          formatCurrency(getUnitCostEstimateCents(row.product), row.product.currency),
      },
      {
        header: "estimated_line_cost",
        value: (row) =>
          formatCurrency(
            getUnitCostEstimateCents(row.product) * row.quantity,
            row.product.currency,
          ),
      },
      { header: "requested_ship_by", value: () => addDays(now, 7) },
      { header: "target_receive_by", value: () => addDays(now, 21) },
      {
        header: "receiving_note",
        value: (row) => getReceivingNote(row.product, row.signal),
      },
      {
        header: "product_href",
        value: (row) =>
          `/dashboard/stores/${row.storeId}/products/${row.product.id}/edit`,
      },
    ],
  });
}
