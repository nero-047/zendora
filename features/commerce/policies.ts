import type { StorePolicy, StorePolicyType } from "@/features/commerce/types";

export const storePolicyTypes = [
  "refund",
  "shipping",
  "privacy",
  "terms",
] as const satisfies readonly StorePolicyType[];

export const storePolicyLabels: Record<StorePolicyType, string> = {
  refund: "Refund policy",
  shipping: "Shipping policy",
  privacy: "Privacy policy",
  terms: "Terms of service",
};

export const storePolicyDescriptions: Record<StorePolicyType, string> = {
  refund: "Set customer expectations for returns, refunds, and restocking.",
  shipping: "Explain shipping timelines, regions, costs, and tracking.",
  privacy: "Describe customer data collection, use, storage, and rights.",
  terms: "Publish the terms customers accept when buying from the store.",
};

export function getDefaultPolicyTitle(type: StorePolicyType) {
  return storePolicyLabels[type];
}

export function getPolicyHref(storeSlug: string, type: StorePolicyType) {
  return `/stores/${storeSlug}/policies/${type}`;
}

export function getPublishedPolicies(policies: StorePolicy[]) {
  return policies.filter(
    (policy) => policy.status === "published" && policy.body.trim().length > 0,
  );
}
