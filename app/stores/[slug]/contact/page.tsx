import type { Metadata } from "next";
import { Clock, MailCheck, PackageSearch } from "lucide-react";
import { notFound } from "next/navigation";

import { ContactForm } from "@/features/commerce/components/contact-form";
import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getPublicBaseUrl,
  getStoreSeoDescription,
  getStoreSeoTitle,
  getStoreSocialImages,
} from "@/features/commerce/seo";

type ContactPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: ContactPageProps): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return {
      title: "Contact not found",
    };
  }

  const title = getStoreSeoTitle(workspace.store, "Contact");
  const description = getStoreSeoDescription(workspace.store);
  const canonicalUrl = `${getPublicBaseUrl()}/stores/${workspace.store.slug}/contact`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: getStoreSocialImages(
        workspace.store,
        workspace.products[0]?.imageUrl,
      ),
    },
  };
}

export default async function ContactPage({ params }: ContactPageProps) {
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
        <ContactForm storeName={store.name} storeSlug={store.slug} />

        <aside className="grid gap-3">
          {[
            {
              icon: MailCheck,
              label: "Support queue",
              text: "Messages are routed into the merchant activity queue.",
            },
            {
              icon: PackageSearch,
              label: "Order context",
              text: "Order references stay attached to the customer request.",
            },
            {
              icon: Clock,
              label: "Follow up",
              text: "Pending messages remain visible until the merchant responds.",
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
