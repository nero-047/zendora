import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Package, Scale } from "lucide-react";

import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getCompareProducts,
  getProductCompareMetrics,
  parseCompareProductKeys,
} from "@/features/commerce/product-compare";
import { getStoreSeoTitle } from "@/features/commerce/seo";
import { formatCurrency } from "@/lib/utils";

type ComparePageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  params,
}: ComparePageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Compare products",
      robots: {
        follow: false,
        index: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(workspace.store, "Compare products"),
    robots: {
      follow: false,
      index: false,
    },
  };
}

export default async function StoreComparePage({
  params,
  searchParams,
}: ComparePageProps) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams ||
      Promise.resolve({} as Record<string, string | string[] | undefined>),
  ]);
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products, navigationMenus } = workspace;
  const keys = parseCompareProductKeys(query.products);
  const compareProducts = getCompareProducts({ keys, products });
  const metrics = getProductCompareMetrics(compareProducts);

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        menus={navigationMenus}
        store={store}
      />

      <section className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
        <div className="glass-panel p-5 sm:p-6">
          <span className="status-pill mb-4">
            <Scale aria-hidden="true" size={14} />
            Product comparison
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            Compare products
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
            Review price, stock, options, and product details side by side before
            choosing what to add to cart.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        {compareProducts.length > 0 ? (
          <div className="overflow-x-auto rounded-[8px] border border-white/70 bg-white/70 shadow-sm backdrop-blur">
            <table className="min-w-[760px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="w-44 bg-slate-50/80 p-4 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Compare
                  </th>
                  {compareProducts.map((product) => (
                    <th className="min-w-52 p-4 align-top" key={product.id}>
                      <Link
                        className="group grid gap-3"
                        href={`/stores/${store.slug}/products/${product.slug}`}
                      >
                        <Image
                          alt={product.name}
                          className="aspect-[4/3] w-full rounded-[8px] object-cover"
                          height={360}
                          sizes="(max-width: 768px) 70vw, 24vw"
                          src={product.imageUrl}
                          width={480}
                        />
                        <span className="flex items-center gap-2 text-base font-semibold text-slate-950 group-hover:text-sky-700">
                          <Package aria-hidden="true" size={16} />
                          {product.name}
                        </span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr className="border-b border-slate-200" key={metric.id}>
                    <th className="bg-slate-50/80 p-4 text-sm font-semibold text-slate-700">
                      {metric.label}
                    </th>
                    {compareProducts.map((product) => (
                      <td className="p-4 text-slate-600" key={product.id}>
                        {metric.id === "price"
                          ? formatCurrency(
                              Number(metric.values[product.id] || 0),
                              product.currency,
                            )
                          : metric.values[product.id]}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th className="bg-slate-50/80 p-4 text-sm font-semibold text-slate-700">
                    Details
                  </th>
                  {compareProducts.map((product) => (
                    <td className="p-4" key={product.id}>
                      <Link
                        className="secondary-button w-fit px-3 text-sm"
                        href={`/stores/${store.slug}/products/${product.slug}`}
                      >
                        View product
                        <ArrowRight aria-hidden="true" size={15} />
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="soft-panel p-5">
            <h2 className="text-lg font-semibold text-slate-950">
              No products to compare
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Published products will appear here when this store has an active
              catalog.
            </p>
          </div>
        )}
      </section>

      <StorefrontFooter menus={navigationMenus} />
    </main>
  );
}
