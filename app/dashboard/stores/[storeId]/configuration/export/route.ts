import { requireAppUser } from "@/features/auth/app-user";
import { csvResponse } from "@/features/commerce/csv-export";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  storeNavigationLocationLabels,
} from "@/features/commerce/navigation";
import { getPolicyHref, storePolicyLabels } from "@/features/commerce/policies";
import {
  getStorePageHref,
  storePageStatusLabels,
} from "@/features/commerce/store-pages";
import type {
  CollectionStatus,
  ShippingZoneStatus,
  StoreStatus,
} from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ExportRouteContext = {
  params: Promise<{ storeId: string }>;
};

type ConfigurationExportRow = {
  section: string;
  metric: string;
  label: string;
  value: string | number;
  status?: string;
  detail?: string;
  href?: string;
};

const storeStatusLabels: Record<StoreStatus, string> = {
  active: "Active",
  draft: "Draft",
  paused: "Paused",
};

const shippingZoneStatusLabels: Record<ShippingZoneStatus, string> = {
  active: "Active",
  paused: "Paused",
};

const collectionStatusLabels: Record<CollectionStatus, string> = {
  active: "Active",
  archived: "Archived",
  draft: "Draft",
};

function formatDate(value: string | undefined) {
  return value ? new Date(value).toISOString() : "";
}

function formatTaxRate(bps: number) {
  return `${Number((bps / 100).toFixed(2))}%`;
}

function summarizeText(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 240);
}

export async function GET(_request: Request, context: ExportRouteContext) {
  const { storeId } = await context.params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    return new Response("Store not found.", { status: 404 });
  }

  const { store } = workspace;
  const rows: ConfigurationExportRow[] = [
    {
      section: "store",
      metric: "name",
      label: "Store name",
      value: store.name,
      status: storeStatusLabels[store.status],
      detail: store.description,
      href: `/stores/${store.slug}`,
    },
    {
      section: "store",
      metric: "slug",
      label: "Store slug",
      value: store.slug,
      status: storeStatusLabels[store.status],
      href: `/stores/${store.slug}`,
    },
    {
      section: "store",
      metric: "currency",
      label: "Currency",
      value: store.currency,
    },
    {
      section: "store",
      metric: "theme_color",
      label: "Theme color",
      value: store.themeColor,
    },
    {
      section: "store",
      metric: "tax_rate",
      label: "Tax rate",
      value: formatTaxRate(store.taxRateBps),
    },
    {
      section: "store",
      metric: "default_shipping_rate",
      label: "Default shipping rate",
      value: formatCurrency(store.shippingRateCents, store.currency),
    },
    {
      section: "store",
      metric: "free_shipping_threshold",
      label: "Free shipping threshold",
      value: formatCurrency(store.freeShippingThresholdCents, store.currency),
    },
    {
      section: "store",
      metric: "seo_title",
      label: "SEO title",
      value: store.seoTitle || "",
    },
    {
      section: "store",
      metric: "seo_description",
      label: "SEO description",
      value: store.seoDescription || "",
    },
    {
      section: "store",
      metric: "social_image",
      label: "Social image",
      value: store.socialImageUrl || "",
    },
    ...workspace.policies
      .slice()
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((policy) => ({
        section: "policy",
        metric: policy.type,
        label: storePolicyLabels[policy.type],
        value: storePageStatusLabels[policy.status],
        status: storePageStatusLabels[policy.status],
        detail: [
          policy.title,
          summarizeText(policy.body),
          formatDate(policy.publishedAt),
          formatDate(policy.updatedAt),
        ]
          .filter(Boolean)
          .join(" / "),
        href: getPolicyHref(store.slug, policy.type),
      })),
    ...workspace.customPages
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((page) => ({
        section: "custom_page",
        metric: page.slug,
        label: page.title,
        value: storePageStatusLabels[page.status],
        status: storePageStatusLabels[page.status],
        detail: [
          page.seoTitle,
          page.seoDescription,
          summarizeText(page.body),
          formatDate(page.publishedAt),
          formatDate(page.updatedAt),
        ]
          .filter(Boolean)
          .join(" / "),
        href: getStorePageHref(store.slug, page.slug),
      })),
    ...workspace.navigationMenus
      .slice()
      .sort((a, b) => a.location.localeCompare(b.location))
      .map((menu) => ({
        section: "navigation",
        metric: menu.location,
        label: `${storeNavigationLocationLabels[menu.location]} navigation`,
        value: `${menu.links.length} links`,
        status: menu.links.length > 0 ? "Configured" : "Empty",
        detail: menu.links.map((link) => `${link.label} -> ${link.href}`).join(" | "),
      })),
    ...workspace.shippingZones
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((zone) => ({
        section: "shipping_zone",
        metric: zone.id,
        label: zone.name,
        value: formatCurrency(zone.rateCents, store.currency),
        status: shippingZoneStatusLabels[zone.status],
        detail: [
          zone.countries.join(", "),
          `Free from ${formatCurrency(zone.freeShippingThresholdCents, store.currency)}`,
          formatDate(zone.createdAt),
        ].join(" / "),
      })),
    ...workspace.collections
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
      .map((collection) => ({
        section: "collection",
        metric: collection.id,
        label: collection.title,
        value: `${collection.productCount} products`,
        status: collectionStatusLabels[collection.status],
        detail: [
          collection.slug,
          collection.description,
          collection.productIds.join(", "),
          formatDate(collection.createdAt),
        ]
          .filter(Boolean)
          .join(" / "),
        href: `/stores/${store.slug}/collections/${collection.slug}`,
      })),
  ];

  return csvResponse<ConfigurationExportRow>({
    filename: `${store.slug}-configuration.csv`,
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
