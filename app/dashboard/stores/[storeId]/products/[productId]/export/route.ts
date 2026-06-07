import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getInventoryPlanningSignals } from "@/features/commerce/inventory-planning";
import { orderStatusLabels, paymentStatusLabels } from "@/features/commerce/order-status";
import { getProductHealth } from "@/features/commerce/product-health";
import { productStatusLabels } from "@/features/commerce/products";
import { productReviewStatusLabels } from "@/features/commerce/reviews";
import type { InventoryAdjustmentReason } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string; productId: string }>;
};

type ProductExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number | boolean;
  status?: string;
  detail?: string;
  href?: string;
};

const adjustmentReasonLabels: Record<InventoryAdjustmentReason, string> = {
  restock: "Restock",
  correction: "Correction",
  damage: "Damage",
  return: "Return",
  manual_edit: "Product edit",
};

function formatOptionalDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId, productId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const product = workspace.products.find((item) => item.id === productId);

  if (!product) {
    return new Response("Product not found.", { status: 404 });
  }

  const health = getProductHealth(product);
  const inventoryPlan = getInventoryPlanningSignals({
    products: [product],
    orders: workspace.orders,
    limit: 1,
  })[0];
  const inventoryAdjustments = workspace.inventoryAdjustments.filter(
    (adjustment) => adjustment.productId === product.id,
  );
  const orderItems = workspace.orders.flatMap((order) =>
    (order.items || [])
      .filter((item) => item.productId === product.id)
      .map((item) => ({ item, order })),
  );
  const productReviews = workspace.productReviews.filter(
    (review) => review.productId === product.id,
  );

  const rows: ProductExportRow[] = [
    {
      section: "summary",
      metric: "product_id",
      label: "Product ID",
      value: product.id,
    },
    {
      section: "summary",
      metric: "name",
      label: "Name",
      value: product.name,
    },
    {
      section: "summary",
      metric: "slug",
      label: "Slug",
      value: product.slug,
      href: `/stores/${workspace.store.slug}/products/${product.slug}`,
    },
    {
      section: "summary",
      metric: "status",
      label: "Status",
      value: productStatusLabels[product.status],
      status: product.status,
    },
    {
      section: "summary",
      metric: "category",
      label: "Category",
      value: product.category || "Uncategorized",
    },
    {
      section: "summary",
      metric: "sku",
      label: "SKU",
      value: product.sku || "",
    },
    {
      section: "summary",
      metric: "price",
      label: "Price",
      value: formatCurrency(product.priceCents, product.currency),
    },
    {
      section: "summary",
      metric: "base_inventory",
      label: "Base inventory",
      value: product.inventoryCount,
    },
    {
      section: "summary",
      metric: "sellable_inventory",
      label: "Sellable inventory",
      value: health.sellableInventoryCount,
      detail: `${health.activeVariantCount} active variants`,
    },
    {
      section: "summary",
      metric: "health",
      label: "Catalog health",
      value: health.label,
      status: health.status,
      detail: health.nextAction,
    },
    {
      section: "summary",
      metric: "image",
      label: "Image",
      value: product.imageUrl,
      href: product.imageUrl,
    },
    ...(inventoryPlan
      ? [
          {
            section: "inventory_plan",
            metric: "urgency",
            label: "Urgency",
            value: inventoryPlan.label,
            status: inventoryPlan.urgency,
            detail: inventoryPlan.detail,
          },
          {
            section: "inventory_plan",
            metric: "sold_quantity",
            label: "Sold quantity",
            value: inventoryPlan.soldQuantity,
            detail: `${inventoryPlan.salesVelocityPerDay}/day sales velocity`,
          },
          {
            section: "inventory_plan",
            metric: "runway",
            label: "Estimated stockout",
            value:
              typeof inventoryPlan.estimatedDaysUntilStockout === "number"
                ? `${inventoryPlan.estimatedDaysUntilStockout} days`
                : "Not tracked",
          },
          {
            section: "inventory_plan",
            metric: "reorder_quantity",
            label: "Reorder quantity",
            value: inventoryPlan.reorderQuantity,
          },
        ]
      : []),
    ...health.issues.map((issue) => ({
      section: "health_issue",
      metric: issue.id,
      label: issue.label,
      value: issue.severity,
      status: issue.severity,
      detail: issue.detail,
    })),
    ...product.variants.map((variant) => ({
      section: "variant",
      metric: variant.id,
      label: `${variant.optionName}: ${variant.optionValue}`,
      value: formatCurrency(variant.priceCents, variant.currency),
      status: variant.status,
      detail: [
        variant.sku,
        `${variant.inventoryCount} inventory`,
        `sort ${variant.sortOrder}`,
      ]
        .filter(Boolean)
        .join(" / "),
    })),
    ...inventoryAdjustments.map((adjustment) => ({
      section: "inventory_adjustment",
      metric: adjustment.id,
      label: adjustmentReasonLabels[adjustment.reason],
      value: adjustment.delta,
      status: adjustment.reason,
      detail: [
        `${adjustment.previousInventory} to ${adjustment.nextInventory}`,
        adjustment.reference,
        adjustment.note,
        formatOptionalDate(adjustment.createdAt),
      ]
        .filter(Boolean)
        .join(" / "),
    })),
    ...orderItems.map(({ item, order }) => ({
      section: "order_item",
      metric: item.id,
      label: `Order ${order.id}`,
      value: formatCurrency(item.unitPriceCents * item.quantity, order.currency),
      status: orderStatusLabels[order.status],
      detail: [
        order.customerEmail,
        paymentStatusLabels[order.paymentStatus],
        `${item.quantity} x ${formatCurrency(item.unitPriceCents, order.currency)}`,
        item.variantName,
        formatOptionalDate(order.createdAt),
      ]
        .filter(Boolean)
        .join(" / "),
      href: `/dashboard/stores/${workspace.store.id}/orders/${order.id}`,
    })),
    ...productReviews.map((review) => ({
      section: "product_review",
      metric: review.id,
      label: review.title || review.customerName,
      value: `${review.rating}/5`,
      status: productReviewStatusLabels[review.status],
      detail: [
        review.customerEmail,
        review.body,
        review.merchantReply,
        formatOptionalDate(review.reviewedAt),
      ]
        .filter(Boolean)
        .join(" / "),
      href: review.orderId
        ? `/dashboard/stores/${workspace.store.id}/orders/${review.orderId}`
        : undefined,
    })),
  ];

  return csvResponse<ProductExportRow>({
    filename: `${workspace.store.slug}-${product.slug || product.id}-product.csv`,
    rows,
    columns: [
      { header: "section", value: (row) => row.section },
      { header: "metric", value: (row) => row.metric },
      { header: "label", value: (row) => row.label },
      { header: "value", value: (row) => row.value },
      { header: "status", value: (row) => row.status },
      { header: "detail", value: (row) => row.detail },
      { header: "href", value: (row) => row.href },
    ],
  });
}
