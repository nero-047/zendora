import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getProductHealth } from "@/features/commerce/product-health";
import {
  getProductEditHref,
  productStatusLabels,
} from "@/features/commerce/products";
import type {
  CollectionStatus,
  Product,
  ProductCollection,
} from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type CollectionExportRow = {
  collection: ProductCollection;
  product: Product | null;
  position: number | null;
};

const collectionStatusLabels: Record<CollectionStatus, string> = {
  active: "Active",
  archived: "Archived",
  draft: "Draft",
};

function getCollectionRows(
  collection: ProductCollection,
  productsById: Map<string, Product>,
): CollectionExportRow[] {
  const productRows = collection.productIds.map((productId, index) => ({
    collection,
    product: productsById.get(productId) || null,
    position: index + 1,
  }));

  return productRows.length > 0
    ? productRows
    : [{ collection, product: null, position: null }];
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const productsById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const rows = workspace.collections
    .slice()
    .sort(
      (first, second) =>
        first.sortOrder - second.sortOrder ||
        first.title.localeCompare(second.title),
    )
    .flatMap((collection) => getCollectionRows(collection, productsById));

  return csvResponse<CollectionExportRow>({
    filename: `${workspace.store.slug}-collections.csv`,
    rows,
    columns: [
      { header: "collection_id", value: (row) => row.collection.id },
      { header: "collection_title", value: (row) => row.collection.title },
      { header: "collection_slug", value: (row) => row.collection.slug },
      {
        header: "collection_status",
        value: (row) => collectionStatusLabels[row.collection.status],
      },
      { header: "collection_sort_order", value: (row) => row.collection.sortOrder },
      { header: "collection_product_count", value: (row) => row.collection.productCount },
      { header: "product_position", value: (row) => row.position },
      { header: "product_id", value: (row) => row.product?.id },
      { header: "product_name", value: (row) => row.product?.name },
      {
        header: "product_status",
        value: (row) =>
          row.product ? productStatusLabels[row.product.status] : "",
      },
      {
        header: "product_health",
        value: (row) => (row.product ? getProductHealth(row.product).label : ""),
      },
      {
        header: "sellable_inventory",
        value: (row) =>
          row.product ? getProductHealth(row.product).sellableInventoryCount : "",
      },
      { header: "product_sku", value: (row) => row.product?.sku },
      { header: "product_category", value: (row) => row.product?.category },
      {
        header: "price",
        value: (row) =>
          row.product
            ? formatCurrency(row.product.priceCents, row.product.currency)
            : "",
      },
      {
        header: "variant_count",
        value: (row) => row.product?.variants.length,
      },
      {
        header: "collection_href",
        value: (row) =>
          `/stores/${workspace.store.slug}/collections/${row.collection.slug}`,
      },
      {
        header: "product_href",
        value: (row) =>
          row.product
            ? `/stores/${workspace.store.slug}/products/${row.product.slug}`
            : "",
      },
      {
        header: "admin_product_href",
        value: (row) =>
          row.product ? getProductEditHref(workspace.store.id, row.product.id) : "",
      },
      {
        header: "created_at",
        value: (row) => new Date(row.collection.createdAt).toISOString(),
      },
    ],
  });
}
