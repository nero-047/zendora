"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, Trash2 } from "lucide-react";

import { useRecentlyViewedProducts } from "@/features/commerce/components/recently-viewed-store";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

export function RecentlyViewedProductsPage({
  products,
  storeName,
  storeSlug,
}: {
  products: Product[];
  storeName: string;
  storeSlug: string;
}) {
  const { clearRecentlyViewed, productIds, recentlyViewedProducts } =
    useRecentlyViewedProducts(storeSlug, products);

  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
      <section className="glass-panel p-5 sm:p-6">
        <span className="status-pill mb-4">
          <Clock aria-hidden="true" size={14} />
          {productIds.length} viewed
        </span>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold leading-tight text-slate-950">
              Recently viewed
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Products you opened from {storeName} stay in this browser so you
              can quickly return to them.
            </p>
          </div>
          {recentlyViewedProducts.length > 0 ? (
            <button
              className="secondary-button px-3 text-sm"
              onClick={clearRecentlyViewed}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
              Clear history
            </button>
          ) : null}
        </div>
      </section>

      {recentlyViewedProducts.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recentlyViewedProducts.map((product) => (
            <article className="soft-panel overflow-hidden" key={product.id}>
              <Link href={`/stores/${storeSlug}/products/${product.slug}`}>
                <Image
                  alt={product.name}
                  className="aspect-[4/3] w-full object-cover"
                  height={420}
                  sizes="(max-width: 640px) 100vw, 33vw"
                  src={product.imageUrl}
                  width={560}
                />
              </Link>
              <div className="grid gap-3 p-4">
                <div>
                  <Link
                    className="text-base font-semibold text-slate-950 hover:text-sky-700"
                    href={`/stores/${storeSlug}/products/${product.slug}`}
                  >
                    {product.name}
                  </Link>
                  <p className="mt-1 text-sm font-semibold text-slate-700">
                    {formatCurrency(product.priceCents, product.currency)}
                  </p>
                  {product.category ? (
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      {product.category}
                    </p>
                  ) : null}
                </div>
                <Link
                  className="secondary-button min-h-10 px-3 text-sm"
                  href={`/stores/${storeSlug}/products/${product.slug}`}
                >
                  View product
                  <ArrowRight aria-hidden="true" size={15} />
                </Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="soft-panel p-5">
          <h2 className="text-lg font-semibold text-slate-950">
            Viewed products
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Open product pages while browsing and they will appear here for a
            quick return path.
          </p>
          <Link
            className="primary-button mt-4 w-fit px-4 text-sm"
            href={`/stores/${storeSlug}`}
          >
            Continue shopping
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </section>
      )}
    </section>
  );
}
