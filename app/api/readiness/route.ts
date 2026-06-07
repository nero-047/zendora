import {
  isClerkConfigured,
  isClerkWebhookConfigured,
  isSupabaseConfigured,
  isSupabasePublicConfigured,
  isSupabaseStorageS3Configured,
  productImageBucket,
} from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { checkProductImageBucketAccess } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

type Check = {
  name: string;
  ok: boolean;
  detail: string;
};

function envCheck(
  name: string,
  ok: boolean,
  readyDetail: string,
  missingDetail: string,
): Check {
  return { name, ok, detail: ok ? readyDetail : missingDetail };
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown integration error.";
}

export async function GET() {
  const checks: Check[] = [
    envCheck(
      "supabase_public",
      isSupabasePublicConfigured(),
      "Supabase URL and publishable key are configured.",
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    ),
    envCheck(
      "supabase_admin",
      isSupabaseConfigured(),
      "Supabase server key is configured for server mutations.",
      "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY for server mutations.",
    ),
    envCheck(
      "supabase_storage_bucket_name",
      Boolean(productImageBucket),
      `Product image bucket is set to ${productImageBucket}.`,
      "Missing SUPABASE_PRODUCT_IMAGE_BUCKET.",
    ),
    envCheck(
      "supabase_storage_upload_provider",
      isSupabaseConfigured() || isSupabaseStorageS3Configured(),
      isSupabaseStorageS3Configured()
        ? "Storage uploads can use Supabase S3 credentials."
        : "Storage uploads can use the Supabase server key.",
      "Missing storage upload provider: add SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY, or complete Supabase S3 credentials.",
    ),
    envCheck(
      "clerk_auth",
      isClerkConfigured(),
      "Clerk publishable and secret keys are configured.",
      "Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY or CLERK_SECRET_KEY.",
    ),
    envCheck(
      "clerk_webhook",
      isClerkWebhookConfigured(),
      "Clerk webhook signing secret is configured.",
      "Missing CLERK_WEBHOOK_SIGNING_SECRET.",
    ),
  ];

  if (isSupabaseConfigured()) {
    const supabase = getSupabaseAdmin();

    try {
      const { error } = await supabase
        .from("stores")
        .select("id", { count: "exact", head: true });

      checks.push({
        name: "supabase_schema",
        ok: !error,
        detail: error
          ? `Could not query stores table: ${error.message}`
          : "Supabase schema is reachable.",
      });
    } catch (error) {
      checks.push({
        name: "supabase_schema",
        ok: false,
        detail: sanitizeError(error),
      });
    }

    try {
      const [
        { error: storeColumnError },
        { error: shippingZoneColumnError },
        { error: storeMembershipColumnError },
        { error: storeInvitationColumnError },
        { error: storeAuditEventColumnError },
        { error: storeNotificationColumnError },
        { error: storePolicyColumnError },
        { error: storePageColumnError },
        { error: storeNavigationMenuColumnError },
        { error: productColumnError },
        { error: collectionColumnError },
        { error: collectionProductColumnError },
        { error: productVariantColumnError },
        { error: orderColumnError },
        { error: customerProfileColumnError },
        { error: abandonedCheckoutColumnError },
        { error: productReviewColumnError },
        { error: giftCardColumnError },
        { error: giftCardRedemptionColumnError },
        { error: orderItemColumnError },
        { error: orderFulfillmentColumnError },
        { error: orderRefundColumnError },
        { error: orderReturnRequestColumnError },
        { error: orderPaymentTransactionColumnError },
        { error: discountColumnError },
        { error: inventoryAdjustmentColumnError },
      ] = await Promise.all([
        supabase
          .from("stores")
          .select(
            "id, shipping_rate_cents, free_shipping_threshold_cents, tax_rate_bps, seo_title, seo_description, social_image_url",
            { count: "exact", head: true },
          ),
        supabase
          .from("shipping_zones")
          .select(
            "id, store_id, name, countries, rate_cents, free_shipping_threshold_cents, status",
            { count: "exact", head: true },
          ),
        supabase
          .from("store_memberships")
          .select("id, store_id, clerk_user_id, role, created_at", {
            count: "exact",
            head: true,
          }),
        supabase
          .from("store_invitations")
          .select(
            "id, store_id, email, role, invited_by_user_id, accepted_at, revoked_at, expires_at, created_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("store_audit_events")
          .select(
            "id, store_id, clerk_user_id, action, resource_type, resource_id, summary, metadata, created_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("store_notifications")
          .select(
            "id, store_id, type, status, recipient_email, recipient_name, subject, preview, resource_type, resource_id, metadata, sent_at, failed_at, created_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("store_policies")
          .select(
            "id, store_id, type, title, body, status, published_at, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("store_pages")
          .select(
            "id, store_id, title, slug, body, seo_title, seo_description, status, published_at, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("store_navigation_menus")
          .select(
            "id, store_id, location, links, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("products")
          .select("id, sku, category", { count: "exact", head: true }),
        supabase
          .from("collections")
          .select("id, store_id, title, slug, description, image_url, status, sort_order", {
            count: "exact",
            head: true,
          }),
        supabase
          .from("collection_products")
          .select("id, collection_id, product_id, sort_order", {
            count: "exact",
            head: true,
          }),
        supabase
          .from("product_variants")
          .select(
            "id, store_id, product_id, option_name, option_value, sku, price_cents, currency, inventory_count, status, sort_order",
            { count: "exact", head: true },
          ),
        supabase
          .from("orders")
          .select(
            "id, customer_phone, shipping_address_line1, shipping_city, shipping_postal_code, order_source, internal_note, payment_status, payment_method, payment_provider, payment_reference, customer_access_token, client_order_key, subtotal_cents, discount_code, discount_cents, gift_card_code, gift_card_cents, shipping_cents, tax_cents, tax_rate_bps, total_cents, amount_due_cents, paid_at, fulfilled_at, cancelled_at, inventory_restocked_at, tracking_carrier, tracking_number, tracking_url, fulfillment_note",
            { count: "exact", head: true },
          ),
        supabase
          .from("customer_profiles")
          .select(
            "id, store_id, email, name, phone, note, tags, accepts_marketing, tax_exempt, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("abandoned_checkouts")
          .select(
            "id, store_id, customer_email, customer_name, recovery_token, status, cart, subtotal_cents, currency, last_seen_at, recovery_email_sent_at, recovery_email_count, recovered_order_id, recovered_at, dismissed_at, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("product_reviews")
          .select(
            "id, store_id, product_id, order_id, order_item_id, customer_email, customer_name, rating, title, body, status, merchant_reply, reviewed_at, approved_at, rejected_at, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("gift_cards")
          .select(
            "id, store_id, code, initial_balance_cents, balance_cents, currency, status, recipient_email, note, expires_at, created_by_user_id, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("gift_card_redemptions")
          .select(
            "id, store_id, gift_card_id, order_id, amount_cents, balance_before_cents, balance_after_cents, created_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("order_items")
          .select("id, product_variant_id, variant_name, variant_sku", {
            count: "exact",
            head: true,
          }),
        supabase
          .from("order_fulfillments")
          .select(
            "id, store_id, order_id, clerk_user_id, status, tracking_carrier, tracking_number, tracking_url, note, shipped_at, delivered_at, cancelled_at, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("order_refunds")
          .select(
            "id, store_id, order_id, clerk_user_id, amount_cents, gift_card_cents, payment_cents, reason, note, restocked_inventory",
            { count: "exact", head: true },
          ),
        supabase
          .from("order_return_requests")
          .select(
            "id, store_id, order_id, customer_email, status, reason, note, merchant_note, requested_at, resolved_at, created_at, updated_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("order_payment_transactions")
          .select(
            "id, store_id, order_id, clerk_user_id, type, status, payment_method, payment_provider, provider_reference, amount_cents, currency, processed_at, metadata, created_at",
            { count: "exact", head: true },
          ),
        supabase
          .from("discount_codes")
          .select("id, code, type, value, status", { count: "exact", head: true }),
        supabase
          .from("inventory_adjustments")
          .select(
            "id, store_id, product_id, product_variant_id, clerk_user_id, reason, delta, previous_inventory, next_inventory",
            { count: "exact", head: true },
          ),
      ]);
      const error =
        storeColumnError ||
        shippingZoneColumnError ||
        storeMembershipColumnError ||
        storeInvitationColumnError ||
        storeAuditEventColumnError ||
        storeNotificationColumnError ||
        storePolicyColumnError ||
        storePageColumnError ||
        storeNavigationMenuColumnError ||
        productColumnError ||
        collectionColumnError ||
        collectionProductColumnError ||
        productVariantColumnError ||
        orderColumnError ||
        customerProfileColumnError ||
        abandonedCheckoutColumnError ||
        productReviewColumnError ||
        giftCardColumnError ||
        giftCardRedemptionColumnError ||
        orderItemColumnError ||
        orderFulfillmentColumnError ||
        orderRefundColumnError ||
        orderReturnRequestColumnError ||
        orderPaymentTransactionColumnError ||
        discountColumnError ||
        inventoryAdjustmentColumnError;

      checks.push({
        name: "supabase_schema_columns",
        ok: !error,
        detail: error
          ? `Supabase schema is missing commerce columns: ${error.message}`
          : "Supabase store, team, audit, notification, policy, storefront page, navigation menu, customer profile, catalog, collections, variants, abandoned checkout recovery, checkout idempotency, product reviews, gift cards, shipment fulfillments, refund tender splits, return requests, payment transactions, inventory audit, customer order access, order source, lifecycle, payment, fulfillment, shipping zones, discount, shipping, and tax columns are reachable.",
      });
    } catch (error) {
      checks.push({
        name: "supabase_schema_columns",
        ok: false,
        detail: sanitizeError(error),
      });
    }
  } else {
    checks.push({
      name: "supabase_schema",
      ok: false,
      detail:
        "Skipped because SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is missing.",
    });
    checks.push({
      name: "supabase_schema_columns",
      ok: false,
      detail:
        "Skipped because SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is missing.",
    });
  }

  if (isSupabaseConfigured() || isSupabaseStorageS3Configured()) {
    try {
      const detail = await checkProductImageBucketAccess();

      checks.push({
        name: "supabase_storage_bucket",
        ok: true,
        detail,
      });
    } catch (error) {
      checks.push({
        name: "supabase_storage_bucket",
        ok: false,
        detail: sanitizeError(error),
      });
    }
  } else {
    checks.push({
      name: "supabase_storage_bucket",
      ok: false,
      detail:
        "Skipped because neither a Supabase server key nor complete Supabase S3 credentials are configured.",
    });
  }

  const ok = checks.every((check) => check.ok);

  return Response.json(
    {
      ok,
      service: "zendora",
      checkedAt: new Date().toISOString(),
      checks,
    },
    { status: ok ? 200 : 503 },
  );
}
