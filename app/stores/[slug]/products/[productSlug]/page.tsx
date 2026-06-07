import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, ShoppingBag } from "lucide-react";

import { ProductDetailActions } from "@/features/commerce/components/product-detail-actions";
import { getPublicStorefront } from "@/features/commerce/data";
import { getStoreSeoTitle, getStoreSocialImages } from "@/features/commerce/seo";
import { formatCurrency } from "@/lib/utils";

type ProductPageProps = {
  params: Promise<{ slug: string; productSlug: string }>;
};

async function getStoreProduct(slug: string, productSlug: string) {
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return null;
  }

  const product = workspace.products.find((item) => item.slug === productSlug);

  if (!product) {
    return null;
  }

  return {
    ...workspace,
    product,
  };
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug, productSlug } = await params;
  const data = await getStoreProduct(slug, productSlug);

  if (!data) {
    return {
      title: "Product not found",
    };
  }

  return {
    title: getStoreSeoTitle(data.store, data.product.name),
    description: data.product.description,
    openGraph: {
      title: getStoreSeoTitle(data.store, data.product.name),
      description: data.product.description,
      images: getStoreSocialImages(data.store, data.product.imageUrl),
    },
  };
}

export default async function PublicProductPage({ params }: ProductPageProps) {
  const { slug, productSlug } = await params;
  const data = await getStoreProduct(slug, productSlug);

  if (!data) {
    notFound();
  }

  const { store, product, products } = data;
  const relatedProducts = products
    .filter(
      (item) =>
        item.id !== product.id &&
        product.category &&
        item.category === product.category,
    )
    .slice(0, 3);

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

      <section className="mx-auto grid max-w-7xl gap-8 px-4 pb-12 pt-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
        <div className="hero-device p-3">
          <Image
            alt={product.name}
            className="aspect-[5/4] w-full rounded-[8px] object-cover"
            height={1120}
            priority
            sizes="(max-width: 1024px) 100vw, 55vw"
            src={product.imageUrl}
            width={1400}
          />
        </div>

        <div className="self-center">
          <div className="mb-4 flex flex-wrap gap-2">
            {product.category ? <span className="status-pill">{product.category}</span> : null}
            {product.sku ? <span className="status-pill">{product.sku}</span> : null}
          </div>
          <h1 className="text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            {product.name}
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-600">
            {product.description}
          </p>
          <div className="mt-6">
            <ProductDetailActions
              product={product}
              products={products}
              storeSlug={store.slug}
            />
          </div>
        </div>
      </section>

      {relatedProducts.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
          <h2 className="mb-4 text-lg font-semibold text-slate-950">Related products</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {relatedProducts.map((item) => (
              <Link
                className="soft-panel grid gap-3 overflow-hidden"
                href={`/stores/${store.slug}/products/${item.slug}`}
                key={item.id}
              >
                <Image
                  alt={item.name}
                  className="product-image"
                  height={675}
                  sizes="(max-width: 768px) 100vw, 33vw"
                  src={item.imageUrl}
                  width={900}
                />
                <div className="p-4 pt-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                    <Package aria-hidden="true" size={16} />
                    {item.name}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-700">
                    {formatCurrency(item.priceCents, item.currency)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
