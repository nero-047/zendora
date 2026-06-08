import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  getCollectionCanonicalUrl,
  getProductCanonicalUrl,
  getStoreCanonicalUrl,
  getStorePageCanonicalUrl,
  getStorePolicyCanonicalUrl,
} from "@/features/commerce/seo";
import {
  getStorePageDescription,
  storePageStatusLabels,
} from "@/features/commerce/store-pages";
import { storePolicyLabels } from "@/features/commerce/policies";
import { getProductHealth } from "@/features/commerce/product-health";
import { productStatusLabels } from "@/features/commerce/products";
import type {
  CollectionStatus,
  Product,
  ProductCollection,
  Store,
  StorePage,
  StorePolicy,
  StoreStatus,
} from "@/features/commerce/types";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type SeoAuditRow = {
  resourceType: string;
  resourceId: string;
  label: string;
  status: string;
  indexable: boolean;
  canonicalUrl: string;
  seoTitle: string;
  seoDescription: string;
  socialImage: string;
  issues: string[];
  recommendedAction: string;
  adminHref: string;
};

const storeStatusLabels: Record<StoreStatus, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
};

const collectionStatusLabels: Record<CollectionStatus, string> = {
  active: "Active",
  archived: "Archived",
  draft: "Draft",
};

function hasReasonableDescription(value: string) {
  const length = value.trim().length;

  return length >= 50 && length <= 180;
}

function getIssueText(issues: string[]) {
  return issues.length > 0 ? issues.join(" | ") : "Ready";
}

function getRecommendedAction(issues: string[]) {
  return issues[0] || "No SEO action needed.";
}

function getStoreRow(store: Store): SeoAuditRow {
  const issues = [
    store.status !== "active" ? "Activate the store before indexing." : "",
    store.seoTitle?.trim() ? "" : "Add a store SEO title.",
    hasReasonableDescription(store.seoDescription || "")
      ? ""
      : "Add a store SEO description between 50 and 180 characters.",
    store.socialImageUrl?.trim() ? "" : "Add a social sharing image.",
  ].filter(Boolean);

  return {
    resourceType: "store",
    resourceId: store.id,
    label: store.name,
    status: storeStatusLabels[store.status],
    indexable: store.status === "active",
    canonicalUrl: getStoreCanonicalUrl(store),
    seoTitle: store.seoTitle || store.name,
    seoDescription: store.seoDescription || store.description,
    socialImage: store.socialImageUrl || "",
    issues,
    recommendedAction: getRecommendedAction(issues),
    adminHref: `/dashboard/stores/${store.id}`,
  };
}

function getProductRow(store: Store, product: Product): SeoAuditRow {
  const health = getProductHealth(product);
  const issues = [
    product.status !== "active" ? "Set the product active before indexing." : "",
    product.slug.trim() ? "" : "Add a product URL slug.",
    hasReasonableDescription(product.description)
      ? ""
      : "Expand the product description for SEO and buyer confidence.",
    product.imageUrl.trim() ? "" : "Add a product image.",
    product.category?.trim() ? "" : "Add a product category.",
    ...health.issues
      .filter((issue) => issue.severity !== "info")
      .map((issue) => issue.detail),
  ].filter(Boolean);

  return {
    resourceType: "product",
    resourceId: product.id,
    label: product.name,
    status: productStatusLabels[product.status],
    indexable: store.status === "active" && product.status === "active",
    canonicalUrl: getProductCanonicalUrl(store, product),
    seoTitle: product.name,
    seoDescription: product.description,
    socialImage: product.imageUrl,
    issues,
    recommendedAction: getRecommendedAction(issues),
    adminHref: `/dashboard/stores/${store.id}/products/${product.id}/edit`,
  };
}

function getCollectionRow(
  store: Store,
  collection: ProductCollection,
  productsById: Map<string, Product>,
): SeoAuditRow {
  const activeProducts = collection.productIds
    .map((productId) => productsById.get(productId))
    .filter((product): product is Product => Boolean(product))
    .filter((product) => product.status === "active");
  const issues = [
    collection.status !== "active"
      ? "Set the collection active before indexing."
      : "",
    collection.description.trim().length >= 40
      ? ""
      : "Add a clearer collection description.",
    collection.imageUrl?.trim() ? "" : "Add a collection image.",
    activeProducts.length > 0
      ? ""
      : "Add at least one active product to this collection.",
  ].filter(Boolean);

  return {
    resourceType: "collection",
    resourceId: collection.id,
    label: collection.title,
    status: collectionStatusLabels[collection.status],
    indexable: store.status === "active" && collection.status === "active",
    canonicalUrl: getCollectionCanonicalUrl(store, collection),
    seoTitle: collection.title,
    seoDescription: collection.description,
    socialImage: collection.imageUrl || "",
    issues,
    recommendedAction: getRecommendedAction(issues),
    adminHref: `/dashboard/stores/${store.id}`,
  };
}

function getPageRow(store: Store, page: StorePage): SeoAuditRow {
  const description = getStorePageDescription(page);
  const issues = [
    page.status !== "published" ? "Publish the page before indexing." : "",
    page.seoTitle?.trim() ? "" : "Add a page SEO title.",
    hasReasonableDescription(description)
      ? ""
      : "Add a page SEO description between 50 and 180 characters.",
    page.body.trim().length >= 20 ? "" : "Add page body content.",
  ].filter(Boolean);

  return {
    resourceType: "page",
    resourceId: page.id,
    label: page.title,
    status: storePageStatusLabels[page.status],
    indexable: store.status === "active" && page.status === "published",
    canonicalUrl: getStorePageCanonicalUrl(store, page),
    seoTitle: page.seoTitle || page.title,
    seoDescription: description,
    socialImage: "",
    issues,
    recommendedAction: getRecommendedAction(issues),
    adminHref: `/dashboard/stores/${store.id}`,
  };
}

function getPolicyRow(store: Store, policy: StorePolicy): SeoAuditRow {
  const issues = [
    policy.status !== "published" ? "Publish the policy before indexing." : "",
    policy.body.trim().length >= 20 ? "" : "Add policy body content.",
  ].filter(Boolean);

  return {
    resourceType: "policy",
    resourceId: policy.id,
    label: storePolicyLabels[policy.type],
    status: storePageStatusLabels[policy.status],
    indexable: store.status === "active" && policy.status === "published",
    canonicalUrl: getStorePolicyCanonicalUrl(store, policy),
    seoTitle: policy.title,
    seoDescription: policy.body.trim().replace(/\s+/g, " ").slice(0, 180),
    socialImage: "",
    issues,
    recommendedAction: getRecommendedAction(issues),
    adminHref: `/dashboard/stores/${store.id}`,
  };
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const productsById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const rows: SeoAuditRow[] = [
    getStoreRow(store),
    ...workspace.products
      .slice()
      .sort((first, second) => first.name.localeCompare(second.name))
      .map((product) => getProductRow(store, product)),
    ...workspace.collections
      .slice()
      .sort(
        (first, second) =>
          first.sortOrder - second.sortOrder ||
          first.title.localeCompare(second.title),
      )
      .map((collection) => getCollectionRow(store, collection, productsById)),
    ...workspace.customPages
      .slice()
      .sort((first, second) => first.title.localeCompare(second.title))
      .map((page) => getPageRow(store, page)),
    ...workspace.policies
      .slice()
      .sort((first, second) => first.type.localeCompare(second.type))
      .map((policy) => getPolicyRow(store, policy)),
  ];

  return csvResponse<SeoAuditRow>({
    filename: `${store.slug}-seo-audit.csv`,
    rows,
    columns: [
      { header: "resource_type", value: (row) => row.resourceType },
      { header: "resource_id", value: (row) => row.resourceId },
      { header: "label", value: (row) => row.label },
      { header: "status", value: (row) => row.status },
      { header: "indexable", value: (row) => row.indexable },
      { header: "canonical_url", value: (row) => row.canonicalUrl },
      { header: "seo_title", value: (row) => row.seoTitle },
      { header: "seo_description", value: (row) => row.seoDescription },
      { header: "social_image", value: (row) => row.socialImage },
      { header: "issue_count", value: (row) => row.issues.length },
      { header: "issues", value: (row) => getIssueText(row.issues) },
      { header: "recommended_action", value: (row) => row.recommendedAction },
      { header: "admin_href", value: (row) => row.adminHref },
    ],
  });
}
