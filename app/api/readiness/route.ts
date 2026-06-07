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
        { error: productColumnError },
        { error: productVariantColumnError },
        { error: orderColumnError },
        { error: orderItemColumnError },
        { error: discountColumnError },
        { error: inventoryAdjustmentColumnError },
      ] = await Promise.all([
        supabase
          .from("stores")
          .select(
            "id, shipping_rate_cents, free_shipping_threshold_cents, tax_rate_bps",
            { count: "exact", head: true },
          ),
        supabase
          .from("products")
          .select("id, sku, category", { count: "exact", head: true }),
        supabase
          .from("product_variants")
          .select(
            "id, store_id, product_id, option_name, option_value, sku, price_cents, currency, inventory_count, status, sort_order",
            { count: "exact", head: true },
          ),
        supabase
          .from("orders")
          .select(
            "id, customer_phone, shipping_address_line1, shipping_city, shipping_postal_code, subtotal_cents, discount_code, discount_cents, shipping_cents, tax_cents, tax_rate_bps, paid_at, fulfilled_at, cancelled_at, inventory_restocked_at, tracking_carrier, tracking_number, tracking_url, fulfillment_note",
            { count: "exact", head: true },
          ),
        supabase
          .from("order_items")
          .select("id, product_variant_id, variant_name, variant_sku", {
            count: "exact",
            head: true,
          }),
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
        productColumnError ||
        productVariantColumnError ||
        orderColumnError ||
        orderItemColumnError ||
        discountColumnError ||
        inventoryAdjustmentColumnError;

      checks.push({
        name: "supabase_schema_columns",
        ok: !error,
        detail: error
          ? `Supabase schema is missing MVP columns: ${error.message}`
          : "Supabase store, catalog, variants, inventory audit, order lifecycle, fulfillment, discount, shipping, and tax columns are reachable.",
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
