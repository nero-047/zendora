import type { MetadataRoute } from "next";

import { listPublicStorefrontSitemapEntries } from "@/features/commerce/data";
import { getAppUrl } from "@/lib/env";

export const dynamic = "force-dynamic";

function getBaseUrl() {
  return getAppUrl().replace(/\/$/, "");
}

function publicUrl(path: string) {
  return `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

function getLatestDate(values: string[]) {
  return values.reduce(
    (latest, value) =>
      new Date(value).getTime() > new Date(latest).getTime() ? value : latest,
    values[0],
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const storefrontEntries = await listPublicStorefrontSitemapEntries();
  const now = new Date();
  const urls: MetadataRoute.Sitemap = [
    {
      url: publicUrl("/"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  for (const entry of storefrontEntries) {
    urls.push({
      url: publicUrl(`/stores/${entry.store.slug}`),
      lastModified: entry.store.createdAt,
      changeFrequency: "daily",
      priority: 1,
      images: entry.products[0]?.imageUrl ? [entry.products[0].imageUrl] : undefined,
    });

    urls.push({
      url: publicUrl(`/stores/${entry.store.slug}/contact`),
      lastModified: entry.store.createdAt,
      changeFrequency: "monthly",
      priority: 0.5,
    });

    if (entry.products.length > 0) {
      const latestCatalogDate = getLatestDate([
        entry.store.createdAt,
        ...entry.products.map((product) => product.createdAt),
        ...entry.collections.map((collection) => collection.createdAt),
      ]);

      urls.push(
        {
          url: publicUrl(`/stores/${entry.store.slug}/collections`),
          lastModified: latestCatalogDate,
          changeFrequency: "daily",
          priority: 0.82,
          images: entry.products[0]?.imageUrl ? [entry.products[0].imageUrl] : undefined,
        },
        {
          url: publicUrl(`/stores/${entry.store.slug}/collections/all`),
          lastModified: latestCatalogDate,
          changeFrequency: "daily",
          priority: 0.78,
          images: entry.products[0]?.imageUrl ? [entry.products[0].imageUrl] : undefined,
        },
      );
    }

    for (const product of entry.products) {
      urls.push({
        url: publicUrl(`/stores/${entry.store.slug}/products/${product.slug}`),
        lastModified: product.createdAt,
        changeFrequency: "weekly",
        priority: 0.8,
        images: product.imageUrl ? [product.imageUrl] : undefined,
      });
    }

    for (const collection of entry.collections) {
      urls.push({
        url: publicUrl(
          `/stores/${entry.store.slug}/collections/${collection.slug}`,
        ),
        lastModified: collection.createdAt,
        changeFrequency: "weekly",
        priority: 0.75,
        images: collection.imageUrl ? [collection.imageUrl] : undefined,
      });
    }

    for (const page of entry.customPages) {
      urls.push({
        url: publicUrl(`/stores/${entry.store.slug}/pages/${page.slug}`),
        lastModified: page.updatedAt,
        changeFrequency: "monthly",
        priority: 0.55,
      });
    }

    if (entry.policies.length > 0) {
      urls.push({
        url: publicUrl(`/stores/${entry.store.slug}/policies`),
        lastModified: entry.policies.reduce(
          (latest, policy) =>
            new Date(policy.updatedAt).getTime() > new Date(latest).getTime()
              ? policy.updatedAt
              : latest,
          entry.policies[0].updatedAt,
        ),
        changeFrequency: "monthly",
        priority: 0.45,
      });
    }

    for (const policy of entry.policies) {
      urls.push({
        url: publicUrl(`/stores/${entry.store.slug}/policies/${policy.type}`),
        lastModified: policy.updatedAt,
        changeFrequency: "monthly",
        priority: 0.4,
      });
    }
  }

  return urls;
}
