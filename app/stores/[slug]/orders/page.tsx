import type { Metadata } from "next";
import { PackageSearch, ShieldCheck, Truck } from "lucide-react";
import { notFound } from "next/navigation";

import { OrderLookupForm } from "@/features/commerce/components/order-lookup-form";
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

type OrderLookupPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: OrderLookupPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Order lookup not found",
      robots: {
        follow: false,
        index: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(workspace.store, "Order lookup"),
    description: getStoreSeoDescription(workspace.store),
    robots: {
      follow: false,
      index: false,
    },
    openGraph: {
      title: getStoreSeoTitle(workspace.store, "Order lookup"),
      description: getStoreSeoDescription(workspace.store),
      images: getStoreSocialImages(workspace.store, workspace.products[0]?.imageUrl),
    },
  };
}

export default async function OrderLookupPage({ params }: OrderLookupPageProps) {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    notFound();
  }

  const { store, navigationMenus } = workspace;

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        action="continue"
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        maxWidthClassName="max-w-5xl"
        menus={navigationMenus}
        store={store}
      />

      <section className="mx-auto grid max-w-5xl gap-5 px-4 pb-16 pt-4 sm:px-6 lg:grid-cols-[1fr_0.82fr]">
        <OrderLookupForm storeSlug={store.slug} />

        <aside className="grid gap-3">
          {[
            {
              icon: PackageSearch,
              label: "Order details",
              text: "Payment, fulfillment, items, and receipt totals stay tied to the private order link.",
            },
            {
              icon: Truck,
              label: "Delivery updates",
              text: "Shipment milestones and tracking information appear after the merchant updates fulfillment.",
            },
            {
              icon: ShieldCheck,
              label: "Self service",
              text: "Returns and product reviews stay available from eligible customer receipt pages.",
            },
          ].map(({ icon: Icon, label, text }) => (
            <div className="soft-panel p-4" key={label}>
              <Icon aria-hidden="true" className="text-sky-700" size={20} />
              <h2 className="mt-4 text-sm font-semibold text-slate-950">
                {label}
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
            </div>
          ))}
        </aside>
      </section>

      <StorefrontFooter maxWidthClassName="max-w-5xl" menus={navigationMenus} />
    </main>
  );
}
