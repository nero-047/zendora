"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Scale,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  defaultStorefrontCatalogFilters,
  hasActiveStorefrontCatalogFilters,
  serializeStorefrontCatalogFilters,
  type StorefrontCatalogFilters,
} from "@/features/commerce/catalog-filters";
import { getCheckoutPermalink } from "@/features/commerce/cart-permalinks";
import { useStoreCart } from "@/features/commerce/components/cart-store";
import { WishlistButton } from "@/features/commerce/components/wishlist-button";
import { getProductCardCompareHref } from "@/features/commerce/product-card-actions";
import type { Product } from "@/features/commerce/types";
import { formatCurrency } from "@/lib/utils";

type StorefrontCartProps = {
  storeSlug: string;
  products: Product[];
  initialFilters?: StorefrontCatalogFilters;
};

function getAvailableInventory(product: Product) {
  const activeVariants = product.variants.filter(
    (variant) => variant.status === "active",
  );

  return activeVariants.length > 0
    ? activeVariants.reduce((sum, variant) => sum + variant.inventoryCount, 0)
    : product.inventoryCount;
}

export function StorefrontCart({
  storeSlug,
  products,
  initialFilters = defaultStorefrontCatalogFilters,
}: StorefrontCartProps) {
  const { cart, cartItems, updateQuantity } = useStoreCart(storeSlug, products);
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = cartItems.reduce(
    (sum, item) =>
      sum + (item.variant?.priceCents ?? item.product.priceCents) * item.quantity,
    0,
  );
  const currency = products[0]?.currency || "USD";
  const categories = useMemo(
    () => [
      ...new Set(
        products
          .map((product) => product.category)
          .filter((item): item is string => Boolean(item)),
      ),
    ].sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const normalizedInitialFilters = useMemo<StorefrontCatalogFilters>(
    () => ({
      query: initialFilters.query.trim().slice(0, 80),
      category:
        initialFilters.category === "all" ||
        categories.includes(initialFilters.category)
          ? initialFilters.category
          : "all",
      availability: initialFilters.availability,
      sort: initialFilters.sort,
    }),
    [categories, initialFilters],
  );
  const [query, setQuery] = useState(normalizedInitialFilters.query);
  const [category, setCategory] = useState(normalizedInitialFilters.category);
  const [availability, setAvailability] = useState(
    normalizedInitialFilters.availability,
  );
  const [sort, setSort] = useState(normalizedInitialFilters.sort);
  const currentFilters = useMemo<StorefrontCatalogFilters>(
    () => ({
      query,
      category,
      availability,
      sort,
    }),
    [availability, category, query, sort],
  );
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = products.filter((product) => {
      const availableInventory = getAvailableInventory(product);
      const matchesCategory = category === "all" || product.category === category;
      const matchesAvailability =
        availability === "all" ||
        (availability === "available" && availableInventory > 0) ||
        (availability === "sold-out" && availableInventory === 0);
      const searchableText = [
        product.name,
        product.description,
        product.category,
        product.sku,
        ...product.variants.map((variant) => variant.sku),
        ...product.variants.map((variant) => variant.optionValue),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        matchesCategory &&
        matchesAvailability &&
        searchableText.includes(normalizedQuery)
      );
    });

    return [...filtered].sort((a, b) => {
      if (sort === "price-asc") {
        return a.priceCents - b.priceCents || a.name.localeCompare(b.name);
      }

      if (sort === "price-desc") {
        return b.priceCents - a.priceCents || a.name.localeCompare(b.name);
      }

      if (sort === "name-asc") {
        return a.name.localeCompare(b.name);
      }

      if (sort === "newest") {
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          a.name.localeCompare(b.name)
        );
      }

      return 0;
    });
  }, [availability, category, products, query, sort]);
  const hasActiveFilters = hasActiveStorefrontCatalogFilters(currentFilters);
  const checkoutHref = getCheckoutPermalink(storeSlug, cart);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filterParams = new URLSearchParams(
      serializeStorefrontCatalogFilters(currentFilters),
    );

    for (const key of ["q", "category", "availability", "sort"]) {
      params.delete(key);
    }

    for (const [key, value] of filterParams.entries()) {
      params.set(key, value);
    }

    const queryString = params.toString();
    const pathname = window.location.pathname;
    const nextHref = queryString ? `${pathname}?${queryString}` : pathname;
    const currentHref = `${window.location.pathname}${window.location.search}`;

    if (currentHref !== nextHref) {
      window.history.replaceState(null, "", nextHref);
    }
  }, [currentFilters]);

  function clearFilters() {
    setQuery(defaultStorefrontCatalogFilters.query);
    setCategory(defaultStorefrontCatalogFilters.category);
    setAvailability(defaultStorefrontCatalogFilters.availability);
    setSort(defaultStorefrontCatalogFilters.sort);
  }

  function addProduct(product: Product) {
    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );
    const defaultVariant =
      activeVariants.find((variant) => variant.inventoryCount > 0) ||
      activeVariants[0];
    const current = cart.find(
      (line) =>
        line.productId === product.id &&
        (line.variantId || "") === (defaultVariant?.id || ""),
    );

    updateQuantity(product.id, (current?.quantity || 0) + 1, defaultVariant?.id);
  }

  return (
    <section className="mx-auto grid max-w-7xl gap-6 px-4 pb-20 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
      <div className="grid gap-4">
        <div className="soft-panel grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="status-pill">
              <SlidersHorizontal aria-hidden="true" size={14} />
              {filteredProducts.length} of {products.length} products
            </span>
            {hasActiveFilters ? (
              <button
                className="secondary-button min-h-10 px-3 text-sm"
                onClick={clearFilters}
                type="button"
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_180px_180px_180px]">
            <label className="relative">
              <span className="sr-only">Search products</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                className="field pl-10"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products"
                value={query}
              />
            </label>

            <label>
              <span className="sr-only">Category</span>
              <select
                className="field"
                onChange={(event) => setCategory(event.target.value)}
                value={category}
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Availability</span>
              <select
                className="field"
                onChange={(event) =>
                  setAvailability(
                    event.target
                      .value as StorefrontCatalogFilters["availability"],
                  )
                }
                value={availability}
              >
                <option value="all">All stock</option>
                <option value="available">In stock</option>
                <option value="sold-out">Sold out</option>
              </select>
            </label>

            <label>
              <span className="sr-only">Sort products</span>
              <select
                className="field"
                onChange={(event) =>
                  setSort(event.target.value as StorefrontCatalogFilters["sort"])
                }
                value={sort}
              >
                <option value="featured">Featured</option>
                <option value="newest">Newest</option>
                <option value="price-asc">Price low</option>
                <option value="price-desc">Price high</option>
                <option value="name-asc">Name A-Z</option>
              </select>
            </label>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product) => {
            const activeVariants = product.variants.filter(
              (variant) => variant.status === "active",
            );
            const defaultVariant =
              activeVariants.find((variant) => variant.inventoryCount > 0) ||
              activeVariants[0];
            const cartLine = cart.find(
              (line) =>
                line.productId === product.id &&
                (line.variantId || "") === (defaultVariant?.id || ""),
            );
            const selectedQuantity = cartLine?.quantity || 0;
            const inventoryCount =
              defaultVariant?.inventoryCount ?? product.inventoryCount;
            const availableInventory = getAvailableInventory(product);
            const isSoldOut = inventoryCount === 0;
            const compareHref = getProductCardCompareHref({
              product,
              products: filteredProducts,
              storeSlug,
            });

            return (
              <article className="soft-panel overflow-hidden" key={product.id}>
                <Link href={`/stores/${storeSlug}/products/${product.slug}`}>
                  <Image
                    alt={product.name}
                    className="product-image"
                    height={675}
                    sizes="(max-width: 768px) 100vw, 33vw"
                    src={product.imageUrl}
                    width={900}
                  />
                </Link>
                <div className="p-4">
                  {product.category ? (
                    <span className="status-pill mb-3">{product.category}</span>
                  ) : null}
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      className="font-semibold text-slate-950 hover:text-sky-700"
                      href={`/stores/${storeSlug}/products/${product.slug}`}
                    >
                      {product.name}
                    </Link>
                    <span className="text-sm font-semibold text-slate-950">
                      {activeVariants.length > 0 ? "From " : ""}
                      {formatCurrency(product.priceCents, product.currency)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">
                    {product.description}
                  </p>
                  <div className="mt-4 grid gap-2">
                    {selectedQuantity > 0 ? (
                      <div className="grid grid-cols-[44px_1fr_44px] overflow-hidden rounded-[8px] border border-slate-200 bg-white/70">
                        <button
                          aria-label={`Remove one ${product.name}`}
                          className="grid h-11 place-items-center text-slate-700"
                          onClick={() =>
                            updateQuantity(
                              product.id,
                              selectedQuantity - 1,
                              defaultVariant?.id,
                            )
                          }
                          type="button"
                        >
                          <Minus aria-hidden="true" size={16} />
                        </button>
                        <span className="grid h-11 place-items-center text-sm font-semibold text-slate-950">
                          {selectedQuantity}
                        </span>
                        <button
                          aria-label={`Add one ${product.name}`}
                          className="grid h-11 place-items-center text-slate-700 disabled:text-slate-300"
                          disabled={selectedQuantity >= inventoryCount}
                          onClick={() =>
                            updateQuantity(
                              product.id,
                              selectedQuantity + 1,
                              defaultVariant?.id,
                            )
                          }
                          type="button"
                        >
                          <Plus aria-hidden="true" size={16} />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="primary-button w-full px-3 text-sm disabled:cursor-not-allowed disabled:opacity-55"
                        disabled={isSoldOut}
                        onClick={() => addProduct(product)}
                        type="button"
                      >
                        <ShoppingBag aria-hidden="true" size={16} />
                        {isSoldOut ? "Sold out" : "Add to cart"}
                      </button>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <WishlistButton
                        product={product}
                        products={products}
                        storeSlug={storeSlug}
                      />
                      <Link className="secondary-button w-full px-3 text-sm" href={compareHref}>
                        <Scale aria-hidden="true" size={15} />
                        Compare
                      </Link>
                    </div>
                  </div>
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    {[
                      `${availableInventory} in stock`,
                      activeVariants.length > 0
                        ? `${activeVariants.length} variants`
                        : product.sku,
                    ]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
        {filteredProducts.length === 0 ? (
          <div className="soft-panel p-5 text-sm text-slate-500">
            No products match the current filters.
          </div>
        ) : null}
      </div>

      <aside className="soft-panel h-fit p-4 lg:sticky lg:top-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">Cart</h2>
          <span className="status-pill">{cartCount} items</span>
        </div>

        <div className="mt-4 grid gap-3">
          {cartItems.length > 0 ? (
            cartItems.map((item) => (
              <div
                className="grid grid-cols-[1fr_auto] gap-3"
                key={`${item.productId}:${item.variantId || ""}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {item.product.name}
                  </p>
                  {item.variant ? (
                    <p className="truncate text-xs text-slate-500">
                      {item.variant.optionName}: {item.variant.optionValue}
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    {formatCurrency(
                      item.variant?.priceCents ?? item.product.priceCents,
                      item.product.currency,
                    )}{" "}
                    x {item.quantity}
                  </p>
                </div>
                <button
                  aria-label={`Remove ${item.product.name}`}
                  className="icon-button h-10 min-h-10 w-10"
                  onClick={() => updateQuantity(item.productId, 0, item.variantId)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={16} />
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm leading-6 text-slate-500">
              Add products to start an order.
            </p>
          )}
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-500">Total</span>
            <span className="text-xl font-semibold text-slate-950">
              {formatCurrency(totalCents, currency)}
            </span>
          </div>

          {cartItems.length > 0 ? (
            <Link
              className="primary-button mt-4 w-full px-3 text-sm"
              href={checkoutHref}
            >
              Checkout
              <ArrowRight aria-hidden="true" size={16} />
            </Link>
          ) : (
            <button
              className="primary-button mt-4 w-full px-3 text-sm opacity-55"
              disabled
              type="button"
            >
              Checkout
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          )}
        </div>
      </aside>
    </section>
  );
}
