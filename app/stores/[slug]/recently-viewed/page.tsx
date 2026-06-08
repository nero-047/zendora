import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RecentlyViewedProductsPage } from "@/features/commerce/components/recently-viewed-products-page";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import { getStoreSeoTitle } from "@/features/commerce/seo";

type RecentlyViewedPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: RecentlyViewedPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  return {
    title: workspace
      ? getStoreSeoTitle(workspace.store, "Recently viewed")
      : "Recently viewed",
    robots: {
      follow: false,
      index: false,
    },
  };
}

export default async function RecentlyViewedPage({
  params,
}: RecentlyViewedPageProps) {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products, navigationMenus } = workspace;

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        menus={navigationMenus}
        store={store}
      />
      <RecentlyViewedProductsPage
        products={products}
        storeName={store.name}
        storeSlug={store.slug}
      />
      <StorefrontFooter menus={navigationMenus} />
    </main>
  );
}
