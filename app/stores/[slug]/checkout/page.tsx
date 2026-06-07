import { randomBytes } from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { parseCartPermalinkLines } from "@/features/commerce/cart-permalinks";
import { CheckoutForm } from "@/features/commerce/components/checkout-form";
import { StorefrontFooter } from "@/features/commerce/components/storefront-navigation";
import {
  getPublicAbandonedCheckout,
  getPublicStorefront,
} from "@/features/commerce/data";
import {
  getStoreSeoDescription,
  getStoreSeoTitle,
  getStoreSocialImages,
} from "@/features/commerce/seo";

type CheckoutPageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    cart?: string | string[];
    recovery?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: CheckoutPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Checkout not found",
    };
  }

  return {
    title: getStoreSeoTitle(workspace.store, "Checkout"),
    description: getStoreSeoDescription(workspace.store),
    openGraph: {
      title: getStoreSeoTitle(workspace.store, "Checkout"),
      description: getStoreSeoDescription(workspace.store),
      images: getStoreSocialImages(workspace.store, workspace.products[0]?.imageUrl),
    },
  };
}

export default async function StoreCheckoutPage({
  params,
  searchParams,
}: CheckoutPageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const recoveryToken = Array.isArray(query.recovery)
    ? query.recovery[0]
    : query.recovery;
  const cartParam = Array.isArray(query.cart) ? query.cart[0] : query.cart;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const recoveredCheckout = recoveryToken
    ? await getPublicAbandonedCheckout({
        slug,
        token: recoveryToken,
      })
    : null;
  const { store, products, shippingZones, navigationMenus } = workspace;
  const checkoutSessionId = randomBytes(16).toString("hex");
  const recoveredCart =
    recoveredCheckout?.checkout.lines.map((line) => ({
      productId: line.productId,
      variantId: line.productVariantId,
      quantity: line.quantity,
    })) || [];
  const permalinkCart = parseCartPermalinkLines(cartParam);
  const initialCart = recoveredCart.length > 0 ? recoveredCart : permalinkCart;
  const initialCartKey =
    recoveredCheckout?.checkout.recoveryToken ||
    (permalinkCart.length > 0 ? `cart:${cartParam}` : undefined);

  return (
    <main className="liquid-bg min-h-screen">
      <CheckoutForm
        checkoutSessionId={checkoutSessionId}
        freeShippingThresholdCents={store.freeShippingThresholdCents}
        initialCart={initialCart}
        initialCartKey={initialCartKey}
        initialCustomerEmail={recoveredCheckout?.checkout.customerEmail}
        initialCustomerName={recoveredCheckout?.checkout.customerName}
        initialRecoveryToken={recoveredCheckout?.checkout.recoveryToken}
        products={products}
        shippingZones={shippingZones}
        shippingRateCents={store.shippingRateCents}
        storeName={store.name}
        storeSlug={store.slug}
        taxRateBps={store.taxRateBps}
      />
      <StorefrontFooter maxWidthClassName="max-w-6xl" menus={navigationMenus} />
    </main>
  );
}
