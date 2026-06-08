import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StorefrontCartPage } from "@/features/commerce/components/storefront-cart-page";
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

type StoreCartPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: StoreCartPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Cart not found",
      robots: {
        follow: false,
        index: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(workspace.store, "Cart"),
    description: getStoreSeoDescription(workspace.store),
    robots: {
      follow: false,
      index: false,
    },
    openGraph: {
      title: getStoreSeoTitle(workspace.store, "Cart"),
      description: getStoreSeoDescription(workspace.store),
      images: getStoreSocialImages(workspace.store, workspace.products[0]?.imageUrl),
    },
  };
}

export default async function StoreCartPage({ params }: StoreCartPageProps) {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, products, shippingZones, navigationMenus } = workspace;

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        action="continue"
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        maxWidthClassName="max-w-6xl"
        menus={navigationMenus}
        store={store}
      />
      <StorefrontCartPage
        freeShippingThresholdCents={store.freeShippingThresholdCents}
        products={products}
        shippingRateCents={store.shippingRateCents}
        shippingZones={shippingZones}
        storeName={store.name}
        storeSlug={store.slug}
        taxRateBps={store.taxRateBps}
      />
      <StorefrontFooter maxWidthClassName="max-w-6xl" menus={navigationMenus} />
    </main>
  );
}
