import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import { getStorePageDescription } from "@/features/commerce/store-pages";
import {
  getStoreSeoTitle,
  getStoreSocialImages,
  getStorePageCanonicalUrl,
} from "@/features/commerce/seo";

type StoreCustomPageProps = {
  params: Promise<{
    slug: string;
    pageSlug: string;
  }>;
};

async function loadStorePage(slug: string, pageSlug: string) {
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return null;
  }

  const page = workspace.customPages.find(
    (item) => item.slug === pageSlug && item.status === "published",
  );

  if (!page || page.body.trim().length === 0) {
    return null;
  }

  return {
    store: workspace.store,
    page,
    heroProduct: workspace.products[0],
    navigationMenus: workspace.navigationMenus,
  };
}

export async function generateMetadata({
  params,
}: StoreCustomPageProps): Promise<Metadata> {
  const { slug, pageSlug } = await params;
  const data = await loadStorePage(slug, pageSlug);

  if (!data) {
    return {
      title: "Page not found",
    };
  }

  const title = data.page.seoTitle?.trim() || data.page.title;
  const description = getStorePageDescription(data.page);
  const canonicalUrl = getStorePageCanonicalUrl(data.store, data.page);
  const metadataTitle = getStoreSeoTitle(data.store, title);

  return {
    title: metadataTitle,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: metadataTitle,
      description,
      url: canonicalUrl,
      images: getStoreSocialImages(data.store, data.heroProduct?.imageUrl),
    },
  };
}

export default async function StoreCustomPage({
  params,
}: StoreCustomPageProps) {
  const { slug, pageSlug } = await params;
  const data = await loadStorePage(slug, pageSlug);

  if (!data) {
    notFound();
  }

  const paragraphs = data.page.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        backHref={`/stores/${data.store.slug}`}
        backLabel={data.store.name}
        maxWidthClassName="max-w-5xl"
        menus={data.navigationMenus}
        store={data.store}
      />

      <article className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center gap-2">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[8px] text-white"
            style={{ background: data.store.themeColor }}
          >
            <FileText aria-hidden="true" size={18} />
          </span>
          <span className="status-pill">{data.store.name}</span>
        </div>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
          {data.page.title}
        </h1>
        <div className="mt-8 grid gap-5 text-base leading-8 text-slate-700">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
        <Link
          className="secondary-button mt-10 w-fit px-4 text-sm"
          href={`/stores/${data.store.slug}`}
        >
          <ArrowLeft aria-hidden="true" size={16} />
          Back to store
        </Link>
      </article>
      <StorefrontFooter
        maxWidthClassName="max-w-5xl"
        menus={data.navigationMenus}
      />
    </main>
  );
}
