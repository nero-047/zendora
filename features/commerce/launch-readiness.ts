import { getNavigationLinks } from "@/features/commerce/navigation";
import {
  getPublishedPolicies,
  storePolicyLabels,
  storePolicyTypes,
} from "@/features/commerce/policies";
import { getProductHealth } from "@/features/commerce/product-health";
import type {
  Product,
  StoreLaunchReadinessCheck,
  StoreWorkspace,
} from "@/features/commerce/types";

export type StoreLaunchReadiness = {
  checks: StoreLaunchReadinessCheck[];
  blockingChecks: StoreLaunchReadinessCheck[];
  warningChecks: StoreLaunchReadinessCheck[];
  passedCount: number;
  blockingCount: number;
  warningCount: number;
  completionPercent: number;
  canPublish: boolean;
};

function hasProductStock(product: Product) {
  return getProductHealth(product).hasPurchasableStock;
}

function getActiveProductIssues(products: Product[]) {
  return products.flatMap((product) => {
    const issues = getProductHealth(product).issues
      .filter((issue) => issue.severity === "blocking")
      .map((issue) => issue.label.toLowerCase());

    return issues.length > 0
      ? [{ name: product.name, issues }]
      : [];
  });
}

function getCheck(input: StoreLaunchReadinessCheck): StoreLaunchReadinessCheck {
  return input;
}

export function getStoreLaunchReadiness(
  workspace: StoreWorkspace,
): StoreLaunchReadiness {
  const { store } = workspace;
  const activeProducts = workspace.products.filter(
    (product) => product.status === "active",
  );
  const purchasableProducts = activeProducts.filter(hasProductStock);
  const productIssues = getActiveProductIssues(activeProducts);
  const publishedPolicies = getPublishedPolicies(workspace.policies);
  const missingPolicyTypes = storePolicyTypes.filter(
    (type) => !publishedPolicies.some((policy) => policy.type === type),
  );
  const headerLinks = getNavigationLinks(workspace.navigationMenus, "header");
  const footerLinks = getNavigationLinks(workspace.navigationMenus, "footer");
  const activeCollections = workspace.collections.filter(
    (collection) => collection.status === "active" && collection.productCount > 0,
  );
  const approvedReviews = workspace.productReviews.filter(
    (review) => review.status === "approved",
  );
  const activeShippingZones = workspace.shippingZones.filter(
    (zone) => zone.status === "active",
  );
  const hasValidRates =
    store.shippingRateCents >= 0 &&
    store.freeShippingThresholdCents >= 0 &&
    store.taxRateBps >= 0 &&
    store.taxRateBps <= 10000;
  const checks = [
    getCheck({
      id: "identity",
      label: "Store identity",
      status:
        store.name.trim().length >= 2 && store.description.trim().length >= 20
          ? "passed"
          : "blocking",
      detail:
        store.description.trim().length >= 20
          ? "Name and description are ready."
          : "Add a clear store description before launch.",
      href: `/dashboard/stores/${store.id}`,
    }),
    getCheck({
      id: "catalog",
      label: "Active catalog",
      status: activeProducts.length > 0 ? "passed" : "blocking",
      detail:
        activeProducts.length > 0
          ? `${activeProducts.length} active products are available.`
          : "Add at least one active product.",
      href: `/dashboard/stores/${store.id}/products`,
    }),
    getCheck({
      id: "purchasable-products",
      label: "Purchasable products",
      status:
        purchasableProducts.length > 0 && productIssues.length === 0
          ? "passed"
          : "blocking",
      detail:
        productIssues.length > 0
          ? productIssues
              .slice(0, 3)
              .map((product) => `${product.name}: ${product.issues.join(", ")}`)
              .join("; ")
          : purchasableProducts.length > 0
            ? `${purchasableProducts.length} products have price and stock.`
            : "Active products need price, image, description, and stock.",
      href: `/dashboard/stores/${store.id}/products`,
    }),
    getCheck({
      id: "checkout-rates",
      label: "Checkout rates",
      status: hasValidRates ? "passed" : "blocking",
      detail: hasValidRates
        ? "Shipping, free-shipping threshold, and tax values are valid."
        : "Fix shipping, free-shipping, or tax values.",
      href: `/dashboard/stores/${store.id}`,
    }),
    getCheck({
      id: "policies",
      label: "Store policies",
      status: missingPolicyTypes.length === 0 ? "passed" : "blocking",
      detail:
        missingPolicyTypes.length === 0
          ? "Required storefront policies are published."
          : `Publish ${missingPolicyTypes
              .map((type) => storePolicyLabels[type])
              .join(", ")}.`,
      href: `/dashboard/stores/${store.id}`,
    }),
    getCheck({
      id: "shipping-zones",
      label: "Shipping zones",
      status: activeShippingZones.length > 0 ? "passed" : "warning",
      detail:
        activeShippingZones.length > 0
          ? `${activeShippingZones.length} active shipping zones are configured.`
          : "Checkout will use the base shipping rate.",
      href: `/dashboard/stores/${store.id}`,
    }),
    getCheck({
      id: "navigation",
      label: "Store navigation",
      status: headerLinks.length > 0 && footerLinks.length > 0 ? "passed" : "warning",
      detail:
        headerLinks.length > 0 && footerLinks.length > 0
          ? "Header and footer menus are set."
          : "Add header and footer links for the public storefront.",
      href: `/dashboard/stores/${store.id}`,
    }),
    getCheck({
      id: "collections",
      label: "Collections",
      status: activeCollections.length > 0 ? "passed" : "warning",
      detail:
        activeCollections.length > 0
          ? `${activeCollections.length} active collections are merchandised.`
          : "Create active collections for catalog browsing.",
      href: `/dashboard/stores/${store.id}`,
    }),
    getCheck({
      id: "seo",
      label: "Search preview",
      status:
        store.seoTitle?.trim() || store.seoDescription?.trim() || store.socialImageUrl
          ? "passed"
          : "warning",
      detail:
        store.seoTitle?.trim() || store.seoDescription?.trim() || store.socialImageUrl
          ? "Search and social preview values are set."
          : "Add SEO title, description, or social image.",
      href: `/dashboard/stores/${store.id}`,
    }),
    getCheck({
      id: "social-proof",
      label: "Product reviews",
      status: approvedReviews.length > 0 ? "passed" : "warning",
      detail:
        approvedReviews.length > 0
          ? `${approvedReviews.length} approved reviews are public.`
          : "Approved reviews can improve buyer trust.",
      href: `/dashboard/stores/${store.id}/orders`,
    }),
  ];
  const blockingChecks = checks.filter((check) => check.status === "blocking");
  const warningChecks = checks.filter((check) => check.status === "warning");
  const passedCount = checks.filter((check) => check.status === "passed").length;
  const score = checks.reduce((sum, check) => {
    if (check.status === "passed") {
      return sum + 1;
    }

    if (check.status === "warning") {
      return sum + 0.5;
    }

    return sum;
  }, 0);

  return {
    checks,
    blockingChecks,
    warningChecks,
    passedCount,
    blockingCount: blockingChecks.length,
    warningCount: warningChecks.length,
    completionPercent: Math.round((score / checks.length) * 100),
    canPublish: blockingChecks.length === 0,
  };
}
