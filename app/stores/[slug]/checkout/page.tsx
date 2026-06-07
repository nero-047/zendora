import { notFound } from "next/navigation";

import { CheckoutForm } from "@/features/commerce/components/checkout-form";
import { getPublicStorefront } from "@/features/commerce/data";

export default async function StoreCheckoutPage({
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

  return (
    <main className="liquid-bg min-h-screen">
      <CheckoutForm
        products={products}
        storeName={store.name}
        storeSlug={store.slug}
      />
    </main>
  );
}
