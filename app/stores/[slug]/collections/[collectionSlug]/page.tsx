import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers3, Scale } from "lucide-react";

import { parseStorefrontCatalogFilters } from "@/features/commerce/catalog-filters";
import { StorefrontCart } from "@/features/commerce/components/storefront-cart";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getCollectionCanonicalUrl,
  getCollectionJsonLd,
  getStoreSeoDescription,
  getStoreSeoTitle,
  getStoreSocialImages,
  serializeJsonLd,
} from "@/features/commerce/seo";
import type { Product, ProductCollection } from "@/features/commerce/types";

type CollectionPageProps = {
  params: Promise<{ slug: string; collectionSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function getStoreCollection(slug: string, collectionSlug: string) {
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return null;
  }

  if (collectionSlug === "all") {
    const collection: ProductCollection = {
      id: `${workspace.store.id}-all-products`,
      storeId: workspace.store.id,
      title: "All products",
      slug: "all",
      description: `Browse every active product from ${workspace.store.name}.`,
      imageUrl: workspace.products[0]?.imageUrl,
      status: "active",
      sortOrder: 0,
      productIds: workspace.products.map((product) => product.id),
      productCount: workspace.products.length,
      createdAt: workspace.store.createdAt,
    };

    return {
      ...workspace,
      collection,
      products: workspace.products,
    };
  }

  const collection = workspace.collections.find(
    (item) => item.slug === collectionSlug && item.status === "active",
  );

  if (!collection) {
    return null;
  }

  const productsById = new Map(
    workspace.products.map((product) => [product.id, product]),
  );
  const collectionProducts = collection.productIds
    .map((productId) => productsById.get(productId))
    .filter((product): product is Product => Boolean(product));

  return {
    ...workspace,
    collection,
    products: collectionProducts,
  };
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug, collectionSlug } = await params;
  const data = await getStoreCollection(slug, collectionSlug);

  if (!data) {
    return {
      title: "Collection not found",
    };
  }

  const canonicalUrl = getCollectionCanonicalUrl(data.store, data.collection);
  const title = getStoreSeoTitle(data.store, data.collection.title);
  const description =
    data.collection.description || getStoreSeoDescription(data.store);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: getStoreSocialImages(data.store, data.collection.imageUrl),
    },
  };
}

export default async function PublicCollectionPage({
  params,
  searchParams,
}: CollectionPageProps) {
  const [{ slug, collectionSlug }, query] = await Promise.all([
    params,
    searchParams || Promise.resolve({}),
  ]);
  const data = await getStoreCollection(slug, collectionSlug);

  if (!data) {
    notFound();
  }

  const { store, collection, products, navigationMenus } = data;
  const heroImage = collection.imageUrl || products[0]?.imageUrl;
  const catalogFilters = parseStorefrontCatalogFilters(query);
  const compareHref = `/stores/${store.slug}/compare?products=${products
    .slice(0, 4)
    .map((product) => encodeURIComponent(product.slug))
    .join(",")}`;
  const collectionJsonLd = getCollectionJsonLd({
    store,
    collection,
    products,
  });

  return (
    <main className="liquid-bg min-h-screen">
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }}
        type="application/ld+json"
      />
      <StorefrontHeader
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        menus={navigationMenus}
        store={store}
      />

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:px-8">
        <div className="self-center">
          <span className="status-pill mb-4">
            <Layers3 aria-hidden="true" size={14} />
            {collection.productCount} products
          </span>
          <h1 className="text-5xl font-semibold leading-[1.04] text-slate-950 sm:text-6xl">
            {collection.title}
          </h1>
          {collection.description ? (
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              {collection.description}
            </p>
          ) : null}
          {products.length > 1 ? (
            <Link className="secondary-button mt-5 w-fit px-4" href={compareHref}>
              <Scale aria-hidden="true" size={16} />
              Compare products
            </Link>
          ) : null}
        </div>
        {heroImage ? (
          <div className="hero-device p-3">
            <Image
              alt={collection.title}
              className="aspect-[5/4] w-full rounded-[8px] object-cover"
              height={1120}
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              src={heroImage}
              width={1400}
            />
          </div>
        ) : null}
      </section>

      <StorefrontCart
        initialFilters={catalogFilters}
        products={products}
        storeSlug={store.slug}
      />
      <StorefrontFooter menus={navigationMenus} />
    </main>
  );
}
