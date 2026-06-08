import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search, ShoppingBag } from "lucide-react";

import {
  catalogAvailabilityOptions,
  catalogSortOptions,
  defaultStorefrontCatalogFilters,
  parseStorefrontCatalogFilters,
} from "@/features/commerce/catalog-filters";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getStoreSeoDescription,
  getStoreSeoTitle,
  getStoreSocialImages,
} from "@/features/commerce/seo";
import {
  filterStorefrontProducts,
  getStorefrontProductCategories,
  getStorefrontProductInventory,
} from "@/features/commerce/storefront-search";
import { formatCurrency } from "@/lib/utils";

type StoreSearchPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const availabilityLabels = {
  all: "All stock",
  available: "In stock",
  "sold-out": "Sold out",
} as const;

const sortLabels = {
  featured: "Featured",
  newest: "Newest",
  "price-asc": "Price low",
  "price-desc": "Price high",
  "name-asc": "Name A-Z",
} as const;

export async function generateMetadata({
  params,
}: StoreSearchPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Search not found",
      robots: {
        follow: false,
        index: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(workspace.store, "Search"),
    description: getStoreSeoDescription(workspace.store),
    robots: {
      follow: false,
      index: false,
    },
    openGraph: {
      title: getStoreSeoTitle(workspace.store, "Search"),
      description: getStoreSeoDescription(workspace.store),
      images: getStoreSocialImages(workspace.store, workspace.products[0]?.imageUrl),
    },
  };
}

export default async function StoreSearchPage({
  params,
  searchParams,
}: StoreSearchPageProps) {
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams || Promise.resolve({}),
  ]);
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products, navigationMenus } = workspace;
  const categories = getStorefrontProductCategories(products);
  const filters = parseStorefrontCatalogFilters(query);
  const selectedCategory =
    filters.category === "all" || categories.includes(filters.category)
      ? filters.category
      : defaultStorefrontCatalogFilters.category;
  const normalizedFilters = {
    ...filters,
    category: selectedCategory,
  };
  const results = filterStorefrontProducts({
    filters: normalizedFilters,
    products,
  });
  const hasQuery = Boolean(normalizedFilters.query.trim());

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        maxWidthClassName="max-w-7xl"
        menus={navigationMenus}
        store={store}
      />

      <section className="mx-auto max-w-7xl px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <section className="glass-panel p-5 sm:p-6">
          <span className="status-pill mb-4">
            <Search aria-hidden="true" size={14} />
            Store search
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-slate-950">
            Search {store.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Find products by name, category, SKU, variant, or product detail.
          </p>
        </section>

        <form
          className="soft-panel mt-5 grid gap-3 p-4 lg:grid-cols-[1fr_180px_180px_180px_auto]"
          method="get"
        >
          <label className="relative">
            <span className="sr-only">Search products</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="field pl-10"
              defaultValue={normalizedFilters.query}
              name="q"
              placeholder="Search products"
            />
          </label>

          <label>
            <span className="sr-only">Category</span>
            <select
              className="field"
              defaultValue={normalizedFilters.category}
              name="category"
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">Availability</span>
            <select
              className="field"
              defaultValue={normalizedFilters.availability}
              name="availability"
            >
              {catalogAvailabilityOptions.map((availability) => (
                <option key={availability} value={availability}>
                  {availabilityLabels[availability]}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="sr-only">Sort products</span>
            <select
              className="field"
              defaultValue={normalizedFilters.sort}
              name="sort"
            >
              {catalogSortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {sortLabels[sort]}
                </option>
              ))}
            </select>
          </label>

          <button className="primary-button px-4 text-sm" type="submit">
            <Search aria-hidden="true" size={16} />
            Search
          </button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-slate-600">
            {results.length} {results.length === 1 ? "result" : "results"}
            {hasQuery ? ` for "${normalizedFilters.query}"` : ""}
          </p>
          <Link
            className="secondary-button px-3 text-sm"
            href={`/stores/${store.slug}`}
          >
            Continue shopping
          </Link>
        </div>

        {results.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((product) => {
              const inventory = getStorefrontProductInventory(product);

              return (
                <article className="soft-panel overflow-hidden" key={product.id}>
                  <Link href={`/stores/${store.slug}/products/${product.slug}`}>
                    <Image
                      alt={product.name}
                      className="aspect-[4/3] w-full object-cover"
                      height={480}
                      sizes="(max-width: 640px) 100vw, 25vw"
                      src={product.imageUrl}
                      width={640}
                    />
                  </Link>
                  <div className="grid gap-3 p-4">
                    <div className="flex flex-wrap gap-2">
                      {product.category ? (
                        <span className="status-pill">{product.category}</span>
                      ) : null}
                      <span className="status-pill">
                        <ShoppingBag aria-hidden="true" size={14} />
                        {inventory} in stock
                      </span>
                    </div>
                    <div>
                      <Link
                        className="text-base font-semibold text-slate-950 hover:text-sky-700"
                        href={`/stores/${store.slug}/products/${product.slug}`}
                      >
                        {product.name}
                      </Link>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">
                        {product.description}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-950">
                        {product.variants.length > 0 ? "From " : ""}
                        {formatCurrency(product.priceCents, product.currency)}
                      </span>
                      <Link
                        className="secondary-button min-h-10 px-3 text-sm"
                        href={`/stores/${store.slug}/products/${product.slug}`}
                      >
                        View
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <section className="soft-panel mt-4 p-5">
            <h2 className="text-lg font-semibold text-slate-950">
              No products found
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Try a different search term, category, stock filter, or sort option.
            </p>
          </section>
        )}
      </section>

      <StorefrontFooter maxWidthClassName="max-w-7xl" menus={navigationMenus} />
    </main>
  );
}
