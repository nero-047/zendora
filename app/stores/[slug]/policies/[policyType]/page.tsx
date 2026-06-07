import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";

import {
  StorefrontFooter,
  StorefrontHeader,
} from "@/features/commerce/components/storefront-navigation";
import { getPublicStorefront } from "@/features/commerce/data";
import {
  getPublishedPolicies,
  storePolicyLabels,
  storePolicyTypes,
} from "@/features/commerce/policies";
import { getStoreSeoTitle, getStoreSocialImages } from "@/features/commerce/seo";
import type { StorePolicyType } from "@/features/commerce/types";

type PolicyPageProps = {
  params: Promise<{ slug: string; policyType: string }>;
};

function isStorePolicyType(value: string): value is StorePolicyType {
  return storePolicyTypes.includes(value as StorePolicyType);
}

async function getStorePolicy(slug: string, policyType: string) {
  if (!isStorePolicyType(policyType)) {
    return null;
  }

  const workspace = await getPublicStorefront(slug);

  if (!workspace) {
    return null;
  }

  const policy = getPublishedPolicies(workspace.policies).find(
    (item) => item.type === policyType,
  );

  if (!policy) {
    return null;
  }

  return {
    store: workspace.store,
    policy,
    navigationMenus: workspace.navigationMenus,
  };
}

export async function generateMetadata({
  params,
}: PolicyPageProps): Promise<Metadata> {
  const { slug, policyType } = await params;
  const data = await getStorePolicy(slug, policyType);

  if (!data) {
    return {
      title: "Policy not found",
    };
  }

  return {
    title: getStoreSeoTitle(data.store, data.policy.title),
    description: `${storePolicyLabels[data.policy.type]} for ${data.store.name}.`,
    openGraph: {
      title: getStoreSeoTitle(data.store, data.policy.title),
      description: `${storePolicyLabels[data.policy.type]} for ${data.store.name}.`,
      images: getStoreSocialImages(data.store),
    },
  };
}

export default async function StorePolicyPage({ params }: PolicyPageProps) {
  const { slug, policyType } = await params;
  const data = await getStorePolicy(slug, policyType);

  if (!data) {
    notFound();
  }

  const { store, policy, navigationMenus } = data;
  const paragraphs = policy.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <main className="liquid-bg min-h-screen">
      <StorefrontHeader
        backHref={`/stores/${store.slug}`}
        backLabel={store.name}
        maxWidthClassName="max-w-5xl"
        menus={navigationMenus}
        store={store}
      />

      <article className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        <div className="glass-panel p-5 sm:p-8">
          <span className="status-pill mb-4">
            <FileText aria-hidden="true" size={14} />
            {storePolicyLabels[policy.type]}
          </span>
          <h1 className="text-4xl font-semibold leading-tight text-slate-950 sm:text-5xl">
            {policy.title}
          </h1>
          <div className="mt-8 grid gap-5 text-base leading-8 text-slate-600">
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-8 text-xs font-semibold uppercase text-slate-400">
            Updated {new Date(policy.updatedAt).toLocaleDateString("en-US")}
          </p>
        </div>
      </article>
      <StorefrontFooter maxWidthClassName="max-w-5xl" menus={navigationMenus} />
    </main>
  );
}
