import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getInventoryPlanningSignals } from "@/features/commerce/inventory-planning";
import { getProductHealth } from "@/features/commerce/product-health";
import {
  filterProducts,
  getProductEditHref,
  parseProductHealthFilter,
  parseProductInventoryUrgencyFilter,
  parseProductSortOption,
  parseProductStatusFilter,
  productStatusLabels,
  readProductSearchParam,
} from "@/features/commerce/products";
import type {
  Product,
  ProductVariant,
  ProductVariantStatus,
} from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ProductVariantExportRow = {
  product: Product;
  variant: ProductVariant | null;
};

const variantStatusLabels: Record<ProductVariantStatus, string> = {
  active: "Active",
  paused: "Paused",
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function getVariantRows(product: Product): ProductVariantExportRow[] {
  if (product.variants.length === 0) {
    return [{ product, variant: null }];
  }

  return product.variants
    .slice()
    .sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.optionName.localeCompare(second.optionName) ||
        first.optionValue.localeCompare(second.optionValue),
    )
    .map((variant) => ({ product, variant }));
}

function getRowPrice(row: ProductVariantExportRow) {
  return row.variant?.priceCents ?? row.product.priceCents;
}

function getRowCurrency(row: ProductVariantExportRow) {
  return row.variant?.currency ?? row.product.currency;
}

function getRowInventory(row: ProductVariantExportRow) {
  return row.variant?.inventoryCount ?? row.product.inventoryCount;
}

function getRowCreatedAt(row: ProductVariantExportRow) {
  return row.variant?.createdAt ?? row.product.createdAt;
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
  const products = filterProducts({
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
  const rows = products.flatMap(getVariantRows);

  return csvResponse<ProductVariantExportRow>({
    filename: `${workspace.store.slug}-product-variants.csv`,
    rows,
    columns: [
      { header: "product_id", value: (row) => row.product.id },
      { header: "product_name", value: (row) => row.product.name },
      {
        header: "product_status",
        value: (row) => productStatusLabels[row.product.status],
      },
      {
        header: "product_health",
        value: (row) => getProductHealth(row.product).label,
      },
      {
        header: "product_category",
        value: (row) => row.product.category || "Uncategorized",
      },
      { header: "product_sku", value: (row) => row.product.sku || "" },
      { header: "variant_id", value: (row) => row.variant?.id || "" },
      { header: "option_name", value: (row) => row.variant?.optionName || "" },
      { header: "option_value", value: (row) => row.variant?.optionValue || "" },
      {
        header: "variant_status",
        value: (row) =>
          row.variant ? variantStatusLabels[row.variant.status] : "No variants",
      },
      { header: "variant_sku", value: (row) => row.variant?.sku || "" },
      {
        header: "price",
        value: (row) => formatCurrency(getRowPrice(row), getRowCurrency(row)),
      },
      { header: "inventory", value: getRowInventory },
      {
        header: "sellable_inventory",
        value: (row) => getProductHealth(row.product).sellableInventoryCount,
      },
      {
        header: "active_variant_count",
        value: (row) => getProductHealth(row.product).activeVariantCount,
      },
      {
        header: "product_variant_count",
        value: (row) => row.product.variants.length,
      },
      {
        header: "inventory_plan",
        value: (row) =>
          inventorySignalsByProduct.get(row.product.id)?.label || "No plan",
      },
      {
        header: "inventory_plan_detail",
        value: (row) => inventorySignalsByProduct.get(row.product.id)?.detail || "",
      },
      {
        header: "created_at",
        value: (row) => new Date(getRowCreatedAt(row)).toISOString(),
      },
      {
        header: "product_admin_href",
        value: (row) => getProductEditHref(workspace.store.id, row.product.id),
      },
      {
        header: "storefront_href",
        value: (row) =>
          `/stores/${workspace.store.slug}/products/${row.product.slug}`,
      },
    ],
  });
}
