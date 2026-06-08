import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, FileText, LockKeyhole, ShieldCheck } from "lucide-react";

import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getPolicyHref,
  getPublishedPolicies,
  storePolicyDescriptions,
  storePolicyLabels,
  storePolicyTypes,
} from "@/features/commerce/policies";
import {
  getPublicBaseUrl,
  getStoreSeoTitle,
  getStoreSocialImages,
} from "@/features/commerce/seo";

type StorePoliciesPageProps = {
  params: Promise<{ slug: string }>;
};

async function loadStorePolicies(slug: string) {
  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return null;
  }

  const policies = getPublishedPolicies(workspace.policies).sort(
    (a, b) =>
      storePolicyTypes.indexOf(a.type) - storePolicyTypes.indexOf(b.type),
  );

  if (policies.length === 0) {
    return null;
  }

  return {
    store: workspace.store,
    policies,
    navigationMenus: workspace.navigationMenus,
  };
}

export async function generateMetadata({
  params,
}: StorePoliciesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadStorePolicies(slug);

  if (!data) {
    return {
      title: "Policies not found",
    };
  }

  const title = getStoreSeoTitle(data.store, "Store policies");
  const description = `Refund, shipping, privacy, and terms for ${data.store.name}.`;
  const canonicalUrl = `${getPublicBaseUrl()}/stores/${data.store.slug}/policies`;

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
      images: getStoreSocialImages(data.store),
    },
  };
}

export default async function StorePoliciesPage({
  params,
}: StorePoliciesPageProps) {
  const { slug } = await params;
  const data = await loadStorePolicies(slug);

  if (!data) {
    notFound();
  }

  const { store, policies, navigationMenus } = data;

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        maxWidthClassName="max-w-6xl"
        menus={navigationMenus}
        store={store}
      />

      <section className="mx-auto max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <div className="glass-panel p-5 sm:p-8">
          <span className="status-pill mb-4">
            <ShieldCheck aria-hidden="true" size={14} />
            Customer information
          </span>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            Store policies
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Review how {store.name} handles returns, delivery, customer data,
            and the terms that apply when placing an order.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {policies.map((policy) => (
            <Link
              className="soft-panel grid min-h-56 gap-3 p-5 hover:border-sky-200"
              href={getPolicyHref(store.slug, policy.type)}
              key={policy.id}
            >
              <span className="status-pill w-fit">
                <FileText aria-hidden="true" size={14} />
                {storePolicyLabels[policy.type]}
              </span>
              <span className="text-xl font-semibold text-slate-950">
                {policy.title}
              </span>
              <span className="line-clamp-3 text-sm leading-6 text-slate-600">
                {storePolicyDescriptions[policy.type]}
              </span>
              <span className="text-xs font-semibold uppercase text-slate-400">
                Updated {new Date(policy.updatedAt).toLocaleDateString("en-US")}
              </span>
              <span className="mt-auto inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
                Read policy
                <ArrowRight aria-hidden="true" size={16} />
              </span>
            </Link>
          ))}
        </div>

        <Link
          className="soft-panel mt-5 flex flex-wrap items-center justify-between gap-4 p-5 hover:border-sky-200"
          href={`/stores/${store.slug}/privacy-requests`}
        >
          <span className="inline-flex items-center gap-3 text-sm font-semibold text-slate-950">
            <LockKeyhole aria-hidden="true" className="text-sky-700" size={18} />
            Privacy requests
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-sky-700">
            Submit request
            <ArrowRight aria-hidden="true" size={16} />
          </span>
        </Link>
      </section>

      <StorefrontFooter maxWidthClassName="max-w-6xl" menus={navigationMenus} />
    </main>
  );
}
