import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import { productStatusLabels } from "@/features/commerce/products";
import type { Product, ProductVariant } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ProductSalesMetric = {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  sku?: string;
  unitsSold: number;
  orderIds: Set<string>;
  grossSalesCents: number;
  refundAllocatedCents: number;
  netSalesCents: number;
};

type ProductSalesRow = {
  rowType: string;
  productId: string;
  productName: string;
  productStatus?: string;
  category?: string;
  sku?: string;
  variantId?: string;
  variantName?: string;
  variantStatus?: string;
  unitsSold: number;
  orderCount: number;
  grossSales: string;
  refundAllocated: string;
  netSales: string;
  netSalesShare?: string;
  averageUnitPrice: string;
  currentInventory?: number;
  salesSignal: string;
  href?: string;
};

function getVariantName(variant: ProductVariant | undefined) {
  return variant ? `${variant.optionName}: ${variant.optionValue}` : undefined;
}

function getMetricKey(productId: string, variantId?: string) {
  return `${productId}:${variantId || "product"}`;
}

function getNetSalesShare(valueCents: number, totalCents: number) {
  if (totalCents <= 0) {
    return "0%";
  }

  return `${Math.round((valueCents / totalCents) * 100)}%`;
}

function getSalesSignal(input: {
  currentInventory?: number;
  netSalesCents: number;
  unitsSold: number;
}) {
  if (input.unitsSold <= 0) {
    return "No paid sales yet";
  }

  if (typeof input.currentInventory === "number" && input.currentInventory <= 0) {
    return "Sold through";
  }

  if (input.netSalesCents > 0 && input.unitsSold >= 2) {
    return "Selling";
  }

  return "Watch";
}

function ensureMetric(
  metrics: Map<string, ProductSalesMetric>,
  input: {
    product: Product;
    variant?: ProductVariant;
  },
) {
  const key = getMetricKey(input.product.id, input.variant?.id);
  const current = metrics.get(key) || {
    productId: input.product.id,
    productName: input.product.name,
    variantId: input.variant?.id,
    variantName: getVariantName(input.variant),
    sku: input.variant?.sku || input.product.sku,
    unitsSold: 0,
    orderIds: new Set<string>(),
    grossSalesCents: 0,
    refundAllocatedCents: 0,
    netSalesCents: 0,
  };

  metrics.set(key, current);

  return current;
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { orders, products, store } = workspace;
  const productsById = new Map(products.map((product) => [product.id, product]));
  const variantsById = new Map(
    products.flatMap((product) =>
      product.variants.map((variant) => [variant.id, { product, variant }] as const),
    ),
  );
  const productMetrics = new Map<string, ProductSalesMetric>();
  const variantMetrics = new Map<string, ProductSalesMetric>();

  for (const product of products) {
    ensureMetric(productMetrics, { product });

    for (const variant of product.variants) {
      ensureMetric(variantMetrics, { product, variant });
    }
  }

  for (const order of orders.filter((item) => isRevenueOrderStatus(item.status))) {
    const orderNetRatio =
      order.totalCents > 0
        ? Math.max(0, order.totalCents - order.refundedCents) / order.totalCents
        : 0;

    for (const item of order.items || []) {
      const variantLookup = item.productVariantId
        ? variantsById.get(item.productVariantId)
        : undefined;
      const product =
        variantLookup?.product ||
        (item.productId ? productsById.get(item.productId) : undefined);

      if (!product) {
        continue;
      }

      const grossLineCents = item.unitPriceCents * item.quantity;
      const netLineCents = Math.round(grossLineCents * orderNetRatio);
      const refundLineCents = Math.max(0, grossLineCents - netLineCents);
      const productMetric = ensureMetric(productMetrics, { product });

      productMetric.unitsSold += item.quantity;
      productMetric.orderIds.add(order.id);
      productMetric.grossSalesCents += grossLineCents;
      productMetric.refundAllocatedCents += refundLineCents;
      productMetric.netSalesCents += netLineCents;

      if (variantLookup) {
        const variantMetric = ensureMetric(variantMetrics, variantLookup);

        variantMetric.unitsSold += item.quantity;
        variantMetric.orderIds.add(order.id);
        variantMetric.grossSalesCents += grossLineCents;
        variantMetric.refundAllocatedCents += refundLineCents;
        variantMetric.netSalesCents += netLineCents;
      }
    }
  }

  const totalNetSalesCents = [...productMetrics.values()].reduce(
    (sum, metric) => sum + metric.netSalesCents,
    0,
  );
  const rows: ProductSalesRow[] = [
    ...products
      .slice()
      .sort((a, b) => {
        const first = productMetrics.get(getMetricKey(a.id));
        const second = productMetrics.get(getMetricKey(b.id));

        return (
          (second?.netSalesCents || 0) - (first?.netSalesCents || 0) ||
          a.name.localeCompare(b.name)
        );
      })
      .flatMap((product) => {
        const productMetric = productMetrics.get(getMetricKey(product.id));
        const productRow: ProductSalesRow = {
          rowType: "product",
          productId: product.id,
          productName: product.name,
          productStatus: productStatusLabels[product.status],
          category: product.category,
          sku: product.sku,
          unitsSold: productMetric?.unitsSold || 0,
          orderCount: productMetric?.orderIds.size || 0,
          grossSales: formatCurrency(
            productMetric?.grossSalesCents || 0,
            store.currency,
          ),
          refundAllocated: formatCurrency(
            productMetric?.refundAllocatedCents || 0,
            store.currency,
          ),
          netSales: formatCurrency(
            productMetric?.netSalesCents || 0,
            store.currency,
          ),
          netSalesShare: getNetSalesShare(
            productMetric?.netSalesCents || 0,
            totalNetSalesCents,
          ),
          averageUnitPrice: formatCurrency(
            productMetric && productMetric.unitsSold > 0
              ? Math.round(productMetric.netSalesCents / productMetric.unitsSold)
              : product.priceCents,
            store.currency,
          ),
          currentInventory: product.inventoryCount,
          salesSignal: getSalesSignal({
            currentInventory: product.inventoryCount,
            netSalesCents: productMetric?.netSalesCents || 0,
            unitsSold: productMetric?.unitsSold || 0,
          }),
          href: `/dashboard/stores/${store.id}/products/${product.id}/edit`,
        };
        const variantRows = product.variants.map((variant) => {
          const metric = variantMetrics.get(getMetricKey(product.id, variant.id));

          return {
            rowType: "variant",
            productId: product.id,
            productName: product.name,
            productStatus: productStatusLabels[product.status],
            category: product.category,
            sku: product.sku,
            variantId: variant.id,
            variantName: getVariantName(variant),
            variantStatus: variant.status === "active" ? "Active" : "Paused",
            unitsSold: metric?.unitsSold || 0,
            orderCount: metric?.orderIds.size || 0,
            grossSales: formatCurrency(metric?.grossSalesCents || 0, store.currency),
            refundAllocated: formatCurrency(
              metric?.refundAllocatedCents || 0,
              store.currency,
            ),
            netSales: formatCurrency(metric?.netSalesCents || 0, store.currency),
            netSalesShare: getNetSalesShare(
              metric?.netSalesCents || 0,
              totalNetSalesCents,
            ),
            averageUnitPrice: formatCurrency(
              metric && metric.unitsSold > 0
                ? Math.round(metric.netSalesCents / metric.unitsSold)
                : variant.priceCents,
              store.currency,
            ),
            currentInventory: variant.inventoryCount,
            salesSignal: getSalesSignal({
              currentInventory: variant.inventoryCount,
              netSalesCents: metric?.netSalesCents || 0,
              unitsSold: metric?.unitsSold || 0,
            }),
            href: `/dashboard/stores/${store.id}/products/${product.id}/edit`,
          };
        });

        return [productRow, ...variantRows];
      }),
  ];

  return csvResponse<ProductSalesRow>({
    filename: `${store.slug}-product-sales.csv`,
    rows,
    columns: [
      { header: "row_type", value: (row) => row.rowType },
      { header: "product_id", value: (row) => row.productId },
      { header: "product_name", value: (row) => row.productName },
      { header: "product_status", value: (row) => row.productStatus },
      { header: "category", value: (row) => row.category },
      { header: "sku", value: (row) => row.sku },
      { header: "variant_id", value: (row) => row.variantId },
      { header: "variant_name", value: (row) => row.variantName },
      { header: "variant_status", value: (row) => row.variantStatus },
      { header: "units_sold", value: (row) => row.unitsSold },
      { header: "order_count", value: (row) => row.orderCount },
      { header: "gross_sales", value: (row) => row.grossSales },
      { header: "refund_allocated", value: (row) => row.refundAllocated },
      { header: "net_sales", value: (row) => row.netSales },
      { header: "net_sales_share", value: (row) => row.netSalesShare },
      { header: "average_unit_price", value: (row) => row.averageUnitPrice },
      { header: "current_inventory", value: (row) => row.currentInventory },
      { header: "sales_signal", value: (row) => row.salesSignal },
      { header: "href", value: (row) => row.href },
    ],
  });
}
