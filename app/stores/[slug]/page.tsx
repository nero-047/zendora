import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ShoppingBag, Sparkles } from "lucide-react";

import { StorefrontCart } from "@/features/commerce/components/storefront-cart";
import { getPublicStorefront } from "@/features/commerce/data";

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

      <StorefrontCart products={products} storeSlug={store.slug} />
    </main>
  );
}
