import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, Star } from "lucide-react";

import { ProductDetailActions } from "@/features/commerce/components/product-detail-actions";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import { getProductReviewSummary } from "@/features/commerce/reviews";
import {
  getProductCanonicalUrl,
  getProductJsonLd,
  getStoreSeoTitle,
  getStoreSocialImages,
  serializeJsonLd,
} from "@/features/commerce/seo";
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

  const canonicalUrl = getProductCanonicalUrl(data.store, data.product);
  const title = getStoreSeoTitle(data.store, data.product.name);

  return {
    title,
    description: data.product.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description: data.product.description,
      url: canonicalUrl,
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

  const { store, product, products, productReviews, navigationMenus } = data;
  const reviews = productReviews.filter((review) => review.productId === product.id);
  const reviewSummary = getProductReviewSummary(reviews);
  const productJsonLd = getProductJsonLd({ store, product, reviewSummary });
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
      <script
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }}
        type="application/ld+json"
      />
      <StorefrontHeader
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        menus={navigationMenus}
        store={store}
      />

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
            {reviewSummary.reviewCount > 0 ? (
              <span className="status-pill">
                <Star aria-hidden="true" size={14} />
                {reviewSummary.averageRating} / {reviewSummary.reviewCount} reviews
              </span>
            ) : null}
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

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Customer reviews</h2>
            <p className="mt-1 text-sm text-slate-500">
              {reviewSummary.reviewCount > 0
                ? `${reviewSummary.averageRating} average rating`
                : "Reviews appear after verified customers submit feedback."}
            </p>
          </div>
          {reviewSummary.reviewCount > 0 ? (
            <span className="status-pill">
              <Star aria-hidden="true" size={14} />
              {reviewSummary.reviewCount} approved
            </span>
          ) : null}
        </div>
        {reviews.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {reviews.slice(0, 6).map((review) => (
              <article className="soft-panel p-4" key={review.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-slate-950">
                    {Array.from({ length: 5 }, (_, index) => (
                      <Star
                        aria-hidden="true"
                        className={
                          index < review.rating
                            ? "fill-slate-950 text-slate-950"
                            : "text-slate-300"
                        }
                        key={index}
                        size={15}
                      />
                    ))}
                  </div>
                  <time
                    className="text-xs font-semibold text-slate-500"
                    dateTime={review.reviewedAt}
                  >
                    {new Date(review.reviewedAt).toLocaleDateString("en-US")}
                  </time>
                </div>
                {review.title ? (
                  <h3 className="mt-3 text-sm font-semibold text-slate-950">
                    {review.title}
                  </h3>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {review.body}
                </p>
                <p className="mt-3 text-xs font-semibold text-slate-500">
                  {review.customerName}
                </p>
                {review.merchantReply ? (
                  <p className="mt-3 rounded-[8px] bg-white/75 p-3 text-sm leading-6 text-slate-600">
                    {review.merchantReply}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="soft-panel p-4 text-sm text-slate-500">
            No approved reviews yet.
          </p>
        )}
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
      <StorefrontFooter menus={navigationMenus} />
    </main>
  );
}
