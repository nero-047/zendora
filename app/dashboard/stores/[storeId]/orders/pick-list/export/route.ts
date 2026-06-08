import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getProductHealth } from "@/features/commerce/product-health";
import {
  filterOrders,
  parseOrderFulfillmentStageFilter,
  parseOrderFinancialStatusFilter,
  parseOrderPaymentStatusFilter,
  parseOrderRiskLevelFilter,
  parseOrderSourceFilter,
  parseOrderStatusFilter,
} from "@/features/commerce/orders";
import { productStatusLabels } from "@/features/commerce/products";
import type { Order, OrderItem, Product } from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type PickListRow = {
  product: Product | null;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sku: string;
  totalQuantity: number;
  orderIds: string[];
  customerEmails: string[];
  earliestOrderAt: string;
};

function readParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key) || undefined;
}

function getLineKey(item: OrderItem) {
  return [
    item.productId || item.productName,
    item.productVariantId || item.variantName || "",
    item.variantSku || "",
  ].join(":");
}

function getLineSku(item: OrderItem, product: Product | null) {
  return item.variantSku || product?.sku || "";
}

function getProductVariantInventory(product: Product | null, variantId: string) {
  if (!product) {
    return "";
  }

  if (!variantId) {
    return product.inventoryCount;
  }

  return product.variants.find((variant) => variant.id === variantId)
    ?.inventoryCount ?? "";
}

function getEarliestDate(first: string, second: string) {
  return new Date(first).getTime() <= new Date(second).getTime() ? first : second;
}

function buildPickListRows(orders: Order[], products: Product[]) {
  const productsById = new Map(products.map((product) => [product.id, product]));
  const rowsByKey = new Map<string, PickListRow>();

  for (const order of orders) {
    for (const item of order.items || []) {
      const product = item.productId ? productsById.get(item.productId) || null : null;
      const key = getLineKey(item);
      const current = rowsByKey.get(key);

      if (current) {
        current.totalQuantity += item.quantity;
        current.orderIds = [...new Set([...current.orderIds, order.id])];
        current.customerEmails = [
          ...new Set([...current.customerEmails, order.customerEmail]),
        ];
        current.earliestOrderAt = getEarliestDate(
          current.earliestOrderAt,
          order.createdAt,
        );
        continue;
      }

      rowsByKey.set(key, {
        product,
        productId: item.productId || "",
        productName: item.productName,
        variantId: item.productVariantId || "",
        variantName: item.variantName || "",
        sku: getLineSku(item, product),
        totalQuantity: item.quantity,
        orderIds: [order.id],
        customerEmails: [order.customerEmail],
        earliestOrderAt: order.createdAt,
      });
    }
  }

  return [...rowsByKey.values()].sort(
    (first, second) =>
      first.productName.localeCompare(second.productName) ||
      first.variantName.localeCompare(second.variantName) ||
      first.sku.localeCompare(second.sku),
  );
}

export async function GET(request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const searchParams = new URL(request.url).searchParams;
  const orders = filterOrders({
    orders: workspace.orders,
    query: readParam(searchParams, "q") || "",
    status: parseOrderStatusFilter(readParam(searchParams, "status")),
    paymentStatus: parseOrderPaymentStatusFilter(
      readParam(searchParams, "payment"),
    ),
    source: parseOrderSourceFilter(readParam(searchParams, "source")),
    fulfillmentStage: parseOrderFulfillmentStageFilter(
      readParam(searchParams, "fulfillment"),
    ),
    risk: parseOrderRiskLevelFilter(readParam(searchParams, "risk")),
    financialStatus: parseOrderFinancialStatusFilter(
      readParam(searchParams, "financial"),
    ),
  });
  const rows = buildPickListRows(orders, workspace.products);

  return csvResponse<PickListRow>({
    filename: `${workspace.store.slug}-pick-list.csv`,
    rows,
    columns: [
      { header: "product_id", value: (row) => row.productId },
      { header: "product_name", value: (row) => row.productName },
      { header: "variant_id", value: (row) => row.variantId },
      { header: "variant_name", value: (row) => row.variantName },
      { header: "sku", value: (row) => row.sku },
      { header: "total_quantity", value: (row) => row.totalQuantity },
      { header: "order_count", value: (row) => row.orderIds.length },
      { header: "orders", value: (row) => row.orderIds.join(" | ") },
      {
        header: "customer_count",
        value: (row) => row.customerEmails.length,
      },
      {
        header: "inventory_on_hand",
        value: (row) => getProductVariantInventory(row.product, row.variantId),
      },
      {
        header: "sellable_inventory",
        value: (row) =>
          row.product ? getProductHealth(row.product).sellableInventoryCount : "",
      },
      {
        header: "product_status",
        value: (row) =>
          row.product ? productStatusLabels[row.product.status] : "",
      },
      {
        header: "earliest_order_at",
        value: (row) => new Date(row.earliestOrderAt).toISOString(),
      },
      {
        header: "product_admin_href",
        value: (row) =>
          row.product
            ? `/dashboard/stores/${workspace.store.id}/products/${row.product.id}/edit`
            : "",
      },
    ],
  });
}
