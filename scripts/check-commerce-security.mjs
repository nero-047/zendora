import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const actionsPath = "features/commerce/actions.ts";
const abandonedCheckoutRoutePath =
  "app/api/stores/[slug]/abandoned-checkouts/route.ts";
const clerkWebhookRoutePath = "app/api/webhooks/clerk/route.ts";
const csvExportPath = "features/commerce/csv-export.ts";
const dataPath = "features/commerce/data.ts";
const envPath = "lib/env.ts";
const nextConfigPath = "next.config.ts";
const requestGuardsPath = "lib/request-guards.ts";
const schemaPath = "supabase/schema.sql";
const smokePath = "scripts/smoke.mjs";
const sourceText = readFileSync(actionsPath, "utf8");
const abandonedCheckoutRouteText = readFileSync(abandonedCheckoutRoutePath, "utf8");
const clerkWebhookRouteText = readFileSync(clerkWebhookRoutePath, "utf8");
const csvExportText = readFileSync(csvExportPath, "utf8");
const dataText = readFileSync(dataPath, "utf8");
const envText = readFileSync(envPath, "utf8");
const nextConfigText = readFileSync(nextConfigPath, "utf8");
const requestGuardsText = readFileSync(requestGuardsPath, "utf8");
const schemaText = readFileSync(schemaPath, "utf8");
const smokeText = readFileSync(smokePath, "utf8");
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
  !csvExportText.includes("spreadsheetFormulaPattern") ||
  !csvExportText.includes('"Content-Disposition"') ||
  !csvExportText.includes('"text/csv; charset=utf-8"')
) {
  failures.push(`${csvExportPath} must return attachment CSV responses and neutralize spreadsheet formulas.`);
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
  !schemaText.includes("products_inventory_nonnegative_check") ||
  !schemaText.includes("product_variants_price_nonnegative_check") ||
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
  "/stores/northline-supply/products/field-carry-pack",
  "/stores/northline-supply/collections/everyday-carry",
  "/stores/northline-supply/checkout",
  "/stores/northline-supply/orders/demo-order-1001?token=demo-token-1001",
  "/stores/northline-supply/pages/about",
  "/stores/northline-supply/policies/refund",
];

for (const route of expectedSmokeRoutes) {
  if (!smokeText.includes(route)) {
    failures.push(`${smokePath} is missing storefront smoke coverage for ${route}.`);
  }
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
