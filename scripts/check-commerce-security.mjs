import { readFileSync } from "node:fs";
import ts from "typescript";

const actionsPath = "features/commerce/actions.ts";
const schemaPath = "supabase/schema.sql";
const sourceText = readFileSync(actionsPath, "utf8");
const schemaText = readFileSync(schemaPath, "utf8");

const expectedGuards = new Map(
  Object.entries({
    createProductAction: "manage_catalog",
    updateProductAction: "manage_catalog",
    createCollectionAction: "manage_catalog",
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
    updateDiscountStatusAction: "manage_discounts",
    createGiftCardAction: "manage_discounts",
    updateGiftCardStatusAction: "manage_discounts",
    createShippingZoneAction: "manage_shipping",
    updateShippingZoneStatusAction: "manage_shipping",
    upsertCustomerProfileAction: "manage_orders",
    updateStoreAction: "manage_store_settings",
    updateStorePoliciesAction: "manage_store_settings",
    createStorePageAction: "manage_store_settings",
    updateStorePageAction: "manage_store_settings",
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
    publishStoreAction: "store_published",
    pauseStoreAction: "store_paused",
    createProductAction: "product_created",
    updateProductAction: "product_updated",
    adjustInventoryAction: "inventory_adjusted",
    createDiscountAction: "discount_created",
    updateDiscountStatusAction: "discount_status_updated",
    createGiftCardAction: "gift_card_created",
    updateGiftCardStatusAction: "gift_card_status_updated",
    createCollectionAction: "collection_created",
    updateCollectionStatusAction: "collection_status_updated",
    createShippingZoneAction: "shipping_zone_created",
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
  !schemaText.includes(
    "create table if not exists public.order_payment_transactions",
  )
) {
  failures.push(`${schemaPath} is missing order_payment_transactions.`);
}

if (!schemaText.includes("customer_access_token")) {
  failures.push(`${schemaPath} is missing customer_access_token for order receipts.`);
}

if (!schemaText.includes("create table if not exists public.order_return_requests")) {
  failures.push(`${schemaPath} is missing order_return_requests.`);
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

if (!schemaText.includes("create table if not exists public.store_pages")) {
  failures.push(`${schemaPath} is missing store_pages.`);
}

if (!schemaText.includes("create table if not exists public.order_fulfillments")) {
  failures.push(`${schemaPath} is missing order_fulfillments.`);
}

if (!schemaText.includes("create table if not exists public.customer_profiles")) {
  failures.push(`${schemaPath} is missing customer_profiles.`);
}

if (!sourceText.includes("createCustomerAccessToken()")) {
  failures.push("Checkout/manual order mutations must create customer access tokens.");
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
