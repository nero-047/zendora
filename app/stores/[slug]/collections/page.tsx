import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Layers3, Package } from "lucide-react";

import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getPublicBaseUrl,
  getStoreSeoDescription,
  getStoreSeoTitle,
  getStoreSocialImages,
} from "@/features/commerce/seo";

type StoreCollectionsPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: StoreCollectionsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Collections not found",
    };
  }

  const title = getStoreSeoTitle(workspace.store, "Collections");
  const description =
    workspace.collections[0]?.description || getStoreSeoDescription(workspace.store);
  const canonicalUrl = `${getPublicBaseUrl()}/stores/${workspace.store.slug}/collections`;

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
      images: getStoreSocialImages(
        workspace.store,
        workspace.collections[0]?.imageUrl || workspace.products[0]?.imageUrl,
      ),
    },
  };
}

export default async function StoreCollectionsPage({
  params,
}: StoreCollectionsPageProps) {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products, collections, navigationMenus } = workspace;
  const heroImage = collections[0]?.imageUrl || products[0]?.imageUrl;
  const allProductsDescription = `Browse every active product from ${store.name}.`;

  return (
    <main className="liquid-bg min-h-screen">
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
            {collections.length + 1} collections
          </span>
          <h1 className="text-5xl font-semibold leading-[1.04] text-slate-950 sm:text-6xl">
            Shop collections
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            Move through {store.name} by collection, or open the complete catalog
            when you want everything in one view.
          </p>
        </div>
        {heroImage ? (
          <div className="hero-device p-3">
            <Image
              alt={`${store.name} collections`}
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

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link
            className="soft-panel grid min-h-56 gap-3 p-5 hover:border-sky-200"
            href={`/stores/${store.slug}/collections/all`}
          >
            <span className="status-pill w-fit">
              <Package aria-hidden="true" size={14} />
              {products.length} products
            </span>
            <span className="text-xl font-semibold text-slate-950">
              All products
            </span>
            <span className="line-clamp-3 text-sm leading-6 text-slate-600">
              {allProductsDescription}
            </span>
            <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
              View collection
              <ArrowRight aria-hidden="true" size={16} />
            </span>
          </Link>

          {collections.map((collection) => (
            <Link
              className="soft-panel grid min-h-56 gap-3 overflow-hidden p-5 hover:border-sky-200"
              href={`/stores/${store.slug}/collections/${collection.slug}`}
              key={collection.id}
            >
              <span className="status-pill w-fit">
                <Layers3 aria-hidden="true" size={14} />
                {collection.productCount} products
              </span>
              <span className="text-xl font-semibold text-slate-950">
                {collection.title}
              </span>
              {collection.description ? (
                <span className="line-clamp-3 text-sm leading-6 text-slate-600">
                  {collection.description}
                </span>
              ) : null}
              <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
                View collection
                <ArrowRight aria-hidden="true" size={16} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <StorefrontFooter menus={navigationMenus} />
    </main>
  );
}
