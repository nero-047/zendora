import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingBag, Sparkles } from "lucide-react";

import { getPublicStorefront } from "@/features/commerce/data";
import { formatCurrency } from "@/lib/utils";

export default async function PublicStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products } = workspace;
  const heroProduct = products[0];

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

      <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-20 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {products.map((product) => (
          <article className="soft-panel overflow-hidden" key={product.id}>
            <Image
              alt={product.name}
              className="product-image"
              height={675}
              sizes="(max-width: 768px) 100vw, 25vw"
              src={product.imageUrl}
              width={900}
            />
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-semibold text-slate-950">{product.name}</h2>
                <span className="text-sm font-semibold text-slate-950">
                  {formatCurrency(product.priceCents, product.currency)}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{product.description}</p>
              <button className="primary-button mt-4 w-full px-3 text-sm" type="button">
                <ShoppingBag aria-hidden="true" size={16} />
                Add to cart
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
