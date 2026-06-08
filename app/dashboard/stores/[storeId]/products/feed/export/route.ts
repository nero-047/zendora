import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getProductHealth } from "@/features/commerce/product-health";
import { getProductCanonicalUrl } from "@/features/commerce/seo";
import type {
  Product,
  ProductVariant,
  Store,
} from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ProductFeedRow = {
  product: Product;
  variant: ProductVariant | null;
};

function formatFeedPrice(cents: number, currency: string) {
  return `${(Math.max(0, cents) / 100).toFixed(2)} ${currency}`;
}

function getFeedId(row: ProductFeedRow) {
  return row.variant ? `${row.product.id}:${row.variant.id}` : row.product.id;
}

function getFeedTitle(row: ProductFeedRow) {
  return row.variant
    ? `${row.product.name} - ${row.variant.optionValue}`
    : row.product.name;
}

function getFeedSku(row: ProductFeedRow) {
  return row.variant?.sku || row.product.sku || row.product.id;
}

function getFeedPriceCents(row: ProductFeedRow) {
  return row.variant?.priceCents ?? row.product.priceCents;
}

function getFeedCurrency(row: ProductFeedRow) {
  return row.variant?.currency || row.product.currency;
}

function getFeedInventory(row: ProductFeedRow) {
  return row.variant?.inventoryCount ?? row.product.inventoryCount;
}

function getFeedAvailability(row: ProductFeedRow) {
  return getFeedInventory(row) > 0 ? "in stock" : "out of stock";
}

function getProductUrl(store: Store, row: ProductFeedRow) {
  const url = getProductCanonicalUrl(store, row.product);

  return row.variant ? `${url}?variant=${encodeURIComponent(row.variant.id)}` : url;
}

function getFeedIssues(store: Store, row: ProductFeedRow) {
  const health = getProductHealth(row.product);

  return [
    store.status !== "active" ? "Store is not active." : "",
    row.product.status !== "active" ? "Product is not active." : "",
    row.variant && row.variant.status !== "active" ? "Variant is not active." : "",
    getFeedInventory(row) > 0 ? "" : "Inventory is out of stock.",
    row.product.imageUrl.trim() ? "" : "Product image is missing.",
    row.product.description.trim().length >= 30
      ? ""
      : "Product description is too short for channel feeds.",
    row.product.category?.trim() ? "" : "Product category is missing.",
    ...health.issues
      .filter((issue) => issue.severity !== "info")
      .map((issue) => issue.detail),
  ].filter(Boolean);
}

function getFeedStatus(store: Store, row: ProductFeedRow) {
  return getFeedIssues(store, row).length === 0 ? "ready" : "needs_review";
}

function getRecommendedAction(store: Store, row: ProductFeedRow) {
  return getFeedIssues(store, row)[0] || "Ready for marketplace and channel sync.";
}

function getRows(products: Product[]): ProductFeedRow[] {
  return products
    .filter((product) => product.status === "active")
    .slice()
    .sort((first, second) => first.name.localeCompare(second.name))
    .flatMap((product): ProductFeedRow[] => {
      const activeVariants = product.variants
        .filter((variant) => variant.status === "active")
        .sort((first, second) => first.sortOrder - second.sortOrder);

      if (activeVariants.length === 0) {
        return [{ product, variant: null }];
      }

      return activeVariants.map((variant) => ({ product, variant }));
    });
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const rows = getRows(workspace.products);

  return csvResponse<ProductFeedRow>({
    filename: `${store.slug}-product-feed.csv`,
    rows,
    columns: [
      { header: "id", value: getFeedId },
      { header: "item_group_id", value: (row) => row.product.id },
      { header: "title", value: getFeedTitle },
      { header: "description", value: (row) => row.product.description },
      { header: "availability", value: getFeedAvailability },
      { header: "condition", value: () => "new" },
      {
        header: "price",
        value: (row) => formatFeedPrice(getFeedPriceCents(row), getFeedCurrency(row)),
      },
      { header: "link", value: (row) => getProductUrl(store, row) },
      { header: "image_link", value: (row) => row.product.imageUrl },
      { header: "brand", value: () => store.name },
      {
        header: "google_product_category",
        value: (row) => row.product.category || "",
      },
      { header: "product_type", value: (row) => row.product.category || "" },
      { header: "mpn", value: getFeedSku },
      { header: "sku", value: getFeedSku },
      { header: "inventory_quantity", value: getFeedInventory },
      {
        header: "shipping_price",
        value: () => formatFeedPrice(store.shippingRateCents, store.currency),
      },
      {
        header: "free_shipping_threshold",
        value: () =>
          formatFeedPrice(store.freeShippingThresholdCents, store.currency),
      },
      {
        header: "tax_rate",
        value: () => `${Number((store.taxRateBps / 100).toFixed(2))}%`,
      },
      { header: "feed_status", value: (row) => getFeedStatus(store, row) },
      {
        header: "issue_count",
        value: (row) => getFeedIssues(store, row).length,
      },
      {
        header: "issues",
        value: (row) => getFeedIssues(store, row).join(" | "),
      },
      {
        header: "recommended_action",
        value: (row) => getRecommendedAction(store, row),
      },
      {
        header: "admin_href",
        value: (row) =>
          `/dashboard/stores/${store.id}/products/${row.product.id}/edit`,
      },
    ],
  });
}
