import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers3, ShoppingBag, Sparkles } from "lucide-react";

import { StorefrontCart } from "@/features/commerce/components/storefront-cart";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getPolicyHref,
  getPublishedPolicies,
  storePolicyLabels,
} from "@/features/commerce/policies";
import {
  getStoreSeoDescription,
  getStoreSeoTitle,
  getStoreSocialImages,
} from "@/features/commerce/seo";

type PublicStorePageProps = {
  params: Promise<{ slug: string }>;
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

  return {
    title: getStoreSeoTitle(workspace.store),
    description: getStoreSeoDescription(workspace.store),
    openGraph: {
      title: getStoreSeoTitle(workspace.store),
      description: getStoreSeoDescription(workspace.store),
      images: getStoreSocialImages(workspace.store, heroProduct?.imageUrl),
    },
  };
}

export default async function PublicStorePage({
  params,
}: PublicStorePageProps) {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products, collections, policies } = workspace;
  const heroProduct = products[0];
  const publishedPolicies = getPublishedPolicies(policies);

  return (
    <main className="liquid-bg min-h-screen">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link className="secondary-button px-3 text-sm" href="/">
          <ArrowLeft aria-hidden="true" size={16} />
          Zendora
        </Link>
        <Link className="primary-button px-3 text-sm" href="/dashboard">
          <ShoppingBag aria-hidden="true" size={16} />
          Merchant admin
        </Link>
      </nav>

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

      <StorefrontCart products={products} storeSlug={store.slug} />

      {publishedPolicies.length > 0 ? (
        <footer className="mx-auto flex max-w-7xl flex-wrap gap-3 px-4 pb-10 sm:px-6 lg:px-8">
          {publishedPolicies.map((policy) => (
            <Link
              className="text-sm font-semibold text-slate-600 hover:text-slate-950"
              href={getPolicyHref(store.slug, policy.type)}
              key={policy.id}
            >
              {storePolicyLabels[policy.type]}
            </Link>
          ))}
        </footer>
      ) : null}
    </main>
  );
}
