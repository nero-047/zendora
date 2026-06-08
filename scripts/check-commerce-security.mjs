import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const actionsPath = "features/commerce/actions.ts";
const abandonedCheckoutRoutePath =
  "app/api/stores/[slug]/abandoned-checkouts/route.ts";
const buildfilePath = "Buildfile";
const catalogFiltersPath = "features/commerce/catalog-filters.ts";
const checkoutFormPath = "features/commerce/components/checkout-form.tsx";
const checkoutPagePath = "app/stores/[slug]/checkout/page.tsx";
const checkoutPreviewRoutePath =
  "app/api/stores/[slug]/checkout-preview/route.ts";
const clerkWebhookRoutePath = "app/api/webhooks/clerk/route.ts";
const comparePagePath = "app/stores/[slug]/compare/page.tsx";
const contactFormPath = "features/commerce/components/contact-form.tsx";
const contactPagePath = "app/stores/[slug]/contact/page.tsx";
const contactRoutePath = "app/api/stores/[slug]/contact/route.ts";
const createProductFormPath = "features/commerce/components/create-product-form.tsx";
const csvExportPath = "features/commerce/csv-export.ts";
const dataPath = "features/commerce/data.ts";
const giftCardBalanceFormPath =
  "features/commerce/components/gift-card-balance-form.tsx";
const giftCardBalancePagePath = "app/stores/[slug]/gift-cards/page.tsx";
const giftCardBalanceRoutePath =
  "app/api/stores/[slug]/gift-cards/balance/route.ts";
const newsletterFormPath =
  "features/commerce/components/newsletter-signup-form.tsx";
const newsletterHelperPath = "features/commerce/newsletter.ts";
const newsletterRoutePath = "app/api/stores/[slug]/newsletter/route.ts";
const policiesIndexPath = "app/stores/[slug]/policies/page.tsx";
const policyDetailPath = "app/stores/[slug]/policies/[policyType]/page.tsx";
const privacyRequestFormPath =
  "features/commerce/components/privacy-request-form.tsx";
const privacyRequestHelperPath = "features/commerce/privacy-requests.ts";
const privacyRequestPagePath = "app/stores/[slug]/privacy-requests/page.tsx";
const privacyRequestRoutePath =
  "app/api/stores/[slug]/privacy-requests/route.ts";
const productCardActionsPath = "features/commerce/product-card-actions.ts";
const productCompareHelperPath = "features/commerce/product-compare.ts";
const productDetailActionsPath =
  "features/commerce/components/product-detail-actions.tsx";
const productPagePath = "app/stores/[slug]/products/[productSlug]/page.tsx";
const productQuestionFormPath =
  "features/commerce/components/product-question-form.tsx";
const productQuestionHelperPath = "features/commerce/product-questions.ts";
const productQuestionRoutePath =
  "app/api/stores/[slug]/products/[productId]/questions/route.ts";
const productRecommendationsPath =
  "features/commerce/product-recommendations.ts";
const reviewsHelperPath = "features/commerce/reviews.ts";
const recentlyViewedHelperPath = "features/commerce/recently-viewed.ts";
const recentlyViewedPagePath = "app/stores/[slug]/recently-viewed/page.tsx";
const recentlyViewedProductsPagePath =
  "features/commerce/components/recently-viewed-products-page.tsx";
const recentlyViewedStorePath =
  "features/commerce/components/recently-viewed-store.ts";
const restockAlertFormPath =
  "features/commerce/components/restock-alert-form.tsx";
const restockAlertHelperPath = "features/commerce/restock-alerts.ts";
const restockAlertRoutePath = "app/api/stores/[slug]/restock-alerts/route.ts";
const envPath = "lib/env.ts";
const editProductFormPath = "features/commerce/components/edit-product-form.tsx";
const nextConfigPath = "next.config.ts";
const orderCancellationFormPath =
  "features/commerce/components/order-cancellation-request-form.tsx";
const orderCancellationHelperPath = "features/commerce/order-cancellation.ts";
const orderCancellationRoutePath =
  "app/api/stores/[slug]/orders/[orderId]/cancellation-requests/route.ts";
const orderDeliveryFormPath =
  "features/commerce/components/order-delivery-request-form.tsx";
const orderDeliveryHelperPath = "features/commerce/order-delivery-request.ts";
const orderDeliveryRoutePath =
  "app/api/stores/[slug]/orders/[orderId]/delivery-requests/route.ts";
const orderInvoicePath = "app/stores/[slug]/orders/[orderId]/invoice/page.tsx";
const orderReceiptPath = "app/stores/[slug]/orders/[orderId]/page.tsx";
const orderReorderPath = "features/commerce/order-reorder.ts";
const orderTrackingPath = "app/stores/[slug]/orders/[orderId]/tracking/page.tsx";
const packageEbPath = "scripts/package-eb.mjs";
const packageJsonPath = "package.json";
const prebuildHookPath = ".platform/hooks/prebuild/00_add_swap.sh";
const predeployHookPath = ".platform/hooks/predeploy/10_next_build.sh";
const procfilePath = "Procfile";
const requestGuardsPath = "lib/request-guards.ts";
const robotsPath = "app/robots.ts";
const schemaPath = "supabase/schema.sql";
const smokePath = "scripts/smoke.mjs";
const storeSearchPagePath = "app/stores/[slug]/search/page.tsx";
const storefrontCartPagePath =
  "features/commerce/components/storefront-cart-page.tsx";
const storefrontCartPath = "features/commerce/components/storefront-cart.tsx";
const storefrontNavigationPath =
  "features/commerce/components/storefront-navigation.tsx";
const storefrontSearchPath = "features/commerce/storefront-search.ts";
const storefrontWishlistPagePath =
  "features/commerce/components/storefront-wishlist-page.tsx";
const wishlistButtonPath = "features/commerce/components/wishlist-button.tsx";
const wishlistHelperPath = "features/commerce/wishlist.ts";
const wishlistPagePath = "app/stores/[slug]/wishlist/page.tsx";
const sourceText = readFileSync(actionsPath, "utf8");
const abandonedCheckoutRouteText = readFileSync(abandonedCheckoutRoutePath, "utf8");
const buildfileText = readFileSync(buildfilePath, "utf8");
const catalogFiltersText = readFileSync(catalogFiltersPath, "utf8");
const checkoutFormText = readFileSync(checkoutFormPath, "utf8");
const checkoutPageText = readFileSync(checkoutPagePath, "utf8");
const checkoutPreviewRouteText = readFileSync(checkoutPreviewRoutePath, "utf8");
const clerkWebhookRouteText = readFileSync(clerkWebhookRoutePath, "utf8");
const comparePageText = readFileSync(comparePagePath, "utf8");
const contactFormText = readFileSync(contactFormPath, "utf8");
const contactPageText = readFileSync(contactPagePath, "utf8");
const contactRouteText = readFileSync(contactRoutePath, "utf8");
const createProductFormText = readFileSync(createProductFormPath, "utf8");
const csvExportText = readFileSync(csvExportPath, "utf8");
const dataText = readFileSync(dataPath, "utf8");
const giftCardBalanceFormText = readFileSync(giftCardBalanceFormPath, "utf8");
const giftCardBalancePageText = readFileSync(giftCardBalancePagePath, "utf8");
const giftCardBalanceRouteText = readFileSync(giftCardBalanceRoutePath, "utf8");
const newsletterFormText = readFileSync(newsletterFormPath, "utf8");
const newsletterHelperText = readFileSync(newsletterHelperPath, "utf8");
const newsletterRouteText = readFileSync(newsletterRoutePath, "utf8");
const policiesIndexText = readFileSync(policiesIndexPath, "utf8");
const policyDetailText = readFileSync(policyDetailPath, "utf8");
const privacyRequestFormText = readFileSync(privacyRequestFormPath, "utf8");
const privacyRequestHelperText = readFileSync(privacyRequestHelperPath, "utf8");
const privacyRequestPageText = readFileSync(privacyRequestPagePath, "utf8");
const privacyRequestRouteText = readFileSync(privacyRequestRoutePath, "utf8");
const productCardActionsText = readFileSync(productCardActionsPath, "utf8");
const productCompareHelperText = readFileSync(productCompareHelperPath, "utf8");
const productDetailActionsText = readFileSync(productDetailActionsPath, "utf8");
const productPageText = readFileSync(productPagePath, "utf8");
const productQuestionFormText = readFileSync(productQuestionFormPath, "utf8");
const productQuestionHelperText = readFileSync(
  productQuestionHelperPath,
  "utf8",
);
const productQuestionRouteText = readFileSync(
  productQuestionRoutePath,
  "utf8",
);
const productRecommendationsText = readFileSync(
  productRecommendationsPath,
  "utf8",
);
const reviewsHelperText = readFileSync(reviewsHelperPath, "utf8");
const recentlyViewedHelperText = readFileSync(recentlyViewedHelperPath, "utf8");
const recentlyViewedPageText = readFileSync(recentlyViewedPagePath, "utf8");
const recentlyViewedProductsPageText = readFileSync(
  recentlyViewedProductsPagePath,
  "utf8",
);
const recentlyViewedStoreText = readFileSync(recentlyViewedStorePath, "utf8");
const restockAlertFormText = readFileSync(restockAlertFormPath, "utf8");
const restockAlertHelperText = readFileSync(restockAlertHelperPath, "utf8");
const restockAlertRouteText = readFileSync(restockAlertRoutePath, "utf8");
const envText = readFileSync(envPath, "utf8");
const editProductFormText = readFileSync(editProductFormPath, "utf8");
const nextConfigText = readFileSync(nextConfigPath, "utf8");
const orderCancellationFormText = readFileSync(
  orderCancellationFormPath,
  "utf8",
);
const orderCancellationHelperText = readFileSync(
  orderCancellationHelperPath,
  "utf8",
);
const orderCancellationRouteText = readFileSync(
  orderCancellationRoutePath,
  "utf8",
);
const orderDeliveryFormText = readFileSync(orderDeliveryFormPath, "utf8");
const orderDeliveryHelperText = readFileSync(orderDeliveryHelperPath, "utf8");
const orderDeliveryRouteText = readFileSync(orderDeliveryRoutePath, "utf8");
const orderInvoiceText = readFileSync(orderInvoicePath, "utf8");
const orderReceiptText = readFileSync(orderReceiptPath, "utf8");
const orderReorderText = readFileSync(orderReorderPath, "utf8");
const orderTrackingText = readFileSync(orderTrackingPath, "utf8");
const packageEbText = readFileSync(packageEbPath, "utf8");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const prebuildHookText = readFileSync(prebuildHookPath, "utf8");
const predeployHookText = readFileSync(predeployHookPath, "utf8");
const procfileText = readFileSync(procfilePath, "utf8");
const requestGuardsText = readFileSync(requestGuardsPath, "utf8");
const robotsText = readFileSync(robotsPath, "utf8");
const schemaText = readFileSync(schemaPath, "utf8");
const smokeText = readFileSync(smokePath, "utf8");
const storeSearchPageText = readFileSync(storeSearchPagePath, "utf8");
const storefrontCartPageText = readFileSync(storefrontCartPagePath, "utf8");
const storefrontCartText = readFileSync(storefrontCartPath, "utf8");
const storefrontNavigationText = readFileSync(storefrontNavigationPath, "utf8");
const storefrontSearchText = readFileSync(storefrontSearchPath, "utf8");
const storefrontWishlistPageText = readFileSync(
  storefrontWishlistPagePath,
  "utf8",
);
const wishlistButtonText = readFileSync(wishlistButtonPath, "utf8");
const wishlistHelperText = readFileSync(wishlistHelperPath, "utf8");
const wishlistPageText = readFileSync(wishlistPagePath, "utf8");
const errorBoundaryPaths = [
  "app/error.tsx",
  "app/dashboard/error.tsx",
  "app/stores/[slug]/error.tsx",
];

const expectedGuards = new Map(
  Object.entries({
    createProductAction: "manage_catalog",
    updateProductAction: "manage_catalog",
    createCollectionAction: "manage_catalog",
    updateCollectionAction: "manage_catalog",
    updateCollectionStatusAction: "manage_catalog",
    updateProductReviewStatusAction: "manage_catalog",
    adjustInventoryAction: "manage_inventory",
    createManualOrderAction: "manage_orders",
    queueAbandonedCheckoutRecoveryAction: "manage_orders",
    dismissAbandonedCheckoutAction: "manage_orders",
    updateOrderStatusAction: "manage_orders",
    confirmOrderPaymentAction: "manage_orders",
    updateOrderFulfillmentAction: "manage_orders",
    updateOrderFulfillmentStatusAction: "manage_orders",
    updateReturnRequestStatusAction: "manage_refunds",
    createRefundAction: "manage_refunds",
    createDiscountAction: "manage_discounts",
    updateDiscountAction: "manage_discounts",
    updateDiscountStatusAction: "manage_discounts",
    createGiftCardAction: "manage_discounts",
    updateGiftCardAction: "manage_discounts",
    updateGiftCardStatusAction: "manage_discounts",
    createShippingZoneAction: "manage_shipping",
    updateShippingZoneAction: "manage_shipping",
    updateShippingZoneStatusAction: "manage_shipping",
    upsertCustomerProfileAction: "manage_orders",
    updateStoreAction: "manage_store_settings",
    updateStorePoliciesAction: "manage_store_settings",
    createStorePageAction: "manage_store_settings",
    updateStorePageAction: "manage_store_settings",
    updateStoreNavigationAction: "manage_store_settings",
    publishStoreAction: "manage_store_settings",
    pauseStoreAction: "manage_store_settings",
    createStoreInvitationAction: "manage_team",
    revokeStoreInvitationAction: "manage_team",
    updateStoreMemberRoleAction: "manage_team",
    removeStoreMemberAction: "manage_team",
  }),
);

const expectedAuditEvents = new Map(
  Object.entries({
    createStoreAction: "store_created",
    upsertCustomerProfileAction: "customer_profile_updated",
    updateStoreAction: "store_updated",
    updateStorePoliciesAction: "store_policy_updated",
    createStorePageAction: "store_page_created",
    updateStorePageAction: "store_page_updated",
    updateStoreNavigationAction: "store_navigation_updated",
    publishStoreAction: "store_published",
    pauseStoreAction: "store_paused",
    createProductAction: "product_created",
    updateProductAction: "product_updated",
    adjustInventoryAction: "inventory_adjusted",
    createDiscountAction: "discount_created",
    updateDiscountAction: "discount_updated",
    updateDiscountStatusAction: "discount_status_updated",
    createGiftCardAction: "gift_card_created",
    updateGiftCardAction: "gift_card_updated",
    updateGiftCardStatusAction: "gift_card_status_updated",
    createCollectionAction: "collection_created",
    updateCollectionAction: "collection_updated",
    updateCollectionStatusAction: "collection_status_updated",
    createShippingZoneAction: "shipping_zone_created",
    updateShippingZoneAction: "shipping_zone_updated",
    updateShippingZoneStatusAction: "shipping_zone_status_updated",
    createManualOrderAction: "manual_order_created",
    createCheckoutOrderAction: "checkout_order_created",
    queueAbandonedCheckoutRecoveryAction: "abandoned_checkout_recovery_queued",
    dismissAbandonedCheckoutAction: "abandoned_checkout_dismissed",
    createProductReviewAction: "product_review_created",
    updateProductReviewStatusAction: "product_review_moderated",
    updateOrderStatusAction: "order_status_updated",
    confirmOrderPaymentAction: "payment_confirmed",
    updateOrderFulfillmentAction: "fulfillment_updated",
    updateOrderFulfillmentStatusAction: "fulfillment_updated",
    createReturnRequestAction: "return_request_created",
    updateReturnRequestStatusAction: "return_request_updated",
    createRefundAction: "refund_created",
    createStoreInvitationAction: "team_invited",
    revokeStoreInvitationAction: "team_invite_revoked",
    updateStoreMemberRoleAction: "team_member_role_updated",
    removeStoreMemberAction: "team_member_removed",
    acceptStoreInvitationAction: "team_invite_accepted",
  }),
);

const expectedNotifications = new Map(
  Object.entries({
    createManualOrderAction: "manual_order_invoice",
    createCheckoutOrderAction: "order_confirmation",
    queueAbandonedCheckoutRecoveryAction: "checkout_recovery",
    createProductReviewAction: "product_review_received",
    updateProductReviewStatusAction: "product_review_updated",
    createGiftCardAction: "gift_card_created",
    updateGiftCardStatusAction: "gift_card_status_updated",
    confirmOrderPaymentAction: "payment_receipt",
    updateOrderFulfillmentAction: "fulfillment_update",
    updateOrderFulfillmentStatusAction: "fulfillment_update",
    createReturnRequestAction: "return_request_created",
    updateReturnRequestStatusAction: "return_request_updated",
    createRefundAction: "refund_confirmation",
    createStoreInvitationAction: "team_invitation",
  }),
);

const expectedLaunchReadinessGuards = new Set([
  "publishStoreAction",
  "updateStoreAction",
]);

const sourceFile = ts.createSourceFile(
  actionsPath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
);

const failures = [];

if (sourceText.includes("assertStoreAccess(")) {
  failures.push("Do not use assertStoreAccess(); use permission-specific guards.");
}

if (!sourceText.includes('from("order_payment_transactions")')) {
  failures.push("Payment mutations must write order_payment_transactions.");
}

if (
  !envText.includes("isDemoDataEnabled") ||
  !envText.includes('process.env.NODE_ENV !== "production"') ||
  !dataText.includes("isDemoDataEnabled()")
) {
  failures.push("Demo data fallback must be explicitly gated off in production.");
}

if (
  !dataText.includes("isCommerceSchemaUnavailableError") ||
  !dataText.includes("shouldUseEmptyCatalogFallback") ||
  !dataText.includes("getDemoStoresForUser") ||
  !dataText.includes("getMockDashboardOverviewForStores") ||
  !dataText.includes("getMockStoreWorkspaceForUser") ||
  !dataText.includes("return isDemoDataEnabled() ? getDemoStoresForUser(userId) : []") ||
  !dataText.includes("return await loadPublicStorefrontFromClient") ||
  !dataText.includes("if (isCommerceSchemaUnavailableError(error))")
) {
  failures.push(`${dataPath} must degrade schema-unavailable Supabase reads into empty, demo, or not-found states instead of page crashes.`);
}

for (const errorBoundaryPath of errorBoundaryPaths) {
  if (!existsSync(errorBoundaryPath)) {
    failures.push(`${errorBoundaryPath} is missing a route-level error boundary.`);
    continue;
  }

  const errorBoundaryText = readFileSync(errorBoundaryPath, "utf8");

  if (
    !errorBoundaryText.includes('"use client"') ||
    !errorBoundaryText.includes("unstable_retry") ||
    !errorBoundaryText.includes("console.error(error)")
  ) {
    failures.push(`${errorBoundaryPath} must be a client error boundary with retry and logging.`);
  }
}

if (
  !requestGuardsText.includes("JSON_BODY_LIMIT_BYTES") ||
  !requestGuardsText.includes("WEBHOOK_BODY_LIMIT_BYTES") ||
  !requestGuardsText.includes("content-length") ||
  !requestGuardsText.includes("getReader()") ||
  !requestGuardsText.includes("getContentLengthLimitError") ||
  !requestGuardsText.includes("getClientFingerprintFromHeaders") ||
  !requestGuardsText.includes("consumeRateLimit")
) {
  failures.push(`${requestGuardsPath} must enforce JSON body limits and reusable request rate limits.`);
}

if (
  !robotsText.includes('"/stores/*/cart"') ||
  !robotsText.includes('"/stores/*/checkout"') ||
  !robotsText.includes('"/stores/*/compare"') ||
  !robotsText.includes('"/stores/*/gift-cards"') ||
  !robotsText.includes('"/stores/*/orders"') ||
  !robotsText.includes('"/stores/*/privacy-requests"') ||
  !robotsText.includes('"/stores/*/recently-viewed"') ||
  !robotsText.includes('"/stores/*/search"') ||
  !robotsText.includes('"/stores/*/wishlist"')
) {
  failures.push(`${robotsPath} must disallow cart, checkout, compare, gift-card, order, privacy-request, recently-viewed, search, and wishlist storefront utility routes.`);
}

if (
  !checkoutPreviewRouteText.includes("readLimitedJsonBody") ||
  !checkoutPreviewRouteText.includes("consumeRateLimit") ||
  !checkoutPreviewRouteText.includes("calculateCheckoutTotals") ||
  !checkoutPreviewRouteText.includes("calculateDiscountCents") ||
  !checkoutPreviewRouteText.includes("calculateGiftCardRedemptionAmount") ||
  !checkoutPreviewRouteText.includes("canRedeemGiftCard")
) {
  failures.push(`${checkoutPreviewRoutePath} must rate-limit public checkout preview requests and validate savings server-side.`);
}

if (
  !storefrontCartPageText.includes("/checkout-preview") ||
  !storefrontCartPageText.includes("Estimate order") ||
  !storefrontCartPageText.includes("Discount code") ||
  !storefrontCartPageText.includes("Gift card") ||
  !storefrontCartPageText.includes("appendCheckoutCodes") ||
  !storefrontCartPageText.includes("discountCode") ||
  !storefrontCartPageText.includes("giftCardCode")
) {
  failures.push(`${storefrontCartPagePath} must estimate cart discounts and gift cards through the secure checkout preview API and pass codes into checkout.`);
}

if (
  !checkoutPageText.includes("initialDiscountCode") ||
  !checkoutPageText.includes("initialGiftCardCode") ||
  !checkoutPageText.includes("discountCode?:") ||
  !checkoutPageText.includes("giftCardCode?:")
) {
  failures.push(`${checkoutPagePath} must read promo and gift-card codes from cart checkout links.`);
}

if (
  !checkoutFormText.includes("initialDiscountCode") ||
  !checkoutFormText.includes("initialGiftCardCode") ||
  !checkoutFormText.includes("useState(initialDiscountCode") ||
  !checkoutFormText.includes("useState(initialGiftCardCode")
) {
  failures.push(`${checkoutFormPath} must hydrate promo and gift-card fields from cart checkout links.`);
}

if (
  !storefrontNavigationText.includes('aria-label="Mobile storefront navigation"') ||
  !storefrontNavigationText.includes("md:hidden") ||
  !storefrontNavigationText.includes('/contact') ||
  !storefrontNavigationText.includes('/gift-cards') ||
  !storefrontNavigationText.includes('/policies') ||
  !storefrontNavigationText.includes('/recently-viewed') ||
  !storefrontNavigationText.includes('/wishlist')
) {
  failures.push(`${storefrontNavigationPath} must keep core storefront links discoverable on mobile, including contact, gift cards, policies, recently viewed, and wishlist.`);
}

if (
  !storefrontCartText.includes("WishlistButton") ||
  !storefrontCartText.includes("getProductCardCompareHref") ||
  !storefrontCartText.includes("Compare")
) {
  failures.push(`${storefrontCartPath} must expose wishlist and compare actions from product grid cards.`);
}

if (
  !storefrontCartText.includes("selectedVariantIds") ||
  !storefrontCartText.includes("updateSelectedVariant") ||
  !storefrontCartText.includes("getDefaultProductVariant") ||
  !storefrontCartText.includes("productCardPriceCents") ||
  !storefrontCartText.includes("selectedVariant?.priceCents") ||
  !storefrontCartText.includes("addProduct(product, selectedVariant?.id") ||
  !storefrontCartText.includes("variant.optionName}: {variant.optionValue")
) {
  failures.push(`${storefrontCartPath} must let shoppers pick product-card variants before quick add.`);
}

if (
  !storefrontCartText.includes("productCardCompareAtCents") ||
  !storefrontCartText.includes("hasProductCardSale") ||
  !storefrontCartText.includes("line-through") ||
  !storefrontCartText.includes("Sale")
) {
  failures.push(`${storefrontCartPath} must merchandise sale pricing on storefront product cards.`);
}

if (
  !catalogFiltersText.includes("minPrice") ||
  !catalogFiltersText.includes("maxPrice") ||
  !catalogFiltersText.includes("saleOnly") ||
  !catalogFiltersText.includes("parseStorefrontFilterPriceCents") ||
  !catalogFiltersText.includes('params.set("sale", "true")') ||
  !storefrontSearchText.includes("minPriceCents") ||
  !storefrontSearchText.includes("maxPriceCents") ||
  !storefrontSearchText.includes("isStorefrontProductOnSale") ||
  !storefrontCartText.includes("setMinPrice") ||
  !storefrontCartText.includes("setMaxPrice") ||
  !storefrontCartText.includes("setSaleOnly") ||
  !storefrontCartText.includes("Min price") ||
  !storefrontCartText.includes("Max price") ||
  !storefrontCartText.includes("On sale") ||
  !storeSearchPageText.includes("minPrice") ||
  !storeSearchPageText.includes("maxPrice") ||
  !storeSearchPageText.includes("sale") ||
  !storeSearchPageText.includes("On sale")
) {
  failures.push("Storefront catalog filters must support shareable price range and on-sale filtering across grids and search.");
}

if (
  !productCardActionsText.includes("getProductCardCompareHref") ||
  !productCardActionsText.includes("encodeURIComponent") ||
  !productCardActionsText.includes("limit = 3") ||
  !productCardActionsText.includes("/compare?products=")
) {
  failures.push(`${productCardActionsPath} must keep product-card compare links deterministic and URL-safe.`);
}

if (
  !orderReceiptText.includes("getReorderCartLines") ||
  !orderReceiptText.includes("getReorderCheckoutHref") ||
  !orderReceiptText.includes("Buy again") ||
  !orderReceiptText.includes("Rebuild checkout")
) {
  failures.push(`${orderReceiptPath} must expose a buy-again checkout path on customer order receipts.`);
}

if (
  !orderReceiptText.includes("/invoice?token=") ||
  !orderReceiptText.includes("Print invoice")
) {
  failures.push(`${orderReceiptPath} must link customer receipts to a token-protected printable invoice.`);
}

if (
  !orderReceiptText.includes("/tracking?token=") ||
  !orderReceiptText.includes("Track order")
) {
  failures.push(`${orderReceiptPath} must link customer receipts to a token-protected tracking page.`);
}

if (
  !orderInvoiceText.includes("getPublicOrderReceipt") ||
  !orderInvoiceText.includes("PrintButton") ||
  !orderInvoiceText.includes("Customer invoice") ||
  !orderInvoiceText.includes("Order receipt") ||
  !orderInvoiceText.includes("index: false") ||
  !orderInvoiceText.includes("follow: false") ||
  !orderInvoiceText.includes("notFound()")
) {
  failures.push(`${orderInvoicePath} must render a noindex token-protected customer invoice from private receipt data.`);
}

if (
  !orderTrackingText.includes("getPublicOrderReceipt") ||
  !orderTrackingText.includes("Order tracking") ||
  !orderTrackingText.includes("Carrier tracking") ||
  !orderTrackingText.includes("Tracking timeline") ||
  !orderTrackingText.includes("index: false") ||
  !orderTrackingText.includes("follow: false") ||
  !orderTrackingText.includes("notFound()")
) {
  failures.push(`${orderTrackingPath} must render a noindex token-protected customer tracking page from private receipt data.`);
}

if (
  !orderReceiptText.includes("OrderCancellationRequestForm") ||
  !orderReceiptText.includes("getOrderCancellationEligibility") ||
  !orderReceiptText.includes("Cancellation request")
) {
  failures.push(`${orderReceiptPath} must expose customer cancellation request intake on order receipts.`);
}

if (
  !orderReceiptText.includes("OrderDeliveryRequestForm") ||
  !orderReceiptText.includes("getOrderDeliveryRequestEligibility") ||
  !orderReceiptText.includes("Delivery update request")
) {
  failures.push(`${orderReceiptPath} must expose customer delivery update request intake on order receipts.`);
}

if (
  !orderCancellationFormText.includes("/cancellation-requests") ||
  !orderCancellationFormText.includes("orderCancellationReasons") ||
  !orderCancellationFormText.includes("Request cancellation") ||
  !orderCancellationFormText.includes("Cancellation request received")
) {
  failures.push(`${orderCancellationFormPath} must post customer cancellation requests from order receipts.`);
}

if (
  !orderCancellationRouteText.includes("readLimitedJsonBody") ||
  !orderCancellationRouteText.includes("consumeRateLimit") ||
  !orderCancellationRouteText.includes("getPublicOrderReceipt") ||
  !orderCancellationRouteText.includes("getOrderCancellationEligibility") ||
  !orderCancellationRouteText.includes("store_notifications") ||
  !orderCancellationRouteText.includes("customer_cancellation_request") ||
  !orderCancellationRouteText.includes("Retry-After")
) {
  failures.push(`${orderCancellationRoutePath} must validate receipt tokens, rate-limit, and queue cancellation requests for merchant review.`);
}

if (
  !orderCancellationHelperText.includes("orderCancellationReasons") ||
  !orderCancellationHelperText.includes("getOrderCancellationEligibility") ||
  !orderCancellationHelperText.includes("createCancellationSubject") ||
  !orderCancellationHelperText.includes("createCancellationPreview")
) {
  failures.push(`${orderCancellationHelperPath} must keep cancellation eligibility, reasons, subjects, and previews reusable.`);
}

if (
  !orderDeliveryFormText.includes("/delivery-requests") ||
  !orderDeliveryFormText.includes("orderDeliveryRequestTypes") ||
  !orderDeliveryFormText.includes("Request delivery update") ||
  !orderDeliveryFormText.includes("Delivery request received")
) {
  failures.push(`${orderDeliveryFormPath} must post customer delivery requests from order receipts.`);
}

if (
  !orderDeliveryRouteText.includes("readLimitedJsonBody") ||
  !orderDeliveryRouteText.includes("consumeRateLimit") ||
  !orderDeliveryRouteText.includes("getPublicOrderReceipt") ||
  !orderDeliveryRouteText.includes("getOrderDeliveryRequestEligibility") ||
  !orderDeliveryRouteText.includes("store_notifications") ||
  !orderDeliveryRouteText.includes("customer_delivery_request") ||
  !orderDeliveryRouteText.includes("Retry-After")
) {
  failures.push(`${orderDeliveryRoutePath} must validate receipt tokens, rate-limit, and queue delivery requests for merchant review.`);
}

if (
  !orderDeliveryHelperText.includes("orderDeliveryRequestTypes") ||
  !orderDeliveryHelperText.includes("getOrderDeliveryRequestEligibility") ||
  !orderDeliveryHelperText.includes("createDeliveryRequestSubject") ||
  !orderDeliveryHelperText.includes("createDeliveryRequestPreview")
) {
  failures.push(`${orderDeliveryHelperPath} must keep delivery request eligibility, request types, subjects, and previews reusable.`);
}

if (
  !orderReorderText.includes("getCheckoutPermalink") ||
  !orderReorderText.includes("getReorderCartLines") ||
  !orderReorderText.includes("getReorderCheckoutHref") ||
  !orderReorderText.includes('product.status === "active"') ||
  !orderReorderText.includes('variant.status === "active"')
) {
  failures.push(`${orderReorderPath} must build reorder checkout links only from active products and variants.`);
}

if (
  !productPageText.includes("ProductQuestionForm") ||
  !productPageText.includes("Customer reviews") ||
  !productPageText.includes("Related products")
) {
  failures.push(`${productPagePath} must expose product questions alongside reviews and recommendations.`);
}

if (
  !productPageText.includes("approvedReviews") ||
  !productPageText.includes('review.status === "approved"') ||
  !productPageText.includes("getProductReviewDistribution") ||
  !productPageText.includes("Rating breakdown") ||
  !productPageText.includes("Verified purchase") ||
  !productPageText.includes("No approved reviews yet") ||
  !reviewsHelperText.includes("getProductReviewDistribution") ||
  !reviewsHelperText.includes('review.status === "approved"')
) {
  failures.push(`${productPagePath} must render only approved storefront reviews with a verified rating breakdown.`);
}

if (
  !productQuestionFormText.includes("/questions") ||
  !productQuestionFormText.includes("productQuestionTopics") ||
  !productQuestionFormText.includes("Ask question") ||
  !productQuestionFormText.includes("Product question received")
) {
  failures.push(`${productQuestionFormPath} must post product questions from product detail pages.`);
}

if (
  !productQuestionRouteText.includes("readLimitedJsonBody") ||
  !productQuestionRouteText.includes("consumeRateLimit") ||
  !productQuestionRouteText.includes("getClientFingerprint") ||
  !productQuestionRouteText.includes("getPublicStorefront") ||
  !productQuestionRouteText.includes("store_notifications") ||
  !productQuestionRouteText.includes("customer_product_question") ||
  !productQuestionRouteText.includes("createProductQuestionPreview") ||
  !productQuestionRouteText.includes("createProductQuestionSubject") ||
  !productQuestionRouteText.includes("Retry-After")
) {
  failures.push(`${productQuestionRoutePath} must validate product questions, rate-limit, and queue them for merchant support.`);
}

if (
  !productQuestionHelperText.includes("productQuestionTopics") ||
  !productQuestionHelperText.includes("productQuestionTopicLabels") ||
  !productQuestionHelperText.includes("createProductQuestionSubject") ||
  !productQuestionHelperText.includes("createProductQuestionPreview")
) {
  failures.push(`${productQuestionHelperPath} must keep product question topics, subjects, and previews reusable.`);
}

if (
  !contactRouteText.includes("readLimitedJsonBody") ||
  !contactRouteText.includes("consumeRateLimit") ||
  !contactRouteText.includes("getClientFingerprint") ||
  !contactRouteText.includes("store_notifications") ||
  !contactRouteText.includes("customer_message") ||
  !contactRouteText.includes("createContactPreview") ||
  !contactRouteText.includes("createContactSubject")
) {
  failures.push(`${contactRoutePath} must rate-limit public contact intake and route messages into the merchant support queue.`);
}

if (
  !contactFormText.includes("/contact") ||
  !contactFormText.includes("storefrontContactReasons") ||
  !contactFormText.includes("Send message")
) {
  failures.push(`${contactFormPath} must provide a customer-facing storefront contact form.`);
}

if (
  !contactPageText.includes("ContactForm") ||
  !contactPageText.includes("getPublicBaseUrl") ||
  !contactPageText.includes("canonical")
) {
  failures.push(`${contactPagePath} must render the contact form as an indexable storefront support page.`);
}

if (
  !giftCardBalanceRouteText.includes("readLimitedJsonBody") ||
  !giftCardBalanceRouteText.includes("consumeRateLimit") ||
  !giftCardBalanceRouteText.includes("getClientFingerprint") ||
  !giftCardBalanceRouteText.includes("normalizeGiftCardCode") ||
  !giftCardBalanceRouteText.includes("maskGiftCardCode") ||
  !giftCardBalanceRouteText.includes("canRedeemGiftCard") ||
  !giftCardBalanceRouteText.includes("maybeSingle") ||
  !giftCardBalanceRouteText.includes("mockGiftCards")
) {
  failures.push(`${giftCardBalanceRoutePath} must rate-limit public gift-card balance lookups and return masked card details only.`);
}

if (
  !giftCardBalanceFormText.includes("/gift-cards/balance") ||
  !giftCardBalanceFormText.includes("formatCurrency") ||
  !giftCardBalanceFormText.includes("Check balance")
) {
  failures.push(`${giftCardBalanceFormPath} must provide a customer-facing balance lookup form.`);
}

if (
  !giftCardBalancePageText.includes("GiftCardBalanceForm") ||
  !giftCardBalancePageText.includes("index: false") ||
  !giftCardBalancePageText.includes("follow: false")
) {
  failures.push(`${giftCardBalancePagePath} must render the balance form as a noindex storefront utility page.`);
}

if (
  !newsletterRouteText.includes("readLimitedJsonBody") ||
  !newsletterRouteText.includes("consumeRateLimit") ||
  !newsletterRouteText.includes("getClientFingerprint") ||
  !newsletterRouteText.includes("customer_profiles") ||
  !newsletterRouteText.includes("mergeNewsletterTags") ||
  !newsletterRouteText.includes("accepts_marketing: true") ||
  !newsletterRouteText.includes('onConflict: "store_id,email"')
) {
  failures.push(`${newsletterRoutePath} must rate-limit public newsletter signups and merge them into marketing customer profiles.`);
}

if (
  !newsletterHelperText.includes('["lead", "newsletter"]') ||
  !newsletterHelperText.includes("mergeNewsletterTags") ||
  !newsletterHelperText.includes("createNewsletterNote")
) {
  failures.push(`${newsletterHelperPath} must preserve newsletter lead tagging and note helpers.`);
}

if (
  !newsletterFormText.includes("/newsletter") ||
  !newsletterFormText.includes("acceptsMarketing: true") ||
  !newsletterFormText.includes("Subscribe")
) {
  failures.push(`${newsletterFormPath} must provide a customer-facing newsletter signup form with explicit marketing consent.`);
}

if (
  !restockAlertRouteText.includes("readLimitedJsonBody") ||
  !restockAlertRouteText.includes("consumeRateLimit") ||
  !restockAlertRouteText.includes("getClientFingerprint") ||
  !restockAlertRouteText.includes("customer_profiles") ||
  !restockAlertRouteText.includes("mergeRestockAlertTags") ||
  !restockAlertRouteText.includes("accepts_marketing: true") ||
  !restockAlertRouteText.includes('onConflict: "store_id,email"')
) {
  failures.push(`${restockAlertRoutePath} must rate-limit public restock alerts and merge them into customer profiles.`);
}

if (
  !restockAlertHelperText.includes('["lead", "restock-alert"]') ||
  !restockAlertHelperText.includes("mergeRestockAlertTags") ||
  !restockAlertHelperText.includes("createRestockAlertNote")
) {
  failures.push(`${restockAlertHelperPath} must preserve restock lead tagging and note helpers.`);
}

if (
  !restockAlertFormText.includes("/restock-alerts") ||
  !restockAlertFormText.includes("acceptsMarketing: true") ||
  !restockAlertFormText.includes("Notify me")
) {
  failures.push(`${restockAlertFormPath} must provide a customer-facing product restock alert form with explicit marketing consent.`);
}

if (!productPageText.includes("RestockAlertForm")) {
  failures.push(`${productPagePath} must expose restock alert capture on public product pages.`);
}

if (!productPageText.includes("ProductDetailActions")) {
  failures.push(`${productPagePath} must keep product purchase and wishlist actions on public product pages.`);
}

if (
  !productPageText.includes("searchParams") ||
  !productPageText.includes("initialVariantId") ||
  !productPageText.includes("variant")
) {
  failures.push(`${productPagePath} must pass selected variant query params into product purchase controls.`);
}

if (!productPageText.includes("RecentlyViewedTracker")) {
  failures.push(`${productPagePath} must record product views for storefront recently viewed history.`);
}

if (
  !recentlyViewedPageText.includes("RecentlyViewedProductsPage") ||
  !recentlyViewedPageText.includes("index: false") ||
  !recentlyViewedPageText.includes("follow: false")
) {
  failures.push(`${recentlyViewedPagePath} must render recently viewed products as a noindex storefront utility page.`);
}

if (
  !recentlyViewedProductsPageText.includes("useRecentlyViewedProducts") ||
  !recentlyViewedProductsPageText.includes("Recently viewed") ||
  !recentlyViewedProductsPageText.includes("Clear history") ||
  !recentlyViewedProductsPageText.includes("Viewed products")
) {
  failures.push(`${recentlyViewedProductsPagePath} must render recently viewed products with clear-history and empty states.`);
}

if (
  !recentlyViewedStoreText.includes("zendora-recently-viewed") ||
  !recentlyViewedStoreText.includes("useSyncExternalStore") ||
  !recentlyViewedStoreText.includes("RecentlyViewedTracker") ||
  !recentlyViewedStoreText.includes("recordRecentlyViewedProductId")
) {
  failures.push(`${recentlyViewedStorePath} must store and track recently viewed products client-side.`);
}

if (
  !recentlyViewedHelperText.includes("getRecentlyViewedStorageKey") ||
  !recentlyViewedHelperText.includes("normalizeRecentlyViewedProductIds") ||
  !recentlyViewedHelperText.includes("recordRecentlyViewedProductId") ||
  !recentlyViewedHelperText.includes("limit = 12")
) {
  failures.push(`${recentlyViewedHelperPath} must keep recently viewed storage, normalization, and recording reusable.`);
}

if (
  !productDetailActionsText.includes("WishlistButton") ||
  !productDetailActionsText.includes("Buy now") ||
  !productDetailActionsText.includes("Checkout cart")
) {
  failures.push(`${productDetailActionsPath} must keep buy-now, cart, and wishlist actions available on product pages.`);
}

if (
  !productDetailActionsText.includes("purchaseQuantity") ||
  !productDetailActionsText.includes("requestedPurchaseQuantity") ||
  !productDetailActionsText.includes("updatePurchaseQuantity") ||
  !productDetailActionsText.includes("Decrease purchase quantity") ||
  !productDetailActionsText.includes("Increase purchase quantity") ||
  !productDetailActionsText.includes("selectedQuantity + requestedPurchaseQuantity")
) {
  failures.push(`${productDetailActionsPath} must let customers choose purchase quantity before add-to-cart and buy-now.`);
}

if (
  !productDetailActionsText.includes("updateSelectedVariant") ||
  !productDetailActionsText.includes("window.history.replaceState") ||
  !productDetailActionsText.includes('url.searchParams.set("variant"') ||
  !productDetailActionsText.includes("Selected variant") ||
  !productDetailActionsText.includes("Availability") ||
  !productDetailActionsText.includes("stockLabel")
) {
  failures.push(`${productDetailActionsPath} must expose shareable selected-variant URLs with clear SKU and stock state.`);
}

if (
  !productDetailActionsText.includes("compareAtCents") ||
  !productDetailActionsText.includes("hasSalePrice") ||
  !productDetailActionsText.includes("savingsCents") ||
  !productDetailActionsText.includes("line-through") ||
  !productDetailActionsText.includes("Save") ||
  !productDetailActionsText.includes("Sale")
) {
  failures.push(`${productDetailActionsPath} must show variant-aware sale pricing and savings on product pages.`);
}

if (
  !sourceText.includes("compareAtPrice") ||
  !sourceText.includes("parseOptionalCompareAtCents") ||
  !sourceText.includes("compareAtCents <= priceCents") ||
  !sourceText.includes("compare_at_cents") ||
  !createProductFormText.includes("compareAtPrice") ||
  !editProductFormText.includes("compareAtPrice") ||
  !createProductFormText.includes("Compare-at price") ||
  !editProductFormText.includes("Compare-at price")
) {
  failures.push("Catalog product forms and actions must support validated compare-at sale pricing.");
}

if (
  !wishlistPageText.includes("StorefrontWishlistPage") ||
  !wishlistPageText.includes("index: false") ||
  !wishlistPageText.includes("follow: false")
) {
  failures.push(`${wishlistPagePath} must render the wishlist as a noindex storefront utility page.`);
}

if (
  !wishlistButtonText.includes("useStoreWishlist") ||
  !wishlistButtonText.includes("Save to wishlist") ||
  !wishlistButtonText.includes("aria-pressed")
) {
  failures.push(`${wishlistButtonPath} must provide an accessible product save-to-wishlist button.`);
}

if (
  !storefrontWishlistPageText.includes("useStoreWishlist") ||
  !storefrontWishlistPageText.includes("useStoreCart") ||
  !storefrontWishlistPageText.includes("Saved products") ||
  !storefrontWishlistPageText.includes("Clear wishlist") ||
  !storefrontWishlistPageText.includes("Add to cart")
) {
  failures.push(`${storefrontWishlistPagePath} must render saved products and allow moving them to cart.`);
}

if (
  !wishlistHelperText.includes("getWishlistStorageKey") ||
  !wishlistHelperText.includes("normalizeWishlistProductIds") ||
  !wishlistHelperText.includes("limit = 50")
) {
  failures.push(`${wishlistHelperPath} must keep wishlist storage and normalization reusable.`);
}

if (
  !productPageText.includes("getRelatedProducts") ||
  !productPageText.includes("Related products") ||
  !productPageText.includes("Complete the set")
) {
  failures.push(`${productPagePath} must expose a storefront related-products cross-sell section.`);
}

if (
  !productRecommendationsText.includes("getSharedCollections") ||
  !productRecommendationsText.includes("sharedCollections.length * 100") ||
  !productRecommendationsText.includes("sameCategory * 40") ||
  !productRecommendationsText.includes("inventoryScore * 10") ||
  !productRecommendationsText.includes("Pairs from")
) {
  failures.push(`${productRecommendationsPath} must rank product recommendations by shared collections, category, and sellable inventory.`);
}

if (
  !comparePageText.includes("parseCompareProductKeys") ||
  !comparePageText.includes("getProductCompareMetrics") ||
  !comparePageText.includes("index: false") ||
  !comparePageText.includes("follow: false") ||
  !comparePageText.includes("Product comparison")
) {
  failures.push(`${comparePagePath} must render a noindex storefront product comparison utility page.`);
}

if (
  !productCompareHelperText.includes("parseCompareProductKeys") ||
  !productCompareHelperText.includes("getCompareProducts") ||
  !productCompareHelperText.includes("getProductCompareMetrics") ||
  !productCompareHelperText.includes("getStorefrontProductInventory") ||
  !productCompareHelperText.includes("fallbackLimit = 3") ||
  !productCompareHelperText.includes("Available stock")
) {
  failures.push(`${productCompareHelperPath} must keep product comparison parsing, fallback selection, and metrics reusable.`);
}

if (
  !privacyRequestRouteText.includes("readLimitedJsonBody") ||
  !privacyRequestRouteText.includes("consumeRateLimit") ||
  !privacyRequestRouteText.includes("getClientFingerprint") ||
  !privacyRequestRouteText.includes("customer_profiles") ||
  !privacyRequestRouteText.includes("store_notifications") ||
  !privacyRequestRouteText.includes("customer_privacy_request") ||
  !privacyRequestRouteText.includes("mergePrivacyRequestTags") ||
  !privacyRequestRouteText.includes("accepts_marketing")
) {
  failures.push(`${privacyRequestRoutePath} must rate-limit public privacy requests, preserve opt-out intent, and route them into merchant review.`);
}

if (
  !privacyRequestHelperText.includes("privacyRequestTypes") ||
  !privacyRequestHelperText.includes("mergePrivacyRequestTags") ||
  !privacyRequestHelperText.includes("createPrivacyRequestSubject")
) {
  failures.push(`${privacyRequestHelperPath} must preserve privacy request types, tagging, and merchant-facing subjects.`);
}

if (
  !privacyRequestFormText.includes("/privacy-requests") ||
  !privacyRequestFormText.includes("privacyRequestTypes") ||
  !privacyRequestFormText.includes("Submit request")
) {
  failures.push(`${privacyRequestFormPath} must provide a customer-facing privacy request form.`);
}

if (
  !privacyRequestPageText.includes("PrivacyRequestForm") ||
  !privacyRequestPageText.includes("index: false") ||
  !privacyRequestPageText.includes("follow: false")
) {
  failures.push(`${privacyRequestPagePath} must render the privacy request form as a noindex storefront utility page.`);
}

if (
  !policiesIndexText.includes("/privacy-requests") ||
  !policyDetailText.includes("/privacy-requests")
) {
  failures.push("Store policy pages must link customers to the privacy request intake path.");
}

if (
  !csvExportText.includes("spreadsheetFormulaPattern") ||
  !csvExportText.includes('"Content-Disposition"') ||
  !csvExportText.includes('"text/csv; charset=utf-8"')
) {
  failures.push(`${csvExportPath} must return attachment CSV responses and neutralize spreadsheet formulas.`);
}

if (
  !packageEbText.includes("isForbiddenBundleFile") ||
  !packageEbText.includes("requiredExecutableFiles") ||
  !packageEbText.includes("statSync") ||
  !packageEbText.includes("0o111") ||
  !packageEbText.includes('new Set([".env"])') ||
  !packageEbText.includes('".env."') ||
  !packageEbText.includes('".next/"') ||
  !packageEbText.includes('".vercel/"') ||
  !packageEbText.includes('"build/"') ||
  !packageEbText.includes('"coverage/"') ||
  !packageEbText.includes('"dist/"') ||
  !packageEbText.includes('"node_modules/"') ||
  !packageEbText.includes('"out/"') ||
  !packageEbText.includes('"git"') ||
  !packageEbText.includes('"ls-files"') ||
  !packageEbText.includes('"unzip"') ||
  !packageEbText.includes('["-Z1", outputPath]') ||
  !packageEbText.includes("missingBundledRequiredFiles") ||
  !packageEbText.includes("bundledForbiddenFiles")
) {
  failures.push(`${packageEbPath} must package tracked source while excluding env files and build artifacts.`);
}

if (
  buildfileText.trim() !== "build: npm run build" ||
  procfileText.trim() !== "web: npm run start:eb" ||
  packageJson.scripts?.["start:eb"] !== "next start -p ${PORT:-8080}" ||
  !predeployHookText.includes("/var/app/staging") ||
  !predeployHookText.includes("NODE_ENV=production") ||
  !predeployHookText.includes("NEXT_TELEMETRY_DISABLED=1") ||
  !predeployHookText.includes("NODE_OPTIONS") ||
  !predeployHookText.includes("--max-old-space-size") ||
  !predeployHookText.includes("npm run build") ||
  !prebuildHookText.includes("swapon") ||
  !prebuildHookText.includes("mkswap") ||
  !prebuildHookText.includes("chmod 600")
) {
  failures.push("EB build/startup files must keep production build, port binding, and swap safeguards configured.");
}

if (
  !nextConfigText.includes("poweredByHeader: false") ||
  !nextConfigText.includes('"Content-Security-Policy"') ||
  !nextConfigText.includes("default-src 'self'") ||
  !nextConfigText.includes("script-src 'self'") ||
  !nextConfigText.includes("connect-src 'self'") ||
  !nextConfigText.includes("https://*.supabase.co") ||
  !nextConfigText.includes("https://*.clerk.com") ||
  !nextConfigText.includes("object-src 'none'") ||
  !nextConfigText.includes("base-uri 'self'") ||
  !nextConfigText.includes("frame-ancestors 'none'") ||
  !nextConfigText.includes('"Strict-Transport-Security"') ||
  !nextConfigText.includes('"X-Content-Type-Options"') ||
  !nextConfigText.includes('"X-Frame-Options"') ||
  !nextConfigText.includes('"Referrer-Policy"') ||
  !nextConfigText.includes('"Permissions-Policy"')
) {
  failures.push(`${nextConfigPath} must keep production browser security headers and CSP configured.`);
}

if (
  !abandonedCheckoutRouteText.includes("readLimitedJsonBody(") ||
  !abandonedCheckoutRouteText.includes("consumeRateLimit(") ||
  !abandonedCheckoutRouteText.includes("getClientFingerprint(") ||
  !abandonedCheckoutRouteText.includes('"Retry-After"')
) {
  failures.push(`${abandonedCheckoutRoutePath} must guard public abandoned-checkout capture requests.`);
}

if (
  !clerkWebhookRouteText.includes("getContentLengthLimitError(") ||
  !clerkWebhookRouteText.includes("WEBHOOK_BODY_LIMIT_BYTES") ||
  !clerkWebhookRouteText.includes("verifyWebhook(req)")
) {
  failures.push(`${clerkWebhookRoutePath} must reject oversized webhook bodies before signature verification.`);
}

if (
  !sourceText.includes("consumePublicServerActionRateLimit(") ||
  !sourceText.includes("publicCheckoutActionRateLimit") ||
  !sourceText.includes("publicCustomerActionRateLimit") ||
  !sourceText.includes("`checkout:${storeSlug}:") ||
  !sourceText.includes("`return-request:${storeSlug}:${orderId}`") ||
  !sourceText.includes("`product-review:${storeSlug}:${orderId}:${parsed.data.orderItemId}`")
) {
  failures.push("Public checkout, return, and review Server Actions must enforce request throttling.");
}

if (
  !schemaText.includes(
    "create table if not exists public.order_payment_transactions",
  )
) {
  failures.push(`${schemaPath} is missing order_payment_transactions.`);
}

if (
  !schemaText.includes("order_payment_transactions_provider_reference_unique_idx")
) {
  failures.push(`${schemaPath} is missing payment provider reference uniqueness.`);
}

if (
  !schemaText.includes("discount_codes_value_bounds_check") ||
  !schemaText.includes("discount_codes_redemption_limit_check") ||
  !schemaText.includes("discount_codes_date_window_check")
) {
  failures.push(`${schemaPath} must enforce discount value, usage, and date-window rules.`);
}

if (
  !schemaText.includes("products_price_nonnegative_check") ||
  !schemaText.includes("products_compare_at_price_check") ||
  !schemaText.includes("products_inventory_nonnegative_check") ||
  !schemaText.includes("product_variants_price_nonnegative_check") ||
  !schemaText.includes("product_variants_compare_at_price_check") ||
  !schemaText.includes("product_variants_inventory_nonnegative_check") ||
  !schemaText.includes("collections_sort_order_nonnegative_check") ||
  !schemaText.includes("collection_products_sort_order_nonnegative_check") ||
  !schemaText.includes("product_variants_sort_order_nonnegative_check")
) {
  failures.push(`${schemaPath} must enforce catalog price, inventory, and sort-order integrity.`);
}

if (!schemaText.includes("customer_access_token")) {
  failures.push(`${schemaPath} is missing customer_access_token for order receipts.`);
}

if (
  !schemaText.includes("client_order_key") ||
  !schemaText.includes("orders_store_client_order_key_unique_idx")
) {
  failures.push(`${schemaPath} is missing checkout idempotency columns or index.`);
}

if (
  !schemaText.includes("orders_discount_not_above_subtotal_check") ||
  !schemaText.includes("orders_total_math_check") ||
  !schemaText.includes("orders_gift_card_not_above_total_check") ||
  !schemaText.includes("orders_amount_due_not_above_payable_check")
) {
  failures.push(`${schemaPath} must enforce order money integrity constraints.`);
}

if (
  !schemaText.includes("orders_paid_timestamp_check") ||
  !schemaText.includes("orders_fulfilled_timestamp_check") ||
  !schemaText.includes("orders_cancelled_timestamp_check")
) {
  failures.push(`${schemaPath} must enforce order lifecycle timestamp constraints.`);
}

if (
  !schemaText.includes("store_policies_published_timestamp_check") ||
  !schemaText.includes("store_pages_published_timestamp_check") ||
  !schemaText.includes("product_reviews_moderation_timestamp_check") ||
  !schemaText.includes("order_fulfillments_lifecycle_timestamp_check") ||
  !schemaText.includes("order_return_requests_resolution_timestamp_check")
) {
  failures.push(`${schemaPath} must enforce publish, moderation, fulfillment, and return lifecycle timestamps.`);
}

if (!schemaText.includes("create table if not exists public.order_return_requests")) {
  failures.push(`${schemaPath} is missing order_return_requests.`);
}

if (!schemaText.includes("order_return_requests_active_order_unique_idx")) {
  failures.push(`${schemaPath} is missing active return request uniqueness guard.`);
}

if (!schemaText.includes("create table if not exists public.abandoned_checkouts")) {
  failures.push(`${schemaPath} is missing abandoned_checkouts.`);
}

if (!schemaText.includes("create table if not exists public.product_reviews")) {
  failures.push(`${schemaPath} is missing product_reviews.`);
}

if (!schemaText.includes("create table if not exists public.gift_cards")) {
  failures.push(`${schemaPath} is missing gift_cards.`);
}

if (!schemaText.includes("create table if not exists public.gift_card_redemptions")) {
  failures.push(`${schemaPath} is missing gift_card_redemptions.`);
}

if (
  !schemaText.includes("gift_cards_balance_not_above_initial_check") ||
  !schemaText.includes("gift_card_redemptions_balance_math_check")
) {
  failures.push(`${schemaPath} must enforce gift-card balance and redemption math.`);
}

if (!schemaText.includes("gift_card_cents") || !schemaText.includes("payment_cents")) {
  failures.push(`${schemaPath} is missing refund tender split columns.`);
}

if (
  !schemaText.includes("order_refunds_tender_sum_check") ||
  !schemaText.includes("enforce_order_refund_limit") ||
  !schemaText.includes("order_refunds_enforce_refund_limit")
) {
  failures.push(`${schemaPath} must enforce refund tender sums and cumulative refund limits.`);
}

if (!schemaText.includes("create table if not exists public.store_pages")) {
  failures.push(`${schemaPath} is missing store_pages.`);
}

if (!schemaText.includes("create table if not exists public.store_navigation_menus")) {
  failures.push(`${schemaPath} is missing store_navigation_menus.`);
}

if (!schemaText.includes("create table if not exists public.order_fulfillments")) {
  failures.push(`${schemaPath} is missing order_fulfillments.`);
}

if (!schemaText.includes("create table if not exists public.customer_profiles")) {
  failures.push(`${schemaPath} is missing customer_profiles.`);
}

const expectedSmokeRoutes = [
  "/stores/northline-supply",
  "/stores/northline-supply/products/hydra-bottle",
  "/stores/northline-supply/products/field-carry-pack",
  "/stores/northline-supply/products/field-carry-pack?variant=demo-variant-carry-pack-clay",
  "/stores/northline-supply/products/trail-watch",
  "/stores/northline-supply/compare?products=field-carry-pack,hydra-bottle,trail-watch",
  "/stores/northline-supply/collections",
  "/stores/northline-supply/collections/everyday-carry",
  "/stores/northline-supply/collections/all?q=bottle&sort=price-asc",
  "/stores/northline-supply/collections/all?minPrice=40&maxPrice=45&sale=true",
  "/stores/northline-supply/contact",
  "/api/stores/northline-supply/contact",
  "/api/stores/northline-supply/products/demo-product-carry-pack/questions",
  "/api/stores/northline-supply/newsletter",
  "/api/stores/northline-supply/restock-alerts",
  "/api/stores/northline-supply/privacy-requests",
  "/api/stores/northline-supply/orders/demo-order-1001/cancellation-requests",
  "/api/stores/northline-supply/orders/demo-order-1001/delivery-requests",
  "/stores/northline-supply/cart",
  "/stores/northline-supply/search?q=bottle&category=Drinkware&availability=available&minPrice=40&maxPrice=45&sale=true&sort=price-asc",
  "/stores/northline-supply/checkout",
  "/api/stores/northline-supply/checkout-preview",
  "/stores/northline-supply/orders",
  "/stores/northline-supply/gift-cards",
  "/api/stores/northline-supply/gift-cards/balance",
  "/stores/northline-supply/orders/demo-order-1001?token=demo-token-1001",
  "/stores/northline-supply/orders/demo-order-1001/invoice?token=demo-token-1001",
  "/stores/northline-supply/orders/demo-order-1002/tracking?token=demo-token-1002",
  "/stores/northline-supply/pages/about",
  "/stores/northline-supply/policies",
  "/stores/northline-supply/policies/refund",
  "/stores/northline-supply/policies/privacy",
  "/stores/northline-supply/privacy-requests",
  "/stores/northline-supply/recently-viewed",
  "/stores/northline-supply/wishlist",
  "/dashboard/stores/demo-store-outdoor/export",
  "/dashboard/stores/demo-store-outdoor/configuration/export",
  "/dashboard/stores/demo-store-outdoor/seo/export",
  "/dashboard/stores/demo-store-outdoor/shipping/export",
  "/dashboard/stores/demo-store-outdoor/marketing/export",
  "/dashboard/stores/demo-store-outdoor/team/export",
  "/dashboard/stores/demo-store-outdoor/collections/export",
  "/dashboard/stores/demo-store-outdoor/analytics/export",
  "/dashboard/stores/demo-store-outdoor/analytics/funnel/export",
  "/dashboard/stores/demo-store-outdoor/analytics/payments/export",
  "/dashboard/stores/demo-store-outdoor/analytics/payouts/export",
  "/dashboard/stores/demo-store-outdoor/analytics/products/export",
  "/dashboard/stores/demo-store-outdoor/analytics/taxes/export",
  "/dashboard/stores/demo-store-outdoor/activity/export?priority=critical&q=tracking",
  "/dashboard/stores/demo-store-outdoor/activity/outbox/export",
  "/dashboard/stores/demo-store-outdoor/activity/support/export",
  "/dashboard/stores/demo-store-outdoor/gift-cards/export",
  "/dashboard/stores/demo-store-outdoor/checkouts/export?q=bottle&status=open",
  "/dashboard/stores/demo-store-outdoor/checkouts/recovery/export?q=bottle&status=open&sort=recovery_priority",
  "/dashboard/stores/demo-store-outdoor/promotions/export",
  "/dashboard/stores/demo-store-outdoor/promotions/performance/export",
  "/dashboard/stores/demo-store-outdoor/returns/export",
  "/dashboard/stores/demo-store-outdoor/returns/sla/export",
  "/dashboard/stores/demo-store-outdoor/reviews/export",
  "/dashboard/stores/demo-store-outdoor/reviews/moderation/export",
  "/dashboard/stores/demo-store-outdoor/products/variants/export?q=bottle&sort=inventory_asc",
  "/dashboard/stores/demo-store-outdoor/products/feed/export",
  "/dashboard/stores/demo-store-outdoor/products/import-template/export",
  "/dashboard/stores/demo-store-outdoor/products/demo-product-hydra-bottle/export",
  "/dashboard/stores/demo-store-outdoor/inventory/reorder/export?q=bottle&inventory=all&sort=reorder_desc",
  "/dashboard/stores/demo-store-outdoor/inventory/purchase-order/export?q=bottle&inventory=all&sort=reorder_desc",
  "/dashboard/stores/demo-store-outdoor/inventory/restock-alerts/export",
  "/dashboard/stores/demo-store-outdoor/inventory/valuation/export",
  "/dashboard/stores/demo-store-outdoor/inventory/adjustments/export",
  "/dashboard/stores/demo-store-outdoor/orders/export?q=mira&financial=settled",
  "/dashboard/stores/demo-store-outdoor/orders/payments-due/export?payment=pending&financial=open_balance",
  "/dashboard/stores/demo-store-outdoor/orders/fulfillment/export?payment=paid&fulfillment=unfulfilled",
  "/dashboard/stores/demo-store-outdoor/orders/pick-list/export?payment=paid&fulfillment=unfulfilled",
  "/dashboard/stores/demo-store-outdoor/orders/shipping-manifest/export?payment=paid&fulfillment=unfulfilled",
  "/dashboard/stores/demo-store-outdoor/orders/sla/export?payment=paid&fulfillment=unfulfilled",
  "/dashboard/stores/demo-store-outdoor/orders/risk/export?risk=high",
  "/dashboard/stores/demo-store-outdoor/orders/demo-order-1001/export",
  "/dashboard/stores/demo-store-outdoor/customers/segments/export?segment=vip&sort=risk_priority",
  "/dashboard/stores/demo-store-outdoor/customers/lifetime/export?segment=vip&sort=risk_priority",
  "/dashboard/stores/demo-store-outdoor/customers/retention/export?segment=vip&sort=risk_priority",
  "/dashboard/stores/demo-store-outdoor/customers/privacy/export?segment=vip&sort=risk_priority",
  "/dashboard/stores/demo-store-outdoor/customers/mira%40example.com/export",
  "/dashboard/stores/missing-store",
];

for (const route of expectedSmokeRoutes) {
  if (!smokeText.includes(route)) {
    failures.push(`${smokePath} is missing storefront smoke coverage for ${route}.`);
  }
}

if (
  !smokeText.includes('label: "missing dashboard store"') ||
  !smokeText.includes('excludes: ["Northline Supply", "Mira Chen", "Hydra Bottle"]') ||
  !smokeText.includes('visibleBody.includes("noindex")')
) {
  failures.push(`${smokePath} must verify missing dashboard stores return 404 with noindex and without private demo data.`);
}

if (!sourceText.includes("createCustomerAccessToken()")) {
  failures.push("Checkout/manual order mutations must create customer access tokens.");
}

if (
  !sourceText.includes("normalizeCheckoutSessionId(") ||
  !sourceText.includes("getExistingCheckoutOrder(") ||
  !sourceText.includes("client_order_key")
) {
  failures.push("Checkout mutation must enforce client order idempotency.");
}

if (
  !sourceText.includes("rollbackInventoryReservationCount(") ||
  !sourceText.includes("rollbackDiscountRedemptionReservation(") ||
  !sourceText.includes("rollbackGiftCardReservation(")
) {
  failures.push("Checkout rollback must use concurrency-safe reservation helpers.");
}

if (
  sourceText.includes(
    ".update({ redemption_count: discount.row.redemption_count })",
  ) ||
  sourceText.includes(
    ".update({ balance_cents: reservedGiftCard.balanceBeforeCents })",
  ) ||
  sourceText.includes("inventory_count: item.productInventoryCount")
) {
  failures.push("Checkout rollback must not reset inventory, discount, or gift-card state to stale snapshots.");
}

if (!sourceText.includes("getPaymentCaptureAmountCents(")) {
  failures.push("Payment capture mutations must use amount-due capture calculation.");
}

if (
  !sourceText.includes("providerReference && isUniqueConstraintError(error)") ||
  !sourceText.includes("This payment reference is already recorded.")
) {
  failures.push("Payment transaction inserts must handle provider reference conflicts cleanly.");
}

if (!sourceText.includes("amount_due_cents: 0")) {
  failures.push("Payment capture mutations must clear amount_due_cents.");
}

if (!sourceText.includes("calculateGiftCardRefundAmount(")) {
  failures.push("Refund mutations must split gift-card and payment refunds.");
}

if (!sourceText.includes("isRefundLimitError(")) {
  failures.push("Refund mutations must handle database refund-limit conflicts cleanly.");
}

if (!sourceText.includes("getCustomerReturnRequestEligibility(")) {
  failures.push("Return request mutations must enforce the shared eligibility policy.");
}

if (!sourceText.includes("canTransitionReturnRequestStatus(")) {
  failures.push("Return request mutations must enforce safe status transitions.");
}

if (!sourceText.includes("A return request is already open for this order.")) {
  failures.push("Return request mutation must handle duplicate active-request conflicts.");
}

if (
  !sourceText.includes("canCancelOrderPaymentStatus(") ||
  !sourceText.includes('payment_status = "voided"') ||
  !sourceText.includes('type: "void"')
) {
  failures.push("Order cancellation must enforce payment safety and void open payments.");
}

function isExportedFunction(node) {
  return (
    ts.isFunctionDeclaration(node) &&
    node.name &&
    node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

function checkAuditEvent(actionName, bodyText, expectedAuditEvent) {
  if (!bodyText.includes("recordAuditEvent(")) {
    failures.push(`${actionName} is missing recordAuditEvent().`);
    return;
  }

  if (!bodyText.includes(`"${expectedAuditEvent}"`)) {
    failures.push(`${actionName} must record ${expectedAuditEvent}.`);
  }
}

function checkNotification(actionName, bodyText, expectedNotification) {
  if (!bodyText.includes("queueNotification(")) {
    failures.push(`${actionName} is missing queueNotification().`);
    return;
  }

  if (!bodyText.includes(`"${expectedNotification}"`)) {
    failures.push(`${actionName} must queue ${expectedNotification}.`);
  }
}

for (const statement of sourceFile.statements) {
  if (!isExportedFunction(statement)) {
    continue;
  }

  const actionName = statement.name.text;
  const expectedPermission = expectedGuards.get(actionName);
  const bodyText = statement.body?.getFullText(sourceFile) || "";
  const expectedAuditEvent = expectedAuditEvents.get(actionName);
  const expectedNotification = expectedNotifications.get(actionName);

  if (!expectedPermission) {
    if (!expectedAuditEvent && !expectedNotification) {
      continue;
    }

    if (expectedAuditEvent) {
      checkAuditEvent(actionName, bodyText, expectedAuditEvent);
    }

    if (expectedNotification) {
      checkNotification(actionName, bodyText, expectedNotification);
    }

    continue;
  }

  if (!bodyText.includes("assertStorePermission(")) {
    failures.push(`${actionName} is missing assertStorePermission().`);
    continue;
  }

  if (!bodyText.includes(`"${expectedPermission}"`)) {
    failures.push(`${actionName} must require ${expectedPermission}.`);
  }

  if (
    expectedLaunchReadinessGuards.has(actionName) &&
    !bodyText.includes("getStoreLaunchReadiness(")
  ) {
    failures.push(`${actionName} must enforce store launch readiness.`);
  }

  if (
    actionName === "createRefundAction" &&
    !bodyText.includes("isRefundLimitError(")
  ) {
    failures.push("createRefundAction must handle database refund-limit conflicts cleanly.");
  }

  if (expectedAuditEvent) {
    checkAuditEvent(actionName, bodyText, expectedAuditEvent);
  }

  if (expectedNotification) {
    checkNotification(actionName, bodyText, expectedNotification);
  }
}

for (const [actionName] of expectedGuards) {
  if (!sourceText.includes(`function ${actionName}`)) {
    failures.push(`${actionName} is missing from ${actionsPath}.`);
  }
}

for (const [actionName] of expectedAuditEvents) {
  if (!sourceText.includes(`function ${actionName}`)) {
    failures.push(`${actionName} is missing from ${actionsPath}.`);
  }
}

for (const [actionName] of expectedNotifications) {
  if (!sourceText.includes(`function ${actionName}`)) {
    failures.push(`${actionName} is missing from ${actionsPath}.`);
  }
}

if (failures.length > 0) {
  console.error("Commerce security check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Commerce security check passed.");
