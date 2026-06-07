import type { Store } from "@/features/commerce/types";

export function getStoreSeoTitle(store: Store, suffix?: string) {
  const baseTitle = store.seoTitle?.trim() || store.name;

  return suffix ? `${suffix} | ${baseTitle}` : baseTitle;
}

export function getStoreSeoDescription(store: Store) {
  return (
    store.seoDescription?.trim() ||
    store.description ||
    `${store.name} storefront.`
  );
}

export function getStoreSocialImages(store: Store, fallback?: string) {
  return Array.from(
    new Set(
      [store.socialImageUrl, fallback]
        .map((image) => image?.trim())
        .filter((image): image is string => Boolean(image)),
    ),
  );
}
