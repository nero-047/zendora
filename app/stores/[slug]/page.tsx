import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Layers3, Sparkles } from "lucide-react";

import { StorefrontCart } from "@/features/commerce/components/storefront-cart";
import { NewsletterSignupForm } from "@/features/commerce/components/newsletter-signup-form";
import { parseStorefrontCatalogFilters } from "@/features/commerce/catalog-filters";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getStoreCanonicalUrl,
  getStoreJsonLd,
  getStoreSeoDescription,
  getStoreSeoTitle,
  getStoreSocialImages,
  serializeJsonLd,
} from "@/features/commerce/seo";

type PublicStorePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: PublicStorePageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Store not found",
    };
  }

  const heroProduct = workspace.products[0];
  const canonicalUrl = getStoreCanonicalUrl(workspace.store);

  return {
    title: getStoreSeoTitle(workspace.store),
    description: getStoreSeoDescription(workspace.store),
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: getStoreSeoTitle(workspace.store),
      description: getStoreSeoDescription(workspace.store),
      url: canonicalUrl,
      images: getStoreSocialImages(workspace.store, heroProduct?.imageUrl),
    },
  };
}

export default async function PublicStorePage({
  params,
  searchParams,
}: PublicStorePageProps) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams || Promise.resolve({}),
  ]);
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products, collections, navigationMenus } = workspace;
  const heroProduct = products[0];
  const catalogFilters = parseStorefrontCatalogFilters(query);
  const storeJsonLd = getStoreJsonLd({ store, products });

  return (
    <main className="liquid-bg min-h-screen">
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(storeJsonLd) }}
        type="application/ld+json"
      />
      <StorefrontHeader menus={navigationMenus} store={store} />

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-10 pt-8 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="self-center">
          <span className="status-pill mb-4">
            <Sparkles aria-hidden="true" size={14} />
            {store.status}
          </span>
          <h1 className="text-5xl font-semibold leading-[1.04] text-slate-950 sm:text-6xl">
            {store.name}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            {store.description || "Premium goods curated through Zendora."}
          </p>
        </div>
        {heroProduct ? (
          <div className="hero-device p-3">
            <Image
              alt={heroProduct.name}
              className="aspect-[5/4] w-full rounded-[8px] object-cover"
              height={1120}
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              src={heroProduct.imageUrl}
              width={1400}
            />
          </div>
        ) : null}
      </section>

      {collections.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
          <div className="mb-4 flex items-center gap-2">
            <Layers3 aria-hidden="true" className="text-sky-700" size={18} />
            <h2 className="text-lg font-semibold text-slate-950">Collections</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {collections.map((collection) => (
              <Link
                className="soft-panel grid gap-2 p-4 hover:border-sky-200"
                href={`/stores/${store.slug}/collections/${collection.slug}`}
                key={collection.id}
              >
                <span className="status-pill w-fit">
                  {collection.productCount} products
                </span>
                <span className="text-lg font-semibold text-slate-950">
                  {collection.title}
                </span>
                {collection.description ? (
                  <span className="line-clamp-2 text-sm leading-6 text-slate-600">
                    {collection.description}
                  </span>
                ) : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <StorefrontCart
        initialFilters={catalogFilters}
        products={products}
        storeSlug={store.slug}
      />

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
        <NewsletterSignupForm storeName={store.name} storeSlug={store.slug} />
      </section>

      <StorefrontFooter menus={navigationMenus} />
    </main>
  );
}
