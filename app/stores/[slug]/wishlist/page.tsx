import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StorefrontWishlistPage } from "@/features/commerce/components/storefront-wishlist-page";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import { getStoreSeoTitle } from "@/features/commerce/seo";

type WishlistPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: WishlistPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  return {
    title: workspace
      ? getStoreSeoTitle(workspace.store, "Wishlist")
      : "Wishlist",
    robots: {
      follow: false,
      index: false,
    },
  };
}

export default async function WishlistPage({ params }: WishlistPageProps) {
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
      <StorefrontWishlistPage
        products={products}
        storeName={store.name}
        storeSlug={store.slug}
      />
      <StorefrontFooter menus={navigationMenus} />
    </main>
  );
}
