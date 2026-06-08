import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getInventoryPlanningSignals,
  inventoryReorderUrgencyLabels,
} from "@/features/commerce/inventory-planning";
import {
  getProductStats,
  productStatusLabels,
} from "@/features/commerce/products";
import type { Product, ProductVariant } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type InventoryValuationRow = {
  rowType: string;
  productId?: string;
  productName?: string;
  productStatus?: string;
  productSku?: string;
  category?: string;
  variantId?: string;
  variantName?: string;
  variantStatus?: string;
  variantSku?: string;
  inventoryCount?: number;
  unitRetail?: string;
  retailValue?: string;
  valuationBasis?: string;
  risk?: string;
  detail?: string;
  href?: string;
};

function getVariantName(variant: ProductVariant) {
  return `${variant.optionName}: ${variant.optionValue}`;
}

function getProductValuationCents(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );

  if (activeVariants.length === 0) {
    return product.inventoryCount * product.priceCents;
  }

  return activeVariants.reduce(
    (sum, variant) => sum + variant.inventoryCount * variant.priceCents,
    0,
  );
}

function getProductInventoryCount(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );

  if (activeVariants.length === 0) {
    return product.inventoryCount;
  }

  return activeVariants.reduce((sum, variant) => sum + variant.inventoryCount, 0);
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store, products, orders } = workspace;
  const productStats = getProductStats(products);
  const signalsByProductId = new Map(
    getInventoryPlanningSignals({
      products,
      orders,
      limit: products.length || 1,
    }).map((signal) => [signal.productId, signal]),
  );
  const totalVariantCount = products.reduce(
    (sum, product) => sum + product.variants.length,
    0,
  );
  const totalRetailValueCents = products.reduce(
    (sum, product) => sum + getProductValuationCents(product),
    0,
  );
  const rows: InventoryValuationRow[] = [
    {
      rowType: "summary",
      productName: "Inventory retail value",
      inventoryCount: productStats.sellableInventory,
      retailValue: formatCurrency(totalRetailValueCents, store.currency),
      valuationBasis: "active variant retail price or product retail price",
      detail: `${products.length} products / ${totalVariantCount} variants`,
    },
    {
      rowType: "summary",
      productName: "Action required",
      inventoryCount: productStats.lowStockProducts + productStats.outOfStockProducts,
      retailValue: formatCurrency(
        products
          .filter((product) => {
            const signal = signalsByProductId.get(product.id);

            return (
              signal?.urgency === "out_of_stock" ||
              signal?.urgency === "reorder_now"
            );
          })
          .reduce((sum, product) => sum + getProductValuationCents(product), 0),
        store.currency,
      ),
      risk: "Inventory risk",
      detail: `${productStats.outOfStockProducts} out of stock / ${productStats.lowStockProducts} low stock`,
    },
    ...products
      .slice()
      .sort(
        (a, b) =>
          getProductValuationCents(b) - getProductValuationCents(a) ||
          a.name.localeCompare(b.name),
      )
      .flatMap((product) => {
        const signal = signalsByProductId.get(product.id);
        const productHref = `/dashboard/stores/${store.id}/products/${product.id}/edit`;
        const productRow: InventoryValuationRow = {
          rowType: "product",
          productId: product.id,
          productName: product.name,
          productStatus: productStatusLabels[product.status],
          productSku: product.sku,
          category: product.category,
          inventoryCount: getProductInventoryCount(product),
          unitRetail: formatCurrency(product.priceCents, store.currency),
          retailValue: formatCurrency(
            getProductValuationCents(product),
            store.currency,
          ),
          valuationBasis:
            product.variants.length > 0
              ? "active variant retail prices"
              : "product retail price",
          risk: signal ? inventoryReorderUrgencyLabels[signal.urgency] : "",
          detail: signal?.detail,
          href: productHref,
        };
        const variantRows = product.variants.map((variant) => ({
          rowType: "variant",
          productId: product.id,
          productName: product.name,
          productStatus: productStatusLabels[product.status],
          productSku: product.sku,
          category: product.category,
          variantId: variant.id,
          variantName: getVariantName(variant),
          variantStatus: variant.status === "active" ? "Active" : "Paused",
          variantSku: variant.sku,
          inventoryCount: variant.inventoryCount,
          unitRetail: formatCurrency(variant.priceCents, variant.currency),
          retailValue: formatCurrency(
            variant.inventoryCount * variant.priceCents,
            variant.currency,
          ),
          valuationBasis:
            variant.status === "active"
              ? "active variant retail price"
              : "paused variant excluded from summary",
          risk: signal ? inventoryReorderUrgencyLabels[signal.urgency] : "",
          detail: `${variant.inventoryCount} units at ${formatCurrency(
            variant.priceCents,
            variant.currency,
          )}`,
          href: productHref,
        }));

        return [productRow, ...variantRows];
      }),
  ];

  return csvResponse<InventoryValuationRow>({
    filename: `${store.slug}-inventory-valuation.csv`,
    rows,
    columns: [
      { header: "row_type", value: (row) => row.rowType },
      { header: "product_id", value: (row) => row.productId },
      { header: "product_name", value: (row) => row.productName },
      { header: "product_status", value: (row) => row.productStatus },
      { header: "product_sku", value: (row) => row.productSku },
      { header: "category", value: (row) => row.category },
      { header: "variant_id", value: (row) => row.variantId },
      { header: "variant_name", value: (row) => row.variantName },
      { header: "variant_status", value: (row) => row.variantStatus },
      { header: "variant_sku", value: (row) => row.variantSku },
      { header: "inventory_count", value: (row) => row.inventoryCount },
      { header: "unit_retail", value: (row) => row.unitRetail },
      { header: "retail_value", value: (row) => row.retailValue },
      { header: "valuation_basis", value: (row) => row.valuationBasis },
      { header: "risk", value: (row) => row.risk },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
