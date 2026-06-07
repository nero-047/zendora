import type { StorePage } from "@/features/commerce/types";

export const storePageStatuses = ["draft", "published"] as const;

export const storePageStatusLabels = {
  draft: "Draft",
  published: "Published",
} as const satisfies Record<(typeof storePageStatuses)[number], string>;

export function getStorePageHref(storeSlug: string, pageSlug: string) {
  return `/stores/${storeSlug}/pages/${pageSlug}`;
}

export function getPublishedStorePages(pages: StorePage[]) {
  return pages.filter(
    (page) => page.status === "published" && page.body.trim().length > 0,
  );
}

export function getStorePageDescription(page: StorePage) {
  const seoDescription = page.seoDescription?.trim();

  if (seoDescription) {
    return seoDescription;
  }

  const firstParagraph = page.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstParagraph) {
    return `${page.title} page.`;
  }

  return firstParagraph.length > 180
    ? `${firstParagraph.slice(0, 177)}...`
    : firstParagraph;
}
