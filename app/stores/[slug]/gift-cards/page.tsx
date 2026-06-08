import type { Metadata } from "next";
import { CreditCard, LockKeyhole, ReceiptText } from "lucide-react";
import { notFound } from "next/navigation";

import { GiftCardBalanceForm } from "@/features/commerce/components/gift-card-balance-form";
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

type GiftCardsPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: GiftCardsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Gift card balance not found",
      robots: {
        follow: false,
        index: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(workspace.store, "Gift card balance"),
    description: getStoreSeoDescription(workspace.store),
    robots: {
      follow: false,
      index: false,
    },
    openGraph: {
      title: getStoreSeoTitle(workspace.store, "Gift card balance"),
      description: getStoreSeoDescription(workspace.store),
      images: getStoreSocialImages(workspace.store, workspace.products[0]?.imageUrl),
    },
  };
}

export default async function GiftCardsPage({ params }: GiftCardsPageProps) {
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
        <GiftCardBalanceForm storeName={store.name} storeSlug={store.slug} />

        <aside className="grid gap-3">
          {[
            {
              icon: CreditCard,
              label: "Current balance",
              text: "Balances reflect the latest available store ledger.",
            },
            {
              icon: LockKeyhole,
              label: "Masked lookup",
              text: "Only the masked code, status, balance, and expiry are returned.",
            },
            {
              icon: ReceiptText,
              label: "Checkout ready",
              text: "Redeemable cards can be applied from checkout.",
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
