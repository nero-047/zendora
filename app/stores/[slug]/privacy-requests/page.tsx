import type { Metadata } from "next";
import { FileSearch, MailCheck, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";

import { PrivacyRequestForm } from "@/features/commerce/components/privacy-request-form";
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

type PrivacyRequestsPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: PrivacyRequestsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Privacy request not found",
      robots: {
        follow: false,
        index: false,
      },
    };
  }

  return {
    title: getStoreSeoTitle(workspace.store, "Privacy request"),
    description: getStoreSeoDescription(workspace.store),
    robots: {
      follow: false,
      index: false,
    },
    openGraph: {
      title: getStoreSeoTitle(workspace.store, "Privacy request"),
      description: getStoreSeoDescription(workspace.store),
      images: getStoreSocialImages(workspace.store, workspace.products[0]?.imageUrl),
    },
  };
}

export default async function PrivacyRequestsPage({
  params,
}: PrivacyRequestsPageProps) {
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
        <PrivacyRequestForm storeName={store.name} storeSlug={store.slug} />

        <aside className="grid gap-3">
          {[
            {
              icon: ShieldCheck,
              label: "Rights request",
              text: "Access, correction, deletion, and opt-out requests enter the merchant queue.",
            },
            {
              icon: FileSearch,
              label: "Data lookup",
              text: "Order references and customer emails stay attached for review.",
            },
            {
              icon: MailCheck,
              label: "Operations",
              text: "Merchants can export customer privacy context before acting.",
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
