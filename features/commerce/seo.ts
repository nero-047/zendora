import type {
  Product,
  ProductCollection,
  Store,
} from "@/features/commerce/types";
import { getAppUrl } from "@/lib/env";

type SeoStore = Pick<
  Store,
  | "currency"
  | "description"
  | "name"
  | "seoDescription"
  | "seoTitle"
  | "slug"
  | "socialImageUrl"
>;

type ProductReviewSummary = {
  averageRating: number;
  reviewCount: number;
};

export function getPublicBaseUrl() {
  return getAppUrl().replace(/\/$/, "");
}

function getPublicUrl(path: string) {
  return `${getPublicBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getStoreCanonicalUrl(store: Pick<Store, "slug">) {
  return getPublicUrl(`/stores/${store.slug}`);
}

export function getProductCanonicalUrl(
  store: Pick<Store, "slug">,
  product: Pick<Product, "slug">,
) {
  return getPublicUrl(`/stores/${store.slug}/products/${product.slug}`);
}

export function getCollectionCanonicalUrl(
  store: Pick<Store, "slug">,
  collection: Pick<ProductCollection, "slug">,
) {
  return getPublicUrl(`/stores/${store.slug}/collections/${collection.slug}`);
}

export function getStorePageCanonicalUrl(
  store: Pick<Store, "slug">,
  page: { slug: string },
) {
  return getPublicUrl(`/stores/${store.slug}/pages/${page.slug}`);
}

export function getStorePolicyCanonicalUrl(
  store: Pick<Store, "slug">,
  policy: { type: string },
) {
  return getPublicUrl(`/stores/${store.slug}/policies/${policy.type}`);
}

export function serializeJsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function getStoreSeoTitle(
  store: Pick<Store, "name" | "seoTitle">,
  suffix?: string,
) {
  const baseTitle = store.seoTitle?.trim() || store.name;

  return suffix ? `${suffix} | ${baseTitle}` : baseTitle;
}

export function getStoreSeoDescription(
  store: Pick<Store, "description" | "name" | "seoDescription">,
) {
  return (
    store.seoDescription?.trim() ||
    store.description ||
    `${store.name} storefront.`
  );
}

export function getStoreSocialImages(
  store: Pick<Store, "socialImageUrl">,
  fallback?: string,
) {
  return Array.from(
    new Set(
      [store.socialImageUrl, fallback]
        .map((image) => image?.trim())
        .filter((image): image is string => Boolean(image)),
    ),
  );
}

function getProductAvailability(product: Product) {
  const sellableInventory =
    product.variants.length > 0
      ? product.variants
          .filter((variant) => variant.status === "active")
          .reduce((sum, variant) => sum + Math.max(0, variant.inventoryCount), 0)
      : Math.max(0, product.inventoryCount);

  return sellableInventory > 0
    ? "https://schema.org/InStock"
    : "https://schema.org/OutOfStock";
}

function getLowestProductPriceCents(product: Product) {
  const activeVariantPrices = product.variants
    .filter((variant) => variant.status === "active")
    .map((variant) => variant.priceCents);

  return Math.min(product.priceCents, ...activeVariantPrices);
}

function centsToPrice(cents: number) {
  return (Math.max(0, cents) / 100).toFixed(2);
}

export function getStoreJsonLd(input: {
  store: SeoStore;
  products: Product[];
}) {
  const storeUrl = getStoreCanonicalUrl(input.store);

  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${storeUrl}#store`,
    name: input.store.name,
    url: storeUrl,
    description: getStoreSeoDescription(input.store),
    image: getStoreSocialImages(input.store, input.products[0]?.imageUrl)[0],
    priceRange: input.products.length > 0 ? "$$" : undefined,
    makesOffer: input.products.slice(0, 12).map((product) => ({
      "@type": "Offer",
      price: centsToPrice(getLowestProductPriceCents(product)),
      priceCurrency: product.currency || input.store.currency,
      availability: getProductAvailability(product),
      itemOffered: {
        "@type": "Product",
        name: product.name,
        sku: product.sku,
        image: product.imageUrl,
        url: getProductCanonicalUrl(input.store, product),
      },
    })),
  };
}

export function getProductJsonLd(input: {
  store: SeoStore;
  product: Product;
  reviewSummary?: ProductReviewSummary;
}) {
  const productUrl = getProductCanonicalUrl(input.store, input.product);
  const reviewSummary = input.reviewSummary;
  const activeVariants = input.product.variants.filter(
    (variant) => variant.status === "active",
  );

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: input.product.name,
    description: input.product.description,
    image: input.product.imageUrl,
    sku: input.product.sku,
    category: input.product.category,
    brand: {
      "@type": "Brand",
      name: input.store.name,
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      price: centsToPrice(getLowestProductPriceCents(input.product)),
      priceCurrency: input.product.currency || input.store.currency,
      availability: getProductAvailability(input.product),
    },
    aggregateRating:
      reviewSummary && reviewSummary.reviewCount > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: reviewSummary.averageRating,
            reviewCount: reviewSummary.reviewCount,
          }
        : undefined,
    hasVariant:
      activeVariants.length > 0
        ? activeVariants.map((variant) => ({
            "@type": "Product",
            name: `${input.product.name} - ${variant.optionValue}`,
            sku: variant.sku,
            offers: {
              "@type": "Offer",
              price: centsToPrice(variant.priceCents),
              priceCurrency: variant.currency || input.product.currency,
              availability:
                variant.inventoryCount > 0
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
            },
          }))
        : undefined,
  };
}

export function getCollectionJsonLd(input: {
  store: SeoStore;
  collection: Pick<ProductCollection, "description" | "slug" | "title">;
  products: Product[];
}) {
  const collectionUrl = getCollectionCanonicalUrl(input.store, input.collection);

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${collectionUrl}#collection`,
    name: input.collection.title,
    description:
      input.collection.description || getStoreSeoDescription(input.store),
    url: collectionUrl,
    mainEntity: {
      "@type": "ItemList",
      itemListElement: input.products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: getProductCanonicalUrl(input.store, product),
        name: product.name,
      })),
    },
  };
}
