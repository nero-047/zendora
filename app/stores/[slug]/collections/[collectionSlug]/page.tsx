import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Layers3, ShoppingBag } from "lucide-react";

import { StorefrontCart } from "@/features/commerce/components/storefront-cart";
import { getPublicStorefront } from "@/features/commerce/data";
import type { Product } from "@/features/commerce/types";

type CollectionPageProps = {
  params: Promise<{ slug: string; collectionSlug: string }>;
};

async function getStoreCollection(slug: string, collectionSlug: string) {
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return null;
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

  return {
    title: `${data.collection.title} | ${data.store.name}`,
    description: data.collection.description || data.store.description,
    openGraph: {
      images: data.collection.imageUrl ? [data.collection.imageUrl] : undefined,
    },
  };
}

export default async function PublicCollectionPage({
  params,
}: CollectionPageProps) {
  const { slug, collectionSlug } = await params;
  const data = await getStoreCollection(slug, collectionSlug);

  if (!data) {
    notFound();
  }

  const { store, collection, products } = data;
  const heroImage = collection.imageUrl || products[0]?.imageUrl;

  return (
    <main className="liquid-bg min-h-screen">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link className="secondary-button px-3 text-sm" href={`/stores/${store.slug}`}>
          <ArrowLeft aria-hidden="true" size={16} />
          {store.name}
        </Link>
        <Link className="primary-button px-3 text-sm" href={`/stores/${store.slug}/checkout`}>
          <ShoppingBag aria-hidden="true" size={16} />
          Checkout
        </Link>
      </nav>

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

      <StorefrontCart products={products} storeSlug={store.slug} />
    </main>
  );
}
