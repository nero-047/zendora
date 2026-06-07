"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAppUser } from "@/features/auth/app-user";
import type { ActionState } from "@/features/commerce/action-state";
import {
  canQueueAbandonedCheckoutRecovery,
  getAbandonedCheckoutRecoveryHref,
} from "@/features/commerce/abandoned-checkouts";
import {
  calculateDiscountCents,
  calculateShippingQuote,
  calculateTaxCents,
  normalizeCartLines,
  normalizeCheckoutSessionId,
  parseShippingCountries,
} from "@/features/commerce/business-rules";
import { parseCustomerTags } from "@/features/commerce/customers";
import {
  parseNavigationMenuLines,
  storeNavigationLocations,
} from "@/features/commerce/navigation";
import { getStoreLaunchReadiness } from "@/features/commerce/launch-readiness";
import type {
  AuditEventAction,
  NotificationType,
  OrderFulfillmentStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
  Product,
  ProductReviewStatus,
  ProductVariant,
  StoreMembershipRole,
} from "@/features/commerce/types";
import {
  getAvailableCollectionSlug,
  getAvailableProductSlug,
  getAvailableStorePageSlug,
  getAvailableStoreSlug,
  getLivePublicStorefront,
  getPublicOrderReceipt,
  getStoreWorkspace,
  upsertProfileForUser,
} from "@/features/commerce/data";
import {
  canCancelOrderPaymentStatus,
  canTransitionOrderStatus,
  isRevenueOrderStatus,
} from "@/features/commerce/order-status";
import { getPaymentCaptureAmountCents } from "@/features/commerce/payments";
import { storePolicyTypes } from "@/features/commerce/policies";
import { storePageStatuses } from "@/features/commerce/store-pages";
import {
  canTransitionFulfillmentStatus,
  fulfillmentStatuses,
} from "@/features/commerce/fulfillments";
import {
  canStoreRole,
  getStorePermissionLabel,
  type StorePermission,
} from "@/features/commerce/permissions";
import {
  canTransitionReturnRequestStatus,
  getCustomerReturnRequestEligibility,
  returnRequestReasons,
  returnRequestStatuses,
} from "@/features/commerce/returns";
import {
  canCustomerReviewOrderItem,
  productReviewStatuses,
} from "@/features/commerce/reviews";
import {
  calculateGiftCardRefundAmount,
  calculateGiftCardRedemptionAmount,
  canRedeemGiftCard,
  giftCardStatuses,
  maskGiftCardCode,
  normalizeGiftCardCode,
} from "@/features/commerce/gift-cards";
import { isSupabaseConfigured } from "@/lib/env";
import {
  consumeRateLimit,
  getClientFingerprintFromHeaders,
} from "@/lib/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadProductImageObject } from "@/lib/supabase/storage";
import { toPriceCents } from "@/lib/utils";

const publicCheckoutActionRateLimit = {
  limit: 12,
  windowMs: 60 * 1000,
};
const publicCustomerActionRateLimit = {
  limit: 10,
  windowMs: 60 * 1000,
};

const storeSchema = z.object({
  name: z.string().trim().min(2, "Store name must be at least 2 characters."),
  description: z.string().trim().max(220, "Keep descriptions under 220 characters."),
  currency: z.string().trim().length(3, "Use a 3-letter currency code."),
  themeColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #0f766e."),
});

const productSchema = z.object({
  name: z.string().trim().min(2, "Product name must be at least 2 characters."),
  sku: z.string().trim().max(64, "Keep SKUs under 64 characters.").optional(),
  category: z
    .string()
    .trim()
    .max(80, "Keep categories under 80 characters.")
    .optional(),
  description: z.string().trim().max(500, "Keep descriptions under 500 characters."),
  price: z.string().trim().min(1, "Add a price."),
  inventory: z.coerce
    .number()
    .int("Inventory must be a whole number.")
    .min(0, "Inventory cannot be negative."),
  status: z.enum(["draft", "active"]),
  variantOptionName: z
    .string()
    .trim()
    .max(40, "Keep option names under 40 characters.")
    .optional(),
  variantRows: z
    .string()
    .trim()
    .max(2400, "Keep variant rows under 2400 characters.")
    .optional(),
});

const storeUpdateSchema = storeSchema.extend({
  status: z.enum(["draft", "active", "paused"]),
  shippingRate: z.string().trim().optional(),
  freeShippingThreshold: z.string().trim().optional(),
  taxRate: z.string().trim().optional(),
  seoTitle: z
    .string()
    .trim()
    .max(70, "Keep SEO titles under 70 characters.")
    .optional(),
  seoDescription: z
    .string()
    .trim()
    .max(180, "Keep SEO descriptions under 180 characters.")
    .optional(),
  socialImageUrl: z
    .string()
    .trim()
    .url("Add a valid social image URL.")
    .optional()
    .or(z.literal("")),
});

const storePolicyUpdateSchema = z
  .object({
    type: z.enum(storePolicyTypes),
    title: z
      .string()
      .trim()
      .min(2, "Add a policy title.")
      .max(80, "Keep policy titles under 80 characters."),
    body: z.string().trim().max(12000, "Keep policies under 12000 characters."),
    status: z.enum(["draft", "published"]),
  })
  .superRefine((policy, context) => {
    if (policy.status === "published" && policy.body.length < 20) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published policies need at least 20 characters.",
        path: ["body"],
      });
    }
  });

const storePageSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Add a page title.")
      .max(100, "Keep page titles under 100 characters."),
    slug: z
      .string()
      .trim()
      .max(90, "Keep page URLs under 90 characters.")
      .optional(),
    body: z.string().trim().max(20000, "Keep pages under 20000 characters."),
    seoTitle: z
      .string()
      .trim()
      .max(70, "Keep SEO titles under 70 characters.")
      .optional(),
    seoDescription: z
      .string()
      .trim()
      .max(180, "Keep SEO descriptions under 180 characters.")
      .optional(),
    status: z.enum(storePageStatuses),
  })
  .superRefine((page, context) => {
    if (page.status === "published" && page.body.length < 20) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Published pages need at least 20 characters.",
        path: ["body"],
      });
    }
  });

const storeNavigationSchema = z.object({
  headerLinks: z
    .string()
    .trim()
    .max(3000, "Keep header navigation under 3000 characters.")
    .optional(),
  footerLinks: z
    .string()
    .trim()
    .max(3000, "Keep footer navigation under 3000 characters.")
    .optional(),
});

const productUpdateSchema = productSchema.extend({
  status: z.enum(["draft", "active", "archived"]),
});

const inventoryAdjustmentSchema = z.object({
  delta: z.coerce
    .number()
    .int("Adjustment must be a whole number.")
    .refine((value) => value !== 0, "Adjustment cannot be zero."),
  reason: z.enum(["restock", "correction", "damage", "return"]),
  reference: z.string().trim().max(80, "Keep references under 80 characters.").optional(),
  note: z.string().trim().max(240, "Keep notes under 240 characters.").optional(),
});

const checkoutLineSchema = z.object({
  productId: z.string().trim().min(1),
  variantId: z.string().trim().optional(),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(99, "Quantity must be 99 or lower."),
});

const checkoutSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Add the customer name.")
    .max(80, "Keep the name under 80 characters."),
  customerEmail: z.string().trim().email("Add a valid customer email."),
  customerPhone: z.string().trim().max(32, "Keep phone under 32 characters.").optional(),
  shippingAddressLine1: z
    .string()
    .trim()
    .min(4, "Add the shipping address.")
    .max(140, "Keep address under 140 characters."),
  shippingAddressLine2: z
    .string()
    .trim()
    .max(140, "Keep address under 140 characters.")
    .optional(),
  shippingCity: z
    .string()
    .trim()
    .min(2, "Add the city.")
    .max(80, "Keep city under 80 characters."),
  shippingRegion: z
    .string()
    .trim()
    .min(2, "Add the state or region.")
    .max(80, "Keep region under 80 characters."),
  shippingPostalCode: z
    .string()
    .trim()
    .min(3, "Add the postal code.")
    .max(24, "Keep postal code under 24 characters."),
  shippingCountry: z
    .string()
    .trim()
    .min(2, "Add the country.")
    .max(80, "Keep country under 80 characters."),
  paymentMethod: z.enum(["manual_invoice", "bank_transfer", "cash_on_delivery"]),
  customerNote: z
    .string()
    .trim()
    .max(400, "Keep notes under 400 characters.")
    .optional(),
  discountCode: z.string().trim().max(32, "Keep discount codes under 32 characters.").optional(),
  giftCardCode: z
    .string()
    .trim()
    .max(40, "Keep gift card codes under 40 characters.")
    .optional(),
  abandonedCheckoutToken: z
    .string()
    .trim()
    .min(16, "Checkout recovery token is invalid.")
    .max(96, "Checkout recovery token is invalid.")
    .optional(),
  checkoutSessionId: z
    .string()
    .trim()
    .max(96, "Checkout session is invalid.")
    .optional(),
  cart: z.array(checkoutLineSchema).min(1, "Add at least one item."),
});

const discountSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Add a discount code.")
    .max(32, "Keep discount codes under 32 characters.")
    .regex(/^[a-zA-Z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores."),
  type: z.enum(["percent", "fixed"]),
  value: z.string().trim().min(1, "Add a discount value."),
  minSubtotal: z.string().trim().optional(),
  usageLimit: z.string().trim().optional(),
  status: z.enum(["active", "paused"]),
  startsAt: z.string().trim().optional(),
  endsAt: z.string().trim().optional(),
});

const giftCardSchema = z.object({
  code: z
    .string()
    .trim()
    .max(40, "Keep gift card codes under 40 characters.")
    .optional(),
  amount: z.string().trim().min(1, "Add a gift card amount."),
  recipientEmail: z
    .string()
    .trim()
    .email("Add a valid recipient email.")
    .optional()
    .or(z.literal("")),
  note: z.string().trim().max(300, "Keep notes under 300 characters.").optional(),
  expiresAt: z.string().trim().optional(),
  status: z.enum(["active", "disabled"]),
});

const collectionSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Collection title must be at least 2 characters.")
    .max(80, "Keep collection titles under 80 characters."),
  description: z
    .string()
    .trim()
    .max(260, "Keep collection descriptions under 260 characters.")
    .optional(),
  imageUrl: z
    .string()
    .trim()
    .url("Add a valid image URL.")
    .optional()
    .or(z.literal("")),
  status: z.enum(["draft", "active"]),
  productIds: z.array(z.string().trim().min(1)).max(80),
});

const collectionStatusSchema = z.object({
  status: z.enum(["draft", "active", "archived"]),
});

const shippingZoneSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Zone name must be at least 2 characters.")
    .max(80, "Keep zone names under 80 characters."),
  countries: z
    .string()
    .trim()
    .min(2, "Add at least one country.")
    .max(500, "Keep countries under 500 characters."),
  rate: z.string().trim().min(1, "Add a shipping rate."),
  freeShippingThreshold: z.string().trim().optional(),
  status: z.enum(["active", "paused"]),
});

const shippingZoneStatusSchema = z.object({
  status: z.enum(["active", "paused"]),
});

const orderStatusSchema = z.object({
  status: z.enum(["pending", "paid", "fulfilled", "cancelled"]),
});

const paymentConfirmationSchema = z.object({
  paymentMethod: z.enum([
    "manual_invoice",
    "bank_transfer",
    "cash_on_delivery",
    "card",
    "other",
  ]),
  paymentProvider: z
    .string()
    .trim()
    .max(80, "Keep provider names under 80 characters.")
    .optional(),
  paymentReference: z
    .string()
    .trim()
    .max(120, "Keep references under 120 characters.")
    .optional(),
});

const manualOrderSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Add the customer name.")
    .max(80, "Keep the name under 80 characters."),
  customerEmail: z.string().trim().email("Add a valid customer email."),
  customerPhone: z.string().trim().max(32, "Keep phone under 32 characters.").optional(),
  shippingAddressLine1: z
    .string()
    .trim()
    .max(140, "Keep address under 140 characters.")
    .optional(),
  shippingAddressLine2: z
    .string()
    .trim()
    .max(140, "Keep address under 140 characters.")
    .optional(),
  shippingCity: z
    .string()
    .trim()
    .max(80, "Keep city under 80 characters.")
    .optional(),
  shippingRegion: z
    .string()
    .trim()
    .max(80, "Keep region under 80 characters.")
    .optional(),
  shippingPostalCode: z
    .string()
    .trim()
    .max(24, "Keep postal code under 24 characters.")
    .optional(),
  shippingCountry: z
    .string()
    .trim()
    .max(80, "Keep country under 80 characters.")
    .optional(),
  lineIds: z.array(z.string().trim().min(1)).min(1, "Choose at least one item."),
  manualDiscount: z.string().trim().optional(),
  manualShipping: z.string().trim().optional(),
  paymentStatus: z.enum(["pending", "paid"]),
  paymentMethod: z.enum([
    "manual_invoice",
    "bank_transfer",
    "cash_on_delivery",
    "card",
    "other",
  ]),
  paymentProvider: z
    .string()
    .trim()
    .max(80, "Keep provider names under 80 characters.")
    .optional(),
  paymentReference: z
    .string()
    .trim()
    .max(120, "Keep references under 120 characters.")
    .optional(),
  internalNote: z
    .string()
    .trim()
    .max(400, "Keep internal notes under 400 characters.")
    .optional(),
});

const customerProfileSchema = z.object({
  email: z.string().trim().email("Add a valid customer email."),
  name: z
    .string()
    .trim()
    .max(80, "Keep the name under 80 characters.")
    .optional(),
  phone: z.string().trim().max(32, "Keep phone under 32 characters.").optional(),
  note: z.string().trim().max(1000, "Keep notes under 1000 characters.").optional(),
  tags: z.string().trim().max(500, "Keep tags under 500 characters.").optional(),
  acceptsMarketing: z.boolean(),
  taxExempt: z.boolean(),
});

const orderFulfillmentSchema = z.object({
  status: z.enum(fulfillmentStatuses),
  trackingCarrier: z
    .string()
    .trim()
    .max(80, "Keep carrier names under 80 characters.")
    .optional(),
  trackingNumber: z
    .string()
    .trim()
    .max(120, "Keep tracking numbers under 120 characters.")
    .optional(),
  trackingUrl: z
    .string()
    .trim()
    .url("Add a valid tracking URL.")
    .optional(),
  fulfillmentNote: z
    .string()
    .trim()
    .max(400, "Keep fulfillment notes under 400 characters.")
    .optional(),
  markFulfilled: z.boolean(),
});

const orderFulfillmentStatusSchema = z.object({
  status: z.enum(fulfillmentStatuses),
});

const refundSchema = z.object({
  amount: z.string().trim().min(1, "Add a refund amount."),
  reason: z.enum(["customer_request", "damaged", "fraud", "other"]),
  note: z.string().trim().max(400, "Keep refund notes under 400 characters.").optional(),
  restockInventory: z.boolean(),
});

const returnRequestSchema = z.object({
  token: z.string().trim().min(12, "Order access token is missing."),
  reason: z.enum(returnRequestReasons),
  note: z
    .string()
    .trim()
    .min(10, "Add a short return request note.")
    .max(600, "Keep return request notes under 600 characters."),
});

const returnRequestStatusSchema = z.object({
  status: z.enum(returnRequestStatuses),
  merchantNote: z
    .string()
    .trim()
    .max(600, "Keep return notes under 600 characters.")
    .optional(),
});

const productReviewSchema = z.object({
  token: z.string().trim().min(12, "Order access token is missing."),
  orderItemId: z.string().trim().min(1, "Order item is missing."),
  productId: z.string().trim().min(1, "Product is missing."),
  rating: z.coerce
    .number()
    .int("Choose a whole-star rating.")
    .min(1, "Choose at least 1 star.")
    .max(5, "Choose 5 stars or fewer."),
  title: z
    .string()
    .trim()
    .max(80, "Keep review titles under 80 characters.")
    .optional(),
  body: z
    .string()
    .trim()
    .min(10, "Add a little more detail to the review.")
    .max(1200, "Keep reviews under 1200 characters."),
});

const productReviewStatusSchema = z.object({
  status: z.enum(productReviewStatuses),
  merchantReply: z
    .string()
    .trim()
    .max(800, "Keep merchant replies under 800 characters.")
    .optional(),
});

const discountStatusSchema = z.object({
  status: z.enum(["active", "paused"]),
});

const giftCardStatusSchema = z.object({
  status: z.enum(giftCardStatuses),
});

const teamInvitationSchema = z.object({
  email: z.string().trim().email("Add a valid team email."),
  role: z.enum(["admin", "staff"]),
});

const teamMemberRoleSchema = z.object({
  role: z.enum(["admin", "staff"]),
});

type CheckoutDiscountRow = {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  min_subtotal_cents: number;
  usage_limit: number | null;
  redemption_count: number;
  status: "active" | "paused";
  starts_at: string | null;
  ends_at: string | null;
};

type CheckoutGiftCardRow = {
  id: string;
  code: string;
  balance_cents: number;
  currency: string;
  status: "active" | "disabled" | "expired";
  expires_at: string | null;
};

type OrderLifecycleRow = {
  customer_email: string;
  customer_name: string | null;
  status: z.infer<typeof orderStatusSchema>["status"];
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  payment_provider: string | null;
  payment_reference: string | null;
  total_cents: number;
  amount_due_cents: number | null;
  gift_card_cents: number | null;
  currency: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  inventory_restocked_at: string | null;
};

type OrderFulfillmentActionRow = {
  id: string;
  store_id: string;
  order_id: string;
  status: OrderFulfillmentStatus;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  note: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
};

type OrderInventoryItemRow = {
  product_id: string | null;
  product_variant_id: string | null;
  quantity: number;
};

type ProductInventoryRow = {
  inventory_count: number;
};

type VariantInventoryRow = {
  inventory_count: number;
};

type StoreInvitationActionRow = {
  id: string;
  store_id: string;
  email: string;
  role: Exclude<StoreMembershipRole, "owner">;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
};

type StoreMemberActionRow = {
  clerk_user_id: string;
  role: StoreMembershipRole;
};

type AuditMetadata = Record<
  string,
  string | number | boolean | null | undefined
>;

type NotificationMetadata = AuditMetadata;

type InventoryAdjustmentReason = z.infer<
  typeof inventoryAdjustmentSchema
>["reason"] | "manual_edit";

type ParsedVariantInput = {
  optionName: string;
  optionValue: string;
  sku: string | null;
  priceCents: number;
  inventoryCount: number;
  status: "active" | "paused";
  sortOrder: number;
};

type RestockedInventory = {
  productId: string;
  productVariantId?: string;
  quantity: number;
};

type OrderInputItem = {
  product: Product;
  variant?: ProductVariant;
  variantName?: string;
  variantSku?: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

type ReservedInventory = {
  productId: string;
  quantity: number;
  productVariantId?: string;
};

type ReservedDiscountRedemption = {
  id: string;
  redemptionCountBefore: number;
};

type ReservedGiftCard = {
  id: string;
  amountCents: number;
  balanceBeforeCents: number;
  balanceAfterCents: number;
};

type RecreditedGiftCard = {
  id: string;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  amountCents: number;
};

function demoDisabledState(): ActionState {
  return {
    status: "success",
    message:
      "This Server Function is wired. Add Supabase env values to persist the mutation.",
  };
}

function checkoutDisabledState(): ActionState {
  return {
    status: "error",
    message:
      "Checkout needs SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY before it can create orders.",
  };
}

function createCustomerAccessToken() {
  return randomBytes(32).toString("hex");
}

function createGiftCardCode() {
  const partA = randomBytes(3).toString("hex").toUpperCase();
  const partB = randomBytes(3).toString("hex").toUpperCase();

  return `GIFT-${partA}-${partB}`;
}

function getCustomerOrderStatusHref(input: {
  storeSlug: string;
  orderId: string;
  token: string;
}) {
  const encodedOrderId = encodeURIComponent(input.orderId);
  const encodedToken = encodeURIComponent(input.token);

  return `/stores/${input.storeSlug}/orders/${encodedOrderId}?token=${encodedToken}`;
}

async function getExistingCheckoutOrder(input: {
  customerEmail: string;
  db: ReturnType<typeof getSupabaseAdmin>;
  sessionId: string | null;
  storeId: string;
  storeSlug: string;
}) {
  if (!input.sessionId) {
    return null;
  }

  const { data, error } = await input.db
    .from("orders")
    .select("id, customer_email, customer_access_token")
    .eq("store_id", input.storeId)
    .eq("client_order_key", input.sessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const order = data as {
    id: string;
    customer_access_token: string | null;
    customer_email: string;
  };

  if (
    order.customer_email.trim().toLowerCase() !==
    input.customerEmail.trim().toLowerCase()
  ) {
    return {
      status: "error" as const,
      state: formError("This checkout session has already been used."),
    };
  }

  if (!order.customer_access_token) {
    return {
      status: "error" as const,
      state: formError("Existing order receipt is missing a customer token."),
    };
  }

  return {
    status: "success" as const,
    state: {
      status: "success" as const,
      message: `Order ${order.id.slice(0, 8)} already received.`,
      data: {
        orderId: order.id,
        orderStatusUrl: getCustomerOrderStatusHref({
          storeSlug: input.storeSlug,
          orderId: order.id,
          token: order.customer_access_token,
        }),
      },
    },
  };
}

async function recordAuditEvent(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  storeId: string;
  clerkUserId?: string | null;
  action: AuditEventAction;
  resourceType: string;
  resourceId?: string | null;
  summary: string;
  metadata?: AuditMetadata;
}) {
  const { error } = await input.db.from("store_audit_events").insert({
    store_id: input.storeId,
    clerk_user_id: input.clerkUserId || null,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId || null,
    summary: input.summary,
    metadata: input.metadata || {},
  });

  if (error) {
    console.warn(`Could not record audit event: ${error.message}`);
  }
}

async function queueNotification(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  storeId: string;
  type: NotificationType;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  preview: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: NotificationMetadata;
}) {
  const recipientEmail = input.recipientEmail.trim().toLowerCase();

  if (!recipientEmail) {
    return;
  }

  const { error } = await input.db.from("store_notifications").insert({
    store_id: input.storeId,
    type: input.type,
    recipient_email: recipientEmail,
    recipient_name: optionalText(input.recipientName || undefined),
    subject: input.subject,
    preview: input.preview,
    resource_type: input.resourceType,
    resource_id: input.resourceId || null,
    metadata: input.metadata || {},
  });

  if (error) {
    console.warn(`Could not queue notification: ${error.message}`);
  }
}

async function insertPaymentTransaction(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  storeId: string;
  orderId: string;
  clerkUserId?: string | null;
  type: PaymentTransactionType;
  status?: PaymentTransactionStatus;
  paymentMethod: PaymentMethod;
  paymentProvider: string;
  providerReference?: string | null;
  amountCents: number;
  currency: string;
  processedAt?: string | null;
  metadata?: Record<string, unknown>;
}) {
  if (input.amountCents <= 0) {
    return {
      id: null,
      error: new Error("Payment transaction amount must be greater than zero."),
    };
  }

  const providerReference = optionalText(input.providerReference || undefined);

  if (providerReference) {
    const { data: existingTransaction, error: existingError } = await input.db
      .from("order_payment_transactions")
      .select("id")
      .eq("store_id", input.storeId)
      .eq("payment_provider", input.paymentProvider)
      .eq("provider_reference", providerReference)
      .maybeSingle();

    if (existingError) {
      return { id: null, error: existingError };
    }

    if (existingTransaction) {
      return {
        id: null,
        error: new Error("This payment reference is already recorded."),
      };
    }
  }

  const { data, error } = await input.db
    .from("order_payment_transactions")
    .insert({
      store_id: input.storeId,
      order_id: input.orderId,
      clerk_user_id: input.clerkUserId || null,
      type: input.type,
      status: input.status || "succeeded",
      payment_method: input.paymentMethod,
      payment_provider: input.paymentProvider,
      provider_reference: providerReference,
      amount_cents: input.amountCents,
      currency: input.currency,
      processed_at: input.processedAt || new Date().toISOString(),
      metadata: input.metadata || {},
    })
    .select("id")
    .single();

  if (error && providerReference && isUniqueConstraintError(error)) {
    return {
      id: null,
      error: new Error("This payment reference is already recorded."),
    };
  }

  return {
    id: data?.id || null,
    error,
  };
}

async function deletePaymentTransaction(
  db: ReturnType<typeof getSupabaseAdmin>,
  transactionId: string | null | undefined,
) {
  if (!transactionId) {
    return;
  }

  await db.from("order_payment_transactions").delete().eq("id", transactionId);
}

async function rollbackGiftCardRecredit(
  db: ReturnType<typeof getSupabaseAdmin>,
  recredit: RecreditedGiftCard | null,
) {
  if (!recredit) {
    return;
  }

  await db
    .from("gift_cards")
    .update({ balance_cents: recredit.balanceBeforeCents })
    .eq("id", recredit.id)
    .eq("balance_cents", recredit.balanceAfterCents);
}

async function rollbackInventoryReservationCount(
  db: ReturnType<typeof getSupabaseAdmin>,
  table: "products" | "product_variants",
  id: string | undefined,
  quantity: number,
) {
  if (!id || quantity <= 0) {
    return;
  }

  const { data } = await db
    .from(table)
    .select("inventory_count")
    .eq("id", id)
    .maybeSingle();
  const currentInventory =
    (data as ProductInventoryRow | VariantInventoryRow | null)?.inventory_count;

  if (typeof currentInventory !== "number") {
    return;
  }

  await db
    .from(table)
    .update({ inventory_count: currentInventory + quantity })
    .eq("id", id)
    .eq("inventory_count", currentInventory);
}

async function rollbackDiscountRedemptionReservation(
  db: ReturnType<typeof getSupabaseAdmin>,
  reservation: ReservedDiscountRedemption | null,
) {
  if (!reservation) {
    return;
  }

  const { data } = await db
    .from("discount_codes")
    .select("redemption_count")
    .eq("id", reservation.id)
    .maybeSingle();
  const currentCount = (data as { redemption_count?: number } | null)
    ?.redemption_count;

  if (
    typeof currentCount !== "number" ||
    currentCount <= reservation.redemptionCountBefore
  ) {
    return;
  }

  await db
    .from("discount_codes")
    .update({ redemption_count: currentCount - 1 })
    .eq("id", reservation.id)
    .eq("redemption_count", currentCount);
}

async function rollbackGiftCardReservation(
  db: ReturnType<typeof getSupabaseAdmin>,
  reservation: ReservedGiftCard | null,
) {
  if (!reservation || reservation.amountCents <= 0) {
    return;
  }

  const { data } = await db
    .from("gift_cards")
    .select("balance_cents")
    .eq("id", reservation.id)
    .maybeSingle();
  const currentBalance = (data as { balance_cents?: number } | null)
    ?.balance_cents;

  if (typeof currentBalance !== "number") {
    return;
  }

  await db
    .from("gift_cards")
    .update({ balance_cents: currentBalance + reservation.amountCents })
    .eq("id", reservation.id)
    .eq("balance_cents", currentBalance);
}

function formError(message: string, errors?: ActionState["errors"]): ActionState {
  return {
    status: "error",
    message,
    errors,
  };
}

async function consumePublicServerActionRateLimit(
  key: string,
  policy: { limit: number; windowMs: number },
) {
  const headerList = await headers();
  const rateLimit = consumeRateLimit(
    `server-action:${key}:${getClientFingerprintFromHeaders(headerList)}`,
    policy,
  );

  if (rateLimit.ok) {
    return null;
  }

  return formError(
    `Too many attempts. Wait ${rateLimit.retryAfterSeconds} seconds and try again.`,
  );
}

function isUniqueConstraintError(error: { code?: string; message?: string }) {
  return (
    error.code === "23505" ||
    Boolean(error.message?.toLowerCase().includes("duplicate"))
  );
}

function isRefundLimitError(error: { code?: string; message?: string }) {
  return (
    error.code === "23514" ||
    Boolean(
      error.message
        ?.toLowerCase()
        .includes("refund exceeds the remaining refundable amount"),
    )
  );
}

function optionalText(value: string | undefined) {
  return value?.trim() || null;
}

function normalizeDiscountCode(value: string | undefined) {
  return value?.trim().toUpperCase() || null;
}

function parseOptionalPriceCents(value: string | undefined) {
  if (!value?.trim()) {
    return 0;
  }

  return toPriceCents(value);
}

function parseOptionalPositiveInteger(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return NaN;
  }

  return parsed;
}

function parseTaxRateBps(value: string | undefined) {
  if (!value?.trim()) {
    return 0;
  }

  const rate = Number(value);

  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return null;
  }

  return Math.round(rate * 100);
}

function parseDateTime(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "invalid";
  }

  return date.toISOString();
}

function parseProductVariantRows(input: {
  optionName?: string;
  rows?: string;
}): { variants: ParsedVariantInput[]; errors?: ActionState["errors"] } {
  const rows = input.rows
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rows?.length) {
    return { variants: [] };
  }

  const optionName = input.optionName?.trim() || "Variant";

  if (optionName.length > 40) {
    return {
      variants: [],
      errors: {
        variantOptionName: ["Keep option names under 40 characters."],
      },
    };
  }

  if (rows.length > 50) {
    return {
      variants: [],
      errors: {
        variantRows: ["Keep products to 50 variants or fewer."],
      },
    };
  }

  const seenOptions = new Set<string>();
  const variants: ParsedVariantInput[] = [];

  for (const [index, row] of rows.entries()) {
    const [optionValue, sku = "", price = "", inventory = "", status = "active"] =
      row.split("|").map((part) => part.trim());

    if (!optionValue) {
      return {
        variants: [],
        errors: {
          variantRows: [`Variant row ${index + 1} needs an option value.`],
        },
      };
    }

    const optionKey = `${optionName.toLowerCase()}:${optionValue.toLowerCase()}`;

    if (seenOptions.has(optionKey)) {
      return {
        variants: [],
        errors: {
          variantRows: [`Variant row ${index + 1} duplicates an option value.`],
        },
      };
    }

    seenOptions.add(optionKey);

    const priceCents = toPriceCents(price);
    const inventoryCount = Number(inventory);
    const normalizedStatus = status.toLowerCase();

    if (priceCents === null || priceCents < 0) {
      return {
        variants: [],
        errors: {
          variantRows: [`Variant row ${index + 1} needs a valid price.`],
        },
      };
    }

    if (!Number.isInteger(inventoryCount) || inventoryCount < 0) {
      return {
        variants: [],
        errors: {
          variantRows: [`Variant row ${index + 1} needs whole-number stock.`],
        },
      };
    }

    if (normalizedStatus !== "active" && normalizedStatus !== "paused") {
      return {
        variants: [],
        errors: {
          variantRows: [`Variant row ${index + 1} status must be active or paused.`],
        },
      };
    }

    variants.push({
      optionName,
      optionValue,
      sku: optionalText(sku),
      priceCents,
      inventoryCount,
      status: normalizedStatus,
      sortOrder: index + 1,
    });
  }

  return { variants };
}

function getManualPaymentProvider(method: PaymentMethod) {
  if (method === "bank_transfer") {
    return "Bank transfer";
  }

  if (method === "cash_on_delivery") {
    return "Cash on delivery";
  }

  if (method === "card") {
    return "Card";
  }

  if (method === "other") {
    return "Other";
  }

  return "Manual invoice";
}

function parseManualOrderLineKey(key: string) {
  const [productId, variantId = "base"] = key.split("__");

  try {
    return {
      productId: decodeURIComponent(productId),
      variantId:
        variantId === "base" ? undefined : decodeURIComponent(variantId),
    };
  } catch {
    return null;
  }
}

function getManualOrderItems(input: {
  formData: FormData;
  lineIds: string[];
  products: Product[];
}): { items: OrderInputItem[]; errors?: ActionState["errors"]; message?: string } {
  const productsById = new Map(input.products.map((product) => [product.id, product]));
  const seenLineKeys = new Set<string>();
  const items: OrderInputItem[] = [];

  for (const lineKey of input.lineIds) {
    if (seenLineKeys.has(lineKey)) {
      continue;
    }

    seenLineKeys.add(lineKey);
    const parsedKey = parseManualOrderLineKey(lineKey);

    if (!parsedKey) {
      return {
        items: [],
        message: "One or more order lines are invalid.",
        errors: { lineIds: ["Choose valid products."] },
      };
    }

    const product = productsById.get(parsedKey.productId);

    if (!product || product.status === "archived") {
      return {
        items: [],
        message: "One or more products are no longer available.",
        errors: { lineIds: ["Choose available products."] },
      };
    }

    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );
    const variant = parsedKey.variantId
      ? activeVariants.find((item) => item.id === parsedKey.variantId)
      : undefined;

    if (activeVariants.length > 0 && !variant) {
      return {
        items: [],
        message: `Choose a variant for ${product.name}.`,
        errors: { lineIds: [`Choose a variant for ${product.name}.`] },
      };
    }

    const quantity = Number(input.formData.get(`quantity:${lineKey}`));

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return {
        items: [],
        message: "Check manual order quantities.",
        errors: { lineIds: ["Quantities must be whole numbers from 1 to 99."] },
      };
    }

    const inventoryCount = variant?.inventoryCount ?? product.inventoryCount;

    if (inventoryCount < quantity) {
      const stockLabel = variant
        ? `${product.name} ${variant.optionValue}`
        : product.name;

      return {
        items: [],
        message: `${stockLabel} only has ${inventoryCount} in stock.`,
        errors: { lineIds: [`${stockLabel} only has ${inventoryCount} in stock.`] },
      };
    }

    const unitPriceCents = variant?.priceCents ?? product.priceCents;

    items.push({
      product,
      variant,
      variantName: variant
        ? `${variant.optionName}: ${variant.optionValue}`
        : undefined,
      variantSku: variant?.sku,
      unitPriceCents,
      quantity,
      lineTotalCents: unitPriceCents * quantity,
    });
  }

  if (items.length === 0) {
    return {
      items: [],
      message: "Choose at least one item.",
      errors: { lineIds: ["Choose at least one item."] },
    };
  }

  return { items };
}

function getVariantCatalogTotals(
  fallbackPriceCents: number,
  fallbackInventoryCount: number,
  variants: ParsedVariantInput[],
) {
  const activeVariants = variants.filter((variant) => variant.status === "active");

  if (activeVariants.length === 0) {
    return {
      priceCents: fallbackPriceCents,
      inventoryCount: fallbackInventoryCount,
    };
  }

  return {
    priceCents: Math.min(...activeVariants.map((variant) => variant.priceCents)),
    inventoryCount: activeVariants.reduce(
      (sum, variant) => sum + variant.inventoryCount,
      0,
    ),
  };
}

async function getCheckoutDiscount(input: {
  code: string | null;
  storeId: string;
  subtotalCents: number;
}) {
  if (!input.code) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: null,
    };
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("discount_codes")
    .select("*")
    .eq("store_id", input.storeId)
    .eq("code", input.code)
    .maybeSingle();

  if (error) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Discount code was not found.",
    };
  }

  const discount = data as CheckoutDiscountRow;
  const now = Date.now();

  if (discount.status !== "active") {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Discount code is not active.",
    };
  }

  if (discount.starts_at && new Date(discount.starts_at).getTime() > now) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Discount code is not active yet.",
    };
  }

  if (discount.ends_at && new Date(discount.ends_at).getTime() < now) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Discount code has expired.",
    };
  }

  if (
    discount.usage_limit &&
    discount.redemption_count >= discount.usage_limit
  ) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Discount code has reached its usage limit.",
    };
  }

  if (input.subtotalCents < discount.min_subtotal_cents) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Order subtotal does not meet this discount minimum.",
    };
  }

  return {
    code: discount.code,
    cents: calculateDiscountCents(discount, input.subtotalCents),
    row: discount,
    error: null,
  };
}

async function getCheckoutGiftCard(input: {
  code: string | null;
  currency: string;
  orderTotalCents: number;
  storeId: string;
}) {
  if (!input.code) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: null,
    };
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_cards")
    .select("id, code, balance_cents, currency, status, expires_at")
    .eq("store_id", input.storeId)
    .eq("code", input.code)
    .maybeSingle();

  if (error) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Gift card was not found.",
    };
  }

  const giftCard = data as CheckoutGiftCardRow;

  if (giftCard.currency !== input.currency) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Gift card currency does not match this store.",
    };
  }

  if (!canRedeemGiftCard({
    balanceCents: giftCard.balance_cents,
    expiresAt: giftCard.expires_at || undefined,
    status: giftCard.status,
  })) {
    return {
      code: null,
      cents: 0,
      row: null,
      error: "Gift card is not redeemable.",
    };
  }

  return {
    code: giftCard.code,
    cents: calculateGiftCardRedemptionAmount({
      balanceCents: giftCard.balance_cents,
      orderTotalCents: input.orderTotalCents,
    }),
    row: giftCard,
    error: null,
  };
}

function readCartPayload(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function assertStorePermission(
  userId: string,
  storeId: string,
  permission: StorePermission,
) {
  const workspace = await getStoreWorkspace(userId, storeId);

  if (!workspace) {
    throw new Error("You do not have access to this store.");
  }

  if (!canStoreRole(workspace.membershipRole, permission)) {
    throw new Error(
      `You do not have permission to ${getStorePermissionLabel(permission)}.`,
    );
  }

  return workspace;
}

async function uploadProductImage(storeId: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) {
    return { imageUrl: null, imagePath: null };
  }

  if (!file.type.startsWith("image/")) {
    throw new Error("Product image must be an image file.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Product image must be smaller than 5MB.");
  }

  return uploadProductImageObject(storeId, file);
}

async function rollbackRestockedInventory(
  db: ReturnType<typeof getSupabaseAdmin>,
  storeId: string,
  items: RestockedInventory[],
) {
  for (const item of [...items].reverse()) {
    if (item.productVariantId) {
      const { data: variant } = await db
        .from("product_variants")
        .select("inventory_count")
        .eq("id", item.productVariantId)
        .eq("store_id", storeId)
        .maybeSingle();

      const currentVariantInventory =
        ((variant as VariantInventoryRow | null)?.inventory_count || 0);

      if (currentVariantInventory >= item.quantity) {
        await db
          .from("product_variants")
          .update({ inventory_count: currentVariantInventory - item.quantity })
          .eq("id", item.productVariantId)
          .eq("store_id", storeId)
          .eq("inventory_count", currentVariantInventory);
      }
    }

    const { data: product } = await db
      .from("products")
      .select("inventory_count")
      .eq("id", item.productId)
      .eq("store_id", storeId)
      .maybeSingle();

    if (!product) {
      continue;
    }

    const currentInventory =
      (product as ProductInventoryRow).inventory_count || 0;

    if (currentInventory < item.quantity) {
      continue;
    }

    await db
      .from("products")
      .update({ inventory_count: currentInventory - item.quantity })
      .eq("id", item.productId)
      .eq("store_id", storeId)
      .eq("inventory_count", currentInventory);
  }
}

async function restockReservedInventory(
  db: ReturnType<typeof getSupabaseAdmin>,
  storeId: string,
  orderId: string,
) {
  const { data: itemRows, error: itemError } = await db
    .from("order_items")
    .select("product_id, product_variant_id, quantity")
    .eq("order_id", orderId);

  if (itemError) {
    throw itemError;
  }

  const restockedItems: RestockedInventory[] = [];

  try {
    for (const item of (itemRows || []) as OrderInventoryItemRow[]) {
      if (!item.product_id) {
        continue;
      }

      let variantRollback:
        | {
            id: string;
            inventoryCount: number;
          }
        | undefined;

      if (item.product_variant_id) {
        const { data: variant, error: variantError } = await db
          .from("product_variants")
          .select("inventory_count")
          .eq("id", item.product_variant_id)
          .eq("store_id", storeId)
          .eq("product_id", item.product_id)
          .maybeSingle();

        if (variantError) {
          throw variantError;
        }

        if (!variant) {
          continue;
        }

        const currentVariantInventory =
          (variant as VariantInventoryRow).inventory_count || 0;
        const { data: updatedVariant, error: variantUpdateError } = await db
          .from("product_variants")
          .update({ inventory_count: currentVariantInventory + item.quantity })
          .eq("id", item.product_variant_id)
          .eq("store_id", storeId)
          .eq("inventory_count", currentVariantInventory)
          .select("id")
          .maybeSingle();

        if (variantUpdateError) {
          throw variantUpdateError;
        }

        if (!updatedVariant) {
          throw new Error("Variant inventory changed while restocking this order.");
        }

        variantRollback = {
          id: item.product_variant_id,
          inventoryCount: currentVariantInventory,
        };
      }

      const { data: product, error: productError } = await db
        .from("products")
        .select("inventory_count")
        .eq("id", item.product_id)
        .eq("store_id", storeId)
        .maybeSingle();

      if (productError) {
        if (variantRollback) {
          await db
            .from("product_variants")
            .update({ inventory_count: variantRollback.inventoryCount })
            .eq("id", variantRollback.id);
        }

        throw productError;
      }

      if (!product) {
        if (variantRollback) {
          await db
            .from("product_variants")
            .update({ inventory_count: variantRollback.inventoryCount })
            .eq("id", variantRollback.id);
        }

        continue;
      }

      const currentInventory =
        (product as ProductInventoryRow).inventory_count || 0;
      const { data: updatedProduct, error: updateError } = await db
        .from("products")
        .update({ inventory_count: currentInventory + item.quantity })
        .eq("id", item.product_id)
        .eq("store_id", storeId)
        .eq("inventory_count", currentInventory)
        .select("id")
        .maybeSingle();

      if (updateError) {
        if (variantRollback) {
          await db
            .from("product_variants")
            .update({ inventory_count: variantRollback.inventoryCount })
            .eq("id", variantRollback.id);
        }

        throw updateError;
      }

      if (!updatedProduct) {
        if (variantRollback) {
          await db
            .from("product_variants")
            .update({ inventory_count: variantRollback.inventoryCount })
            .eq("id", variantRollback.id);
        }

        throw new Error("Inventory changed while restocking this order.");
      }

      restockedItems.push({
        productId: item.product_id,
        productVariantId: item.product_variant_id || undefined,
        quantity: item.quantity,
      });
    }
  } catch (error) {
    await rollbackRestockedInventory(db, storeId, restockedItems);
    throw error;
  }

  return restockedItems;
}

async function rollbackReservedInventory(
  db: ReturnType<typeof getSupabaseAdmin>,
  items: ReservedInventory[],
) {
  for (const item of [...items].reverse()) {
    await rollbackInventoryReservationCount(
      db,
      "product_variants",
      item.productVariantId,
      item.quantity,
    );
    await rollbackInventoryReservationCount(
      db,
      "products",
      item.productId,
      item.quantity,
    );
  }
}

async function reserveOrderInventory(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  storeId: string;
  items: OrderInputItem[];
}) {
  const reservedInventory: ReservedInventory[] = [];
  const productInventoryById = new Map(
    input.items.map((item) => [item.product.id, item.product.inventoryCount]),
  );
  const variantInventoryById = new Map<string, number>();

  for (const item of input.items) {
    if (item.variant) {
      variantInventoryById.set(item.variant.id, item.variant.inventoryCount);
    }
  }

  for (const item of input.items) {
    const productInventory = productInventoryById.get(item.product.id);
    let currentVariantInventory: number | undefined;

    if (productInventory === undefined) {
      await rollbackReservedInventory(input.db, reservedInventory);

      return {
        reservedInventory,
        error: "Product inventory could not be reserved.",
      };
    }

    if (item.variant) {
      const variantInventory = variantInventoryById.get(item.variant.id);

      if (variantInventory === undefined) {
        await rollbackReservedInventory(input.db, reservedInventory);

        return {
          reservedInventory,
          error: "Variant inventory could not be reserved.",
        };
      }

      currentVariantInventory = variantInventory;
      const nextVariantInventory = variantInventory - item.quantity;
      const { data: variantData, error: variantError } = await input.db
        .from("product_variants")
        .update({ inventory_count: nextVariantInventory })
        .eq("id", item.variant.id)
        .eq("store_id", input.storeId)
        .eq("product_id", item.product.id)
        .eq("inventory_count", variantInventory)
        .select("id")
        .maybeSingle();

      if (variantError || !variantData) {
        await rollbackReservedInventory(input.db, reservedInventory);

        return {
          reservedInventory,
          error:
            variantError?.message ||
            "Variant inventory changed while order inventory was being reserved.",
        };
      }

      variantInventoryById.set(item.variant.id, nextVariantInventory);
    }

    const nextInventory = productInventory - item.quantity;
    const { data, error } = await input.db
      .from("products")
      .update({ inventory_count: nextInventory })
      .eq("id", item.product.id)
      .eq("store_id", input.storeId)
      .eq("inventory_count", productInventory)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      if (item.variant && currentVariantInventory !== undefined) {
        await rollbackInventoryReservationCount(
          input.db,
          "product_variants",
          item.variant.id,
          item.quantity,
        );
      }

      await rollbackReservedInventory(input.db, reservedInventory);

      return {
        reservedInventory,
        error:
          error?.message ||
          "Inventory changed while order inventory was being reserved.",
      };
    }

    reservedInventory.push({
      productId: item.product.id,
      quantity: item.quantity,
      productVariantId: item.variant?.id,
    });
    productInventoryById.set(item.product.id, nextInventory);
  }

  return { reservedInventory, error: null };
}

async function insertInventoryAdjustment(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  storeId: string;
  productId: string;
  productVariantId?: string;
  clerkUserId: string;
  reason: InventoryAdjustmentReason;
  reference?: string;
  note?: string;
  previousInventory: number;
  nextInventory: number;
}) {
  const delta = input.nextInventory - input.previousInventory;

  if (delta === 0) {
    return { error: null };
  }

  const { error } = await input.db.from("inventory_adjustments").insert({
    store_id: input.storeId,
    product_id: input.productId,
    product_variant_id: input.productVariantId || null,
    clerk_user_id: input.clerkUserId,
    reason: input.reason,
    reference: optionalText(input.reference),
    note: optionalText(input.note),
    delta,
    previous_inventory: input.previousInventory,
    next_inventory: input.nextInventory,
  });

  return { error };
}

async function syncProductVariants(input: {
  db: ReturnType<typeof getSupabaseAdmin>;
  storeId: string;
  productId: string;
  currency: string;
  variants: ParsedVariantInput[];
}) {
  const activeKeys = new Set(
    input.variants.map(
      (variant) =>
        `${variant.optionName.toLowerCase()}:${variant.optionValue.toLowerCase()}`,
    ),
  );

  if (input.variants.length > 0) {
    const { error } = await input.db.from("product_variants").upsert(
      input.variants.map((variant) => ({
        store_id: input.storeId,
        product_id: input.productId,
        option_name: variant.optionName,
        option_value: variant.optionValue,
        sku: variant.sku,
        price_cents: variant.priceCents,
        currency: input.currency,
        inventory_count: variant.inventoryCount,
        status: variant.status,
        sort_order: variant.sortOrder,
      })),
      { onConflict: "product_id,option_name,option_value" },
    );

    if (error) {
      return { error };
    }
  }

  const { data: existingRows, error: existingError } = await input.db
    .from("product_variants")
    .select("id, option_name, option_value")
    .eq("store_id", input.storeId)
    .eq("product_id", input.productId);

  if (existingError) {
    return { error: existingError };
  }

  const variantIdsToPause = (existingRows || [])
    .filter((row) => {
      const optionName = String(row.option_name || "").toLowerCase();
      const optionValue = String(row.option_value || "").toLowerCase();

      return !activeKeys.has(`${optionName}:${optionValue}`);
    })
    .map((row) => row.id);

  if (variantIdsToPause.length === 0) {
    return { error: null };
  }

  const { error } = await input.db
    .from("product_variants")
    .update({ status: "paused" })
    .in("id", variantIdsToPause)
    .eq("store_id", input.storeId)
    .eq("product_id", input.productId);

  return { error };
}

export async function createStoreAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = storeSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    currency: formData.get("currency"),
    themeColor: formData.get("themeColor"),
  });

  if (!parsed.success) {
    return formError("Check the store details.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  await upsertProfileForUser(user);

  const db = getSupabaseAdmin();
  const slug = await getAvailableStoreSlug(parsed.data.name);
  const { data: store, error } = await db
    .from("stores")
    .insert({
      owner_id: user.id,
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      currency: parsed.data.currency.toUpperCase(),
      theme_color: parsed.data.themeColor,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  const { error: membershipError } = await db.from("store_memberships").insert({
    store_id: store.id,
    clerk_user_id: user.id,
    role: "owner",
  });

  if (membershipError) {
    return formError(membershipError.message);
  }

  await recordAuditEvent({
    db,
    storeId: store.id,
    clerkUserId: user.id,
    action: "store_created",
    resourceType: "store",
    resourceId: store.id,
    summary: `${user.email} created ${parsed.data.name}.`,
    metadata: {
      currency: parsed.data.currency.toUpperCase(),
      status: "draft",
    },
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/stores/${store.id}`);
}

export async function createProductAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku") || undefined,
    category: formData.get("category") || undefined,
    description: formData.get("description"),
    price: formData.get("price"),
    inventory: formData.get("inventory"),
    status: formData.get("status"),
    variantOptionName: formData.get("variantOptionName") || undefined,
    variantRows: formData.get("variantRows") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the product details.", parsed.error.flatten().fieldErrors);
  }

  const priceCents = toPriceCents(parsed.data.price);

  if (priceCents === null || priceCents < 0) {
    return formError("Add a valid product price.", {
      price: ["Price must be a positive number."],
    });
  }

  const parsedVariants = parseProductVariantRows({
    optionName: parsed.data.variantOptionName,
    rows: parsed.data.variantRows,
  });

  if (parsedVariants.errors) {
    return formError("Check the product variants.", parsedVariants.errors);
  }

  const catalogTotals = getVariantCatalogTotals(
    priceCents,
    parsed.data.inventory,
    parsedVariants.variants,
  );

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_catalog",
  );
  const db = getSupabaseAdmin();
  const slug = await getAvailableProductSlug(storeId, parsed.data.name);

  try {
    const image = await uploadProductImage(storeId, formData.get("image"));
    const { data: product, error } = await db
      .from("products")
      .insert({
        store_id: storeId,
        name: parsed.data.name,
        slug,
        sku: optionalText(parsed.data.sku),
        category: optionalText(parsed.data.category),
        description: parsed.data.description,
        price_cents: catalogTotals.priceCents,
        currency: workspace.store.currency,
        inventory_count: catalogTotals.inventoryCount,
        image_url: image.imageUrl,
        image_path: image.imagePath,
        status: parsed.data.status,
      })
      .select("id")
      .single();

    if (error) {
      return formError(error.message);
    }

    if (parsedVariants.variants.length > 0) {
      const { error: variantError } = await syncProductVariants({
        db,
        storeId,
        productId: product.id,
        currency: workspace.store.currency,
        variants: parsedVariants.variants,
      });

      if (variantError) {
        await db.from("products").delete().eq("id", product.id).eq("store_id", storeId);

        return formError(variantError.message);
      }
    }

    await recordAuditEvent({
      db,
      storeId,
      clerkUserId: user.id,
      action: "product_created",
      resourceType: "product",
      resourceId: product.id,
      summary: `${user.email} created product ${parsed.data.name}.`,
      metadata: {
        status: parsed.data.status,
        priceCents: catalogTotals.priceCents,
        inventoryCount: catalogTotals.inventoryCount,
        variantCount: parsedVariants.variants.length,
      },
    });
  } catch (error) {
    return formError(error instanceof Error ? error.message : "Could not save product.");
  }

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: "Product saved.",
  };
}

export async function updateStoreAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = storeUpdateSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    currency: formData.get("currency"),
    themeColor: formData.get("themeColor"),
    status: formData.get("status"),
    shippingRate: formData.get("shippingRate") || undefined,
    freeShippingThreshold: formData.get("freeShippingThreshold") || undefined,
    taxRate: formData.get("taxRate") || undefined,
    seoTitle: formData.get("seoTitle") || undefined,
    seoDescription: formData.get("seoDescription") || undefined,
    socialImageUrl: formData.get("socialImageUrl") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the store details.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const nextCurrency = parsed.data.currency.toUpperCase();
  const shippingRateCents = parseOptionalPriceCents(parsed.data.shippingRate);
  const freeShippingThresholdCents = parseOptionalPriceCents(
    parsed.data.freeShippingThreshold,
  );
  const taxRateBps = parseTaxRateBps(parsed.data.taxRate);

  if (shippingRateCents === null || shippingRateCents < 0) {
    return formError("Add a valid shipping rate.", {
      shippingRate: ["Shipping rate must be a positive amount."],
    });
  }

  if (
    freeShippingThresholdCents === null ||
    freeShippingThresholdCents < 0
  ) {
    return formError("Add a valid free shipping threshold.", {
      freeShippingThreshold: [
        "Free shipping threshold must be a positive amount.",
      ],
    });
  }

  if (taxRateBps === null) {
    return formError("Add a valid tax rate.", {
      taxRate: ["Tax rate must be between 0 and 100."],
    });
  }

  if (workspace.store.status !== "active" && parsed.data.status === "active") {
    const launchReadiness = getStoreLaunchReadiness({
      ...workspace,
      store: {
        ...workspace.store,
        name: parsed.data.name,
        description: parsed.data.description,
        currency: nextCurrency,
        themeColor: parsed.data.themeColor,
        status: parsed.data.status,
        seoTitle: optionalText(parsed.data.seoTitle) || undefined,
        seoDescription: optionalText(parsed.data.seoDescription) || undefined,
        socialImageUrl: optionalText(parsed.data.socialImageUrl) || undefined,
        shippingRateCents,
        freeShippingThresholdCents,
        taxRateBps,
      },
    });

    if (!launchReadiness.canPublish) {
      return formError("Resolve launch blockers before activating this store.", {
        status: launchReadiness.blockingChecks.map((check) => check.detail),
      });
    }
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      currency: nextCurrency,
      theme_color: parsed.data.themeColor,
      status: parsed.data.status,
      seo_title: optionalText(parsed.data.seoTitle),
      seo_description: optionalText(parsed.data.seoDescription),
      social_image_url: optionalText(parsed.data.socialImageUrl),
      shipping_rate_cents: shippingRateCents,
      free_shipping_threshold_cents: freeShippingThresholdCents,
      tax_rate_bps: taxRateBps,
    })
    .eq("id", storeId);

  if (error) {
    return formError(error.message);
  }

  if (nextCurrency !== workspace.store.currency) {
    const { error: productCurrencyError } = await db
      .from("products")
      .update({ currency: nextCurrency })
      .eq("store_id", storeId);

    if (productCurrencyError) {
      return formError(productCurrencyError.message);
    }
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "store_updated",
    resourceType: "store",
    resourceId: storeId,
    summary: `${user.email} updated store settings.`,
    metadata: {
      status: parsed.data.status,
      currency: nextCurrency,
      shippingRateCents,
      freeShippingThresholdCents,
      taxRateBps,
      seoTitle: optionalText(parsed.data.seoTitle),
      hasSocialImage: Boolean(optionalText(parsed.data.socialImageUrl)),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: "Store updated.",
  };
}

export async function updateStorePoliciesAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const policies = [];
  const errors: ActionState["errors"] = {};

  for (const type of storePolicyTypes) {
    const parsed = storePolicyUpdateSchema.safeParse({
      type,
      title: formData.get(`title:${type}`),
      body: formData.get(`body:${type}`),
      status: formData.get(`status:${type}`),
    });

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;

      for (const [field, messages] of Object.entries(fieldErrors)) {
        if (messages?.length) {
          errors[`${field}:${type}`] = messages;
        }
      }

      continue;
    }

    policies.push(parsed.data);
  }

  if (Object.keys(errors).length > 0) {
    return formError("Check storefront policies.", errors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const db = getSupabaseAdmin();
  const publishedAt = new Date().toISOString();
  const { error } = await db.from("store_policies").upsert(
    policies.map((policy) => ({
      store_id: storeId,
      type: policy.type,
      title: policy.title,
      body: policy.body,
      status: policy.status,
      published_at: policy.status === "published" ? publishedAt : null,
    })),
    { onConflict: "store_id,type" },
  );

  if (error) {
    return formError(error.message);
  }

  const publishedCount = policies.filter(
    (policy) => policy.status === "published",
  ).length;

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "store_policy_updated",
    resourceType: "store_policy",
    resourceId: storeId,
    summary: `${user.email} updated storefront policies.`,
    metadata: {
      policyTypes: policies.map((policy) => policy.type).join(","),
      publishedCount,
      draftCount: policies.length - publishedCount,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  for (const type of storePolicyTypes) {
    revalidatePath(`/stores/${workspace.store.slug}/policies/${type}`);
  }

  return {
    status: "success",
    message: `${publishedCount} storefront policies published.`,
  };
}

export async function createStorePageAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = storePageSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug") || undefined,
    body: formData.get("body"),
    seoTitle: formData.get("seoTitle") || undefined,
    seoDescription: formData.get("seoDescription") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return formError("Check the storefront page.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const db = getSupabaseAdmin();
  const slug = await getAvailableStorePageSlug(
    storeId,
    parsed.data.slug || parsed.data.title,
  );
  const publishedAt =
    parsed.data.status === "published" ? new Date().toISOString() : null;
  const { data: page, error } = await db
    .from("store_pages")
    .insert({
      store_id: storeId,
      title: parsed.data.title,
      slug,
      body: parsed.data.body,
      seo_title: optionalText(parsed.data.seoTitle),
      seo_description: optionalText(parsed.data.seoDescription),
      status: parsed.data.status,
      published_at: publishedAt,
    })
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "store_page_created",
    resourceType: "store_page",
    resourceId: page.id,
    summary: `${user.email} created storefront page ${parsed.data.title}.`,
    metadata: {
      slug,
      status: parsed.data.status,
      hasSeoTitle: Boolean(optionalText(parsed.data.seoTitle)),
      hasSeoDescription: Boolean(optionalText(parsed.data.seoDescription)),
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/pages/${slug}`);

  return {
    status: "success",
    message: `Page ${parsed.data.title} saved.`,
  };
}

export async function updateStorePageAction(
  storeId: string,
  pageId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = storePageSchema.safeParse({
    title: formData.get("title"),
    slug: formData.get("slug") || undefined,
    body: formData.get("body"),
    seoTitle: formData.get("seoTitle") || undefined,
    seoDescription: formData.get("seoDescription") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return formError("Check the storefront page.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const currentPage = workspace.customPages.find((page) => page.id === pageId);

  if (!currentPage) {
    return formError("Storefront page not found.");
  }

  const db = getSupabaseAdmin();
  const slug = await getAvailableStorePageSlug(
    storeId,
    parsed.data.slug || parsed.data.title,
    pageId,
  );
  const publishedAt =
    parsed.data.status === "published"
      ? currentPage.publishedAt || new Date().toISOString()
      : null;
  const { error } = await db
    .from("store_pages")
    .update({
      title: parsed.data.title,
      slug,
      body: parsed.data.body,
      seo_title: optionalText(parsed.data.seoTitle),
      seo_description: optionalText(parsed.data.seoDescription),
      status: parsed.data.status,
      published_at: publishedAt,
    })
    .eq("id", pageId)
    .eq("store_id", storeId);

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "store_page_updated",
    resourceType: "store_page",
    resourceId: pageId,
    summary: `${user.email} updated storefront page ${parsed.data.title}.`,
    metadata: {
      previousSlug: currentPage.slug,
      slug,
      previousStatus: currentPage.status,
      status: parsed.data.status,
      hasSeoTitle: Boolean(optionalText(parsed.data.seoTitle)),
      hasSeoDescription: Boolean(optionalText(parsed.data.seoDescription)),
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/pages/${currentPage.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/pages/${slug}`);

  return {
    status: "success",
    message: `Page ${parsed.data.title} updated.`,
  };
}

export async function updateStoreNavigationAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = storeNavigationSchema.safeParse({
    headerLinks: formData.get("headerLinks") || undefined,
    footerLinks: formData.get("footerLinks") || undefined,
  });

  if (!parsed.success) {
    return formError(
      "Check storefront navigation.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const header = parseNavigationMenuLines(parsed.data.headerLinks || "");
  const footer = parseNavigationMenuLines(parsed.data.footerLinks || "");
  const errors: ActionState["errors"] = {};

  if (header.errors.length > 0) {
    errors.headerLinks = header.errors;
  }

  if (footer.errors.length > 0) {
    errors.footerLinks = footer.errors;
  }

  if (Object.keys(errors).length > 0) {
    return formError("Check storefront navigation.", errors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const db = getSupabaseAdmin();
  const menuPayload = storeNavigationLocations.map((location) => ({
    store_id: storeId,
    location,
    links: location === "header" ? header.links : footer.links,
  }));
  const { error } = await db.from("store_navigation_menus").upsert(
    menuPayload,
    { onConflict: "store_id,location" },
  );

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "store_navigation_updated",
    resourceType: "store_navigation_menu",
    resourceId: storeId,
    summary: `${user.email} updated storefront navigation.`,
    metadata: {
      headerLinkCount: header.links.length,
      footerLinkCount: footer.links.length,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: "Storefront navigation updated.",
  };
}

export async function updateProductAction(
  storeId: string,
  productId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = productUpdateSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku") || undefined,
    category: formData.get("category") || undefined,
    description: formData.get("description"),
    price: formData.get("price"),
    inventory: formData.get("inventory"),
    status: formData.get("status"),
    variantOptionName: formData.get("variantOptionName") || undefined,
    variantRows: formData.get("variantRows") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the product details.", parsed.error.flatten().fieldErrors);
  }

  const priceCents = toPriceCents(parsed.data.price);

  if (priceCents === null || priceCents < 0) {
    return formError("Add a valid product price.", {
      price: ["Price must be a positive number."],
    });
  }

  const parsedVariants = parseProductVariantRows({
    optionName: parsed.data.variantOptionName,
    rows: parsed.data.variantRows,
  });

  if (parsedVariants.errors) {
    return formError("Check the product variants.", parsedVariants.errors);
  }

  const catalogTotals = getVariantCatalogTotals(
    priceCents,
    parsed.data.inventory,
    parsedVariants.variants,
  );

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_catalog",
  );
  const product = workspace.products.find((item) => item.id === productId);

  if (!product) {
    return formError("Product not found.");
  }

  const db = getSupabaseAdmin();

  try {
    const image = await uploadProductImage(storeId, formData.get("image"));
    const updatePayload: {
      name: string;
      sku: string | null;
      category: string | null;
      description: string;
      price_cents: number;
      currency: string;
      inventory_count: number;
      status: z.infer<typeof productUpdateSchema>["status"];
      image_url?: string | null;
      image_path?: string | null;
    } = {
      name: parsed.data.name,
      sku: optionalText(parsed.data.sku),
      category: optionalText(parsed.data.category),
      description: parsed.data.description,
      price_cents: catalogTotals.priceCents,
      currency: workspace.store.currency,
      inventory_count: catalogTotals.inventoryCount,
      status: parsed.data.status,
    };

    if (image.imageUrl) {
      updatePayload.image_url = image.imageUrl;
      updatePayload.image_path = image.imagePath;
    }

    const { error } = await db
      .from("products")
      .update(updatePayload)
      .eq("id", productId)
      .eq("store_id", storeId);

    if (error) {
      return formError(error.message);
    }

    const { error: variantError } = await syncProductVariants({
      db,
      storeId,
      productId,
      currency: workspace.store.currency,
      variants: parsedVariants.variants,
    });

    if (variantError) {
      return formError(variantError.message);
    }

    if (catalogTotals.inventoryCount !== product.inventoryCount) {
      const { error: adjustmentError } = await insertInventoryAdjustment({
        db,
        storeId,
        productId,
        clerkUserId: user.id,
        reason: "manual_edit",
        reference: "Product edit",
        note: "Inventory changed from the product edit form.",
        previousInventory: product.inventoryCount,
        nextInventory: catalogTotals.inventoryCount,
      });

      if (adjustmentError) {
        return formError(adjustmentError.message);
      }
    }

    await recordAuditEvent({
      db,
      storeId,
      clerkUserId: user.id,
      action: "product_updated",
      resourceType: "product",
      resourceId: productId,
      summary: `${user.email} updated product ${parsed.data.name}.`,
      metadata: {
        previousStatus: product.status,
        status: parsed.data.status,
        priceCents: catalogTotals.priceCents,
        inventoryCount: catalogTotals.inventoryCount,
        variantCount: parsedVariants.variants.length,
      },
    });
  } catch (error) {
    return formError(error instanceof Error ? error.message : "Could not update product.");
  }

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/products`);
  revalidatePath(`/dashboard/stores/${storeId}/products/${productId}/edit`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: "Product updated.",
  };
}

export async function adjustInventoryAction(
  storeId: string,
  productId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = inventoryAdjustmentSchema.safeParse({
    delta: formData.get("delta"),
    reason: formData.get("reason"),
    reference: formData.get("reference") || undefined,
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the inventory adjustment.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_inventory",
  );
  const product = workspace.products.find((item) => item.id === productId);

  if (!product) {
    return formError("Product not found.");
  }

  const nextInventory = product.inventoryCount + parsed.data.delta;

  if (nextInventory < 0) {
    return formError("Inventory cannot go below zero.", {
      delta: ["This adjustment would make inventory negative."],
    });
  }

  const db = getSupabaseAdmin();
  const { data: updatedProduct, error: updateError } = await db
    .from("products")
    .update({ inventory_count: nextInventory })
    .eq("id", productId)
    .eq("store_id", storeId)
    .eq("inventory_count", product.inventoryCount)
    .select("id")
    .maybeSingle();

  if (updateError) {
    return formError(updateError.message);
  }

  if (!updatedProduct) {
    return formError("Inventory changed while this adjustment was being saved.");
  }

  const { error: adjustmentError } = await insertInventoryAdjustment({
    db,
    storeId,
    productId,
    clerkUserId: user.id,
    reason: parsed.data.reason,
    reference: parsed.data.reference,
    note: parsed.data.note,
    previousInventory: product.inventoryCount,
    nextInventory,
  });

  if (adjustmentError) {
    await db
      .from("products")
      .update({ inventory_count: product.inventoryCount })
      .eq("id", productId)
      .eq("store_id", storeId)
      .eq("inventory_count", nextInventory);

    return formError(adjustmentError.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "inventory_adjusted",
    resourceType: "product",
    resourceId: productId,
    summary: `${user.email} adjusted ${product.name} inventory by ${parsed.data.delta}.`,
    metadata: {
      delta: parsed.data.delta,
      reason: parsed.data.reason,
      previousInventory: product.inventoryCount,
      nextInventory,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/products`);
  revalidatePath(`/dashboard/stores/${storeId}/products/${productId}/edit`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: `Inventory adjusted to ${nextInventory}.`,
  };
}

export async function createDiscountAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = discountSchema.safeParse({
    code: formData.get("code"),
    type: formData.get("type"),
    value: formData.get("value"),
    minSubtotal: formData.get("minSubtotal") || undefined,
    usageLimit: formData.get("usageLimit") || undefined,
    status: formData.get("status"),
    startsAt: formData.get("startsAt") || undefined,
    endsAt: formData.get("endsAt") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the discount details.", parsed.error.flatten().fieldErrors);
  }

  const code = normalizeDiscountCode(parsed.data.code);
  const value =
    parsed.data.type === "fixed"
      ? toPriceCents(parsed.data.value)
      : Number(parsed.data.value);
  const minSubtotalCents = parseOptionalPriceCents(parsed.data.minSubtotal);
  const usageLimit = parseOptionalPositiveInteger(parsed.data.usageLimit);
  const startsAt = parseDateTime(parsed.data.startsAt);
  const endsAt = parseDateTime(parsed.data.endsAt);

  if (!code) {
    return formError("Add a discount code.", {
      code: ["Add a discount code."],
    });
  }

  if (
    value === null ||
    !Number.isInteger(value) ||
    value <= 0 ||
    (parsed.data.type === "percent" && value > 100)
  ) {
    return formError("Add a valid discount value.", {
      value: [
        parsed.data.type === "percent"
          ? "Percent discounts must be 1 to 100."
          : "Fixed discounts must be a positive amount.",
      ],
    });
  }

  if (minSubtotalCents === null || minSubtotalCents < 0) {
    return formError("Add a valid minimum subtotal.", {
      minSubtotal: ["Minimum subtotal must be a positive amount."],
    });
  }

  if (Number.isNaN(usageLimit)) {
    return formError("Add a valid usage limit.", {
      usageLimit: ["Usage limit must be a whole number."],
    });
  }

  if (startsAt === "invalid" || endsAt === "invalid") {
    return formError("Add valid schedule dates.");
  }

  if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) {
    return formError("Discount end date must be after the start date.");
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  await assertStorePermission(user.id, storeId, "manage_discounts");

  const db = getSupabaseAdmin();
  const { data: discount, error } = await db
    .from("discount_codes")
    .insert({
      store_id: storeId,
      code,
      type: parsed.data.type,
      value,
      min_subtotal_cents: minSubtotalCents,
      usage_limit: usageLimit,
      status: parsed.data.status,
      starts_at: startsAt,
      ends_at: endsAt,
    })
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "discount_created",
    resourceType: "discount_code",
    resourceId: discount.id,
    summary: `${user.email} created discount ${code}.`,
    metadata: {
      code,
      type: parsed.data.type,
      value,
      status: parsed.data.status,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);

  return {
    status: "success",
    message: "Discount saved.",
  };
}

export async function createGiftCardAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = giftCardSchema.safeParse({
    code: formData.get("code") || undefined,
    amount: formData.get("amount"),
    recipientEmail: formData.get("recipientEmail") || undefined,
    note: formData.get("note") || undefined,
    expiresAt: formData.get("expiresAt") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return formError("Check the gift card details.", parsed.error.flatten().fieldErrors);
  }

  const amountCents = toPriceCents(parsed.data.amount);

  if (amountCents === null || amountCents <= 0) {
    return formError("Add a valid gift card amount.", {
      amount: ["Gift card amount must be greater than zero."],
    });
  }

  const code = normalizeGiftCardCode(parsed.data.code) || createGiftCardCode();

  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) {
    return formError("Use letters, numbers, hyphens, or underscores.", {
      code: ["Use letters, numbers, hyphens, or underscores."],
    });
  }

  const expiresAt = parseDateTime(parsed.data.expiresAt);

  if (expiresAt === "invalid") {
    return formError("Add a valid expiration date.", {
      expiresAt: ["Add a valid expiration date."],
    });
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_discounts",
  );
  const db = getSupabaseAdmin();
  const { data: giftCard, error } = await db
    .from("gift_cards")
    .insert({
      store_id: storeId,
      code,
      initial_balance_cents: amountCents,
      balance_cents: amountCents,
      currency: workspace.store.currency,
      status: parsed.data.status,
      recipient_email: optionalText(parsed.data.recipientEmail),
      note: optionalText(parsed.data.note),
      expires_at: expiresAt,
      created_by_user_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "gift_card_created",
    resourceType: "gift_card",
    resourceId: giftCard.id,
    summary: `${user.email} created gift card ${maskGiftCardCode(code)}.`,
    metadata: {
      amountCents,
      code: maskGiftCardCode(code),
      status: parsed.data.status,
      hasRecipient: Boolean(optionalText(parsed.data.recipientEmail)),
    },
  });

  if (optionalText(parsed.data.recipientEmail)) {
    await queueNotification({
      db,
      storeId,
      type: "gift_card_created",
      recipientEmail: parsed.data.recipientEmail || "",
      subject: `${workspace.store.name} gift card`,
      preview: `A gift card for ${(amountCents / 100).toFixed(2)} ${workspace.store.currency} is ready.`,
      resourceType: "gift_card",
      resourceId: giftCard.id,
      metadata: {
        amountCents,
        code,
        expiresAt,
      },
    });
  }

  revalidatePath(`/dashboard/stores/${storeId}`);

  return {
    status: "success",
    message: `Gift card ${maskGiftCardCode(code)} created.`,
  };
}

export async function createCollectionAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = collectionSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    imageUrl: formData.get("imageUrl") || undefined,
    status: formData.get("status"),
    productIds: formData.getAll("productIds"),
  });

  if (!parsed.success) {
    return formError("Check the collection details.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_catalog",
  );
  const allowedProductIds = new Set(workspace.products.map((product) => product.id));
  const productIds = [...new Set(parsed.data.productIds)].filter((productId) =>
    allowedProductIds.has(productId),
  );

  if (productIds.length === 0) {
    return formError("Choose at least one product.", {
      productIds: ["Choose at least one product."],
    });
  }

  const db = getSupabaseAdmin();
  const slug = await getAvailableCollectionSlug(storeId, parsed.data.title);
  const { data: collection, error } = await db
    .from("collections")
    .insert({
      store_id: storeId,
      title: parsed.data.title,
      slug,
      description: optionalText(parsed.data.description),
      image_url: optionalText(parsed.data.imageUrl),
      status: parsed.data.status,
      sort_order: workspace.collections.length + 1,
    })
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  const { error: productsError } = await db.from("collection_products").insert(
    productIds.map((productId, index) => ({
      collection_id: collection.id,
      product_id: productId,
      sort_order: index + 1,
    })),
  );

  if (productsError) {
    await db.from("collections").delete().eq("id", collection.id).eq("store_id", storeId);

    return formError(productsError.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "collection_created",
    resourceType: "collection",
    resourceId: collection.id,
    summary: `${user.email} created collection ${parsed.data.title}.`,
    metadata: {
      status: parsed.data.status,
      productCount: productIds.length,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/collections/${slug}`);

  return {
    status: "success",
    message: "Collection saved.",
  };
}

export async function updateCollectionStatusAction(
  storeId: string,
  collectionId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = collectionStatusSchema.safeParse({
    status: formData.get("status"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid collection status.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_catalog",
  );
  const collection = workspace.collections.find((item) => item.id === collectionId);

  if (!collection) {
    throw new Error("Collection not found.");
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("collections")
    .update({ status: parsed.data.status })
    .eq("id", collectionId)
    .eq("store_id", storeId);

  if (error) {
    throw error;
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "collection_status_updated",
    resourceType: "collection",
    resourceId: collectionId,
    summary: `${user.email} changed collection ${collection.title} to ${parsed.data.status}.`,
    metadata: {
      previousStatus: collection.status,
      status: parsed.data.status,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/collections/${collection.slug}`);
}

export async function createShippingZoneAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = shippingZoneSchema.safeParse({
    name: formData.get("name"),
    countries: formData.get("countries"),
    rate: formData.get("rate"),
    freeShippingThreshold: formData.get("freeShippingThreshold") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return formError("Check the shipping zone details.", parsed.error.flatten().fieldErrors);
  }

  const countries = parseShippingCountries(parsed.data.countries);
  const rateCents = toPriceCents(parsed.data.rate);
  const freeShippingThresholdCents = parseOptionalPriceCents(
    parsed.data.freeShippingThreshold,
  );

  if (countries.length === 0) {
    return formError("Add at least one country.", {
      countries: ["Add at least one country."],
    });
  }

  if (countries.length > 50) {
    return formError("Keep each zone to 50 country aliases or fewer.", {
      countries: ["Keep each zone to 50 country aliases or fewer."],
    });
  }

  if (rateCents === null || rateCents < 0) {
    return formError("Add a valid shipping rate.", {
      rate: ["Shipping rate must be zero or a positive amount."],
    });
  }

  if (freeShippingThresholdCents === null || freeShippingThresholdCents < 0) {
    return formError("Add a valid free shipping threshold.", {
      freeShippingThreshold: ["Threshold must be zero or a positive amount."],
    });
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_shipping",
  );
  const db = getSupabaseAdmin();
  const { data: shippingZone, error } = await db
    .from("shipping_zones")
    .insert({
      store_id: storeId,
      name: parsed.data.name,
      countries,
      rate_cents: rateCents,
      free_shipping_threshold_cents: freeShippingThresholdCents,
      status: parsed.data.status,
    })
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "shipping_zone_created",
    resourceType: "shipping_zone",
    resourceId: shippingZone.id,
    summary: `${user.email} created shipping zone ${parsed.data.name}.`,
    metadata: {
      countryCount: countries.length,
      rateCents,
      freeShippingThresholdCents,
      status: parsed.data.status,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/checkout`);

  return {
    status: "success",
    message: "Shipping zone saved.",
  };
}

export async function updateShippingZoneStatusAction(
  storeId: string,
  shippingZoneId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = shippingZoneStatusSchema.safeParse({
    status: formData.get("status"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid shipping zone status.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_shipping",
  );
  const shippingZone = workspace.shippingZones.find(
    (zone) => zone.id === shippingZoneId,
  );

  if (!shippingZone) {
    throw new Error("Shipping zone not found.");
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("shipping_zones")
    .update({ status: parsed.data.status })
    .eq("id", shippingZoneId)
    .eq("store_id", storeId);

  if (error) {
    throw error;
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "shipping_zone_status_updated",
    resourceType: "shipping_zone",
    resourceId: shippingZoneId,
    summary: `${user.email} changed shipping zone ${shippingZone.name} to ${parsed.data.status}.`,
    metadata: {
      previousStatus: shippingZone.status,
      status: parsed.data.status,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/checkout`);
}

export async function createManualOrderAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = manualOrderSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone") || undefined,
    shippingAddressLine1: formData.get("shippingAddressLine1") || undefined,
    shippingAddressLine2: formData.get("shippingAddressLine2") || undefined,
    shippingCity: formData.get("shippingCity") || undefined,
    shippingRegion: formData.get("shippingRegion") || undefined,
    shippingPostalCode: formData.get("shippingPostalCode") || undefined,
    shippingCountry: formData.get("shippingCountry") || undefined,
    lineIds: formData
      .getAll("lineIds")
      .filter((value): value is string => typeof value === "string"),
    manualDiscount: formData.get("manualDiscount") || undefined,
    manualShipping: formData.get("manualShipping") || undefined,
    paymentStatus: formData.get("paymentStatus"),
    paymentMethod: formData.get("paymentMethod"),
    paymentProvider: formData.get("paymentProvider") || undefined,
    paymentReference: formData.get("paymentReference") || undefined,
    internalNote: formData.get("internalNote") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the manual order details.", parsed.error.flatten().fieldErrors);
  }

  const manualDiscountCents = parseOptionalPriceCents(parsed.data.manualDiscount);
  const manualShippingCents = parseOptionalPriceCents(parsed.data.manualShipping);

  if (manualDiscountCents === null || manualDiscountCents < 0) {
    return formError("Add a valid discount amount.", {
      manualDiscount: ["Discount must be zero or a positive amount."],
    });
  }

  if (manualShippingCents === null || manualShippingCents < 0) {
    return formError("Add a valid shipping amount.", {
      manualShipping: ["Shipping must be zero or a positive amount."],
    });
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_orders",
  );
  const lineResult = getManualOrderItems({
    formData,
    lineIds: parsed.data.lineIds,
    products: workspace.products,
  });

  if (lineResult.errors || lineResult.message) {
    return formError(
      lineResult.message || "Check manual order items.",
      lineResult.errors,
    );
  }

  const orderItems = lineResult.items;
  const subtotalCents = orderItems.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0,
  );

  if (manualDiscountCents > subtotalCents) {
    return formError("Discount cannot exceed the subtotal.", {
      manualDiscount: ["Discount cannot exceed the subtotal."],
    });
  }

  const discountedSubtotalCents = subtotalCents - manualDiscountCents;
  const taxCents = calculateTaxCents(
    discountedSubtotalCents,
    workspace.store.taxRateBps,
  );
  const totalCents =
    discountedSubtotalCents + manualShippingCents + taxCents;
  const paidAt =
    parsed.data.paymentStatus === "paid" ? new Date().toISOString() : null;
  const paymentProvider =
    optionalText(parsed.data.paymentProvider) ||
    getManualPaymentProvider(parsed.data.paymentMethod);
  const paymentReference = optionalText(parsed.data.paymentReference);
  const customerAccessToken = createCustomerAccessToken();
  const db = getSupabaseAdmin();
  const reservation = await reserveOrderInventory({
    db,
    storeId,
    items: orderItems,
  });

  if (reservation.error) {
    return formError(reservation.error);
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      store_id: storeId,
      customer_name: parsed.data.customerName,
      customer_email: parsed.data.customerEmail,
      customer_phone: parsed.data.customerPhone || null,
      shipping_address_line1: parsed.data.shippingAddressLine1 || null,
      shipping_address_line2: parsed.data.shippingAddressLine2 || null,
      shipping_city: parsed.data.shippingCity || null,
      shipping_region: parsed.data.shippingRegion || null,
      shipping_postal_code: parsed.data.shippingPostalCode || null,
      shipping_country: parsed.data.shippingCountry || null,
      customer_note: null,
      status: parsed.data.paymentStatus === "paid" ? "paid" : "pending",
      order_source: "manual",
      internal_note: optionalText(parsed.data.internalNote),
      payment_status: parsed.data.paymentStatus,
      payment_method: parsed.data.paymentMethod,
      payment_provider: paymentProvider,
      payment_reference: paymentReference,
      customer_access_token: customerAccessToken,
      subtotal_cents: subtotalCents,
      discount_code: manualDiscountCents > 0 ? "MANUAL" : null,
      discount_cents: manualDiscountCents,
      gift_card_code: null,
      gift_card_cents: 0,
      shipping_cents: manualShippingCents,
      tax_cents: taxCents,
      tax_rate_bps: workspace.store.taxRateBps,
      total_cents: totalCents,
      amount_due_cents: parsed.data.paymentStatus === "paid" ? 0 : totalCents,
      currency: workspace.store.currency,
      paid_at: paidAt,
    })
    .select("id")
    .single();

  if (orderError) {
    await rollbackReservedInventory(db, reservation.reservedInventory);

    return formError(orderError.message);
  }

  const { error: itemError } = await db.from("order_items").insert(
    orderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product.id,
      product_variant_id: item.variant?.id || null,
      product_name: item.product.name,
      variant_name: item.variantName || null,
      variant_sku: item.variantSku || null,
      unit_price_cents: item.unitPriceCents,
      quantity: item.quantity,
    })),
  );

  if (itemError) {
    await db.from("orders").delete().eq("id", order.id).eq("store_id", storeId);
    await rollbackReservedInventory(db, reservation.reservedInventory);

    return formError(itemError.message);
  }

  if (parsed.data.paymentStatus === "paid" && totalCents > 0) {
    const transaction = await insertPaymentTransaction({
      db,
      storeId,
      orderId: order.id,
      clerkUserId: user.id,
      type: "capture",
      paymentMethod: parsed.data.paymentMethod,
      paymentProvider,
      providerReference: paymentReference,
      amountCents: totalCents,
      currency: workspace.store.currency,
      processedAt: paidAt,
      metadata: {
        source: "manual_order",
      },
    });

    if (transaction.error) {
      await db.from("orders").delete().eq("id", order.id).eq("store_id", storeId);
      await rollbackReservedInventory(db, reservation.reservedInventory);

      return formError(transaction.error.message);
    }
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "manual_order_created",
    resourceType: "order",
    resourceId: order.id,
    summary: `${user.email} created manual order ${order.id.slice(0, 8)}.`,
    metadata: {
      customerEmail: parsed.data.customerEmail,
      itemCount: orderItems.length,
      totalCents,
      paymentStatus: parsed.data.paymentStatus,
    },
  });

  const orderStatusUrl = getCustomerOrderStatusHref({
    storeSlug: workspace.store.slug,
    orderId: order.id,
    token: customerAccessToken,
  });

  await queueNotification({
    db,
    storeId,
    type: "manual_order_invoice",
    recipientEmail: parsed.data.customerEmail,
    recipientName: parsed.data.customerName,
    subject: `${workspace.store.name} order ${order.id.slice(0, 8)}`,
    preview: `Your manual order is ${parsed.data.paymentStatus}. Total ${(totalCents / 100).toFixed(2)} ${workspace.store.currency}.`,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderId: order.id,
      orderStatusUrl,
      paymentStatus: parsed.data.paymentStatus,
      totalCents,
      currency: workspace.store.currency,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders`);
  revalidatePath(`/dashboard/stores/${storeId}/customers`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: `Manual order ${order.id.slice(0, 8)} created.`,
    data: {
      orderId: order.id,
      orderStatusUrl,
    },
  };
}

export async function createCheckoutOrderAction(
  storeSlug: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = checkoutSchema.safeParse({
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone") || undefined,
    shippingAddressLine1: formData.get("shippingAddressLine1"),
    shippingAddressLine2: formData.get("shippingAddressLine2") || undefined,
    shippingCity: formData.get("shippingCity"),
    shippingRegion: formData.get("shippingRegion"),
    shippingPostalCode: formData.get("shippingPostalCode"),
    shippingCountry: formData.get("shippingCountry"),
    paymentMethod: formData.get("paymentMethod"),
    customerNote: formData.get("customerNote") || undefined,
    discountCode: formData.get("discountCode") || undefined,
    giftCardCode: formData.get("giftCardCode") || undefined,
    abandonedCheckoutToken:
      formData.get("abandonedCheckoutToken") || undefined,
    checkoutSessionId: formData.get("checkoutSessionId") || undefined,
    cart: readCartPayload(formData.get("cart")),
  });

  if (!parsed.success) {
    return formError("Check the checkout details.", parsed.error.flatten().fieldErrors);
  }

  const rateLimitError = await consumePublicServerActionRateLimit(
    `checkout:${storeSlug}:${parsed.data.customerEmail.trim().toLowerCase()}`,
    publicCheckoutActionRateLimit,
  );

  if (rateLimitError) {
    return rateLimitError;
  }

  if (!isSupabaseConfigured()) {
    return checkoutDisabledState();
  }

  let storefront;

  try {
    storefront = await getLivePublicStorefront(storeSlug);
  } catch {
    return formError("Checkout database is not ready. Run the Supabase schema first.");
  }

  if (!storefront) {
    return formError("This store is not accepting orders.");
  }

  const checkoutSessionId = normalizeCheckoutSessionId(
    parsed.data.checkoutSessionId,
  );

  if (parsed.data.checkoutSessionId && !checkoutSessionId) {
    return formError("Checkout session is invalid.", {
      checkoutSessionId: ["Checkout session is invalid."],
    });
  }

  const db = getSupabaseAdmin();
  const existingCheckoutOrder = await getExistingCheckoutOrder({
    customerEmail: parsed.data.customerEmail,
    db,
    sessionId: checkoutSessionId,
    storeId: storefront.store.id,
    storeSlug: storefront.store.slug,
  });

  if (existingCheckoutOrder) {
    return existingCheckoutOrder.state;
  }

  const cartLines = normalizeCartLines(parsed.data.cart);
  const hasTooManyItems = cartLines.some((line) => line.quantity > 99);

  if (hasTooManyItems) {
    return formError("Keep each line item quantity at 99 or lower.");
  }

  const productsById = new Map(
    storefront.products.map((product) => [product.id, product]),
  );
  const orderItems: Array<{
    product: Product;
    variant?: ProductVariant;
    variantName?: string;
    variantSku?: string;
    unitPriceCents: number;
    quantity: number;
    lineTotalCents: number;
  }> = [];

  for (const line of cartLines) {
    const product = productsById.get(line.productId);

    if (!product) {
      return formError("One or more cart items are no longer available.");
    }

    const activeVariants = product.variants.filter(
      (variant) => variant.status === "active",
    );
    const variant = line.variantId
      ? activeVariants.find((item) => item.id === line.variantId)
      : undefined;

    if (activeVariants.length > 0 && !variant) {
      return formError(`Choose an available variant for ${product.name}.`);
    }

    if (line.variantId && activeVariants.length === 0) {
      return formError("One or more cart variants are no longer available.");
    }

    const inventoryCount = variant?.inventoryCount ?? product.inventoryCount;
    const unitPriceCents = variant?.priceCents ?? product.priceCents;

    if (inventoryCount < line.quantity) {
      const stockLabel = variant
        ? `${product.name} ${variant.optionValue}`
        : product.name;

      return formError(`${stockLabel} only has ${inventoryCount} in stock.`);
    }

    orderItems.push({
      product,
      variant,
      variantName: variant
        ? `${variant.optionName}: ${variant.optionValue}`
        : undefined,
      variantSku: variant?.sku,
      unitPriceCents,
      quantity: line.quantity,
      lineTotalCents: unitPriceCents * line.quantity,
    });
  }

  const subtotalCents = orderItems.reduce(
    (sum, item) => sum + item.lineTotalCents,
    0,
  );

  if (subtotalCents <= 0) {
    return formError("Add at least one priced item before checkout.");
  }

  const discount = await getCheckoutDiscount({
    code: normalizeDiscountCode(parsed.data.discountCode),
    storeId: storefront.store.id,
    subtotalCents,
  });

  if (discount.error) {
    return formError(discount.error, {
      discountCode: [discount.error],
    });
  }

  const discountedSubtotalCents = Math.max(0, subtotalCents - discount.cents);
  const shippingQuote = calculateShippingQuote({
    discountedSubtotalCents,
    freeShippingThresholdCents: storefront.store.freeShippingThresholdCents,
    shippingCountry: parsed.data.shippingCountry,
    shippingRateCents: storefront.store.shippingRateCents,
    shippingZones: storefront.shippingZones,
  });
  const shippingCents = shippingQuote.shippingCents;
  const taxCents = calculateTaxCents(
    discountedSubtotalCents,
    storefront.store.taxRateBps,
  );
  const totalCents = discountedSubtotalCents + shippingCents + taxCents;
  const giftCard = await getCheckoutGiftCard({
    code: normalizeGiftCardCode(parsed.data.giftCardCode) || null,
    currency: storefront.store.currency,
    orderTotalCents: totalCents,
    storeId: storefront.store.id,
  });

  if (giftCard.error) {
    return formError(giftCard.error, {
      giftCardCode: [giftCard.error],
    });
  }

  const giftCardCents = giftCard.cents;
  const amountDueCents = Math.max(0, totalCents - giftCardCents);
  const customerAccessToken = createCustomerAccessToken();
  const reservedInventory: ReservedInventory[] = [];
  const productInventoryById = new Map(
    orderItems.map((item) => [item.product.id, item.product.inventoryCount]),
  );
  const variantInventoryById = new Map<string, number>();

  for (const item of orderItems) {
    if (item.variant) {
      variantInventoryById.set(item.variant.id, item.variant.inventoryCount);
    }
  }

  let reservedDiscountRedemption: ReservedDiscountRedemption | null = null;
  let reservedGiftCard: ReservedGiftCard | null = null;

  for (const item of orderItems) {
    const productInventory = productInventoryById.get(item.product.id);
    let currentVariantInventory: number | undefined;

    if (productInventory === undefined) {
      return formError("Product inventory could not be reserved.");
    }

    if (item.variant) {
      const variantInventory = variantInventoryById.get(item.variant.id);

      if (variantInventory === undefined) {
        return formError("Variant inventory could not be reserved.");
      }

      currentVariantInventory = variantInventory;
      const nextVariantInventory = variantInventory - item.quantity;
      const { data: variantData, error: variantError } = await db
        .from("product_variants")
        .update({ inventory_count: nextVariantInventory })
        .eq("id", item.variant.id)
        .eq("store_id", storefront.store.id)
        .eq("product_id", item.product.id)
        .eq("inventory_count", variantInventory)
        .select("id")
        .maybeSingle();

      if (variantError || !variantData) {
        await rollbackReservedInventory(db, reservedInventory);

        return formError(
          variantError?.message ||
            "Variant inventory changed while checkout was in progress.",
        );
      }

      variantInventoryById.set(item.variant.id, nextVariantInventory);
    }

    const nextInventory = productInventory - item.quantity;
    const { data, error } = await db
      .from("products")
      .update({ inventory_count: nextInventory })
      .eq("id", item.product.id)
      .eq("store_id", storefront.store.id)
      .eq("inventory_count", productInventory)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      if (item.variant && currentVariantInventory !== undefined) {
        await rollbackInventoryReservationCount(
          db,
          "product_variants",
          item.variant.id,
          item.quantity,
        );
      }

      await rollbackReservedInventory(db, reservedInventory);

      return formError(
        error?.message || "Inventory changed while checkout was in progress.",
      );
    }

    reservedInventory.push({
      productId: item.product.id,
      quantity: item.quantity,
      productVariantId: item.variant?.id,
    });
    productInventoryById.set(item.product.id, nextInventory);
  }

  if (discount.row) {
    const { data, error } = await db
      .from("discount_codes")
      .update({ redemption_count: discount.row.redemption_count + 1 })
      .eq("id", discount.row.id)
      .eq("redemption_count", discount.row.redemption_count)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      await rollbackReservedInventory(db, reservedInventory);

      return formError(
        error?.message || "Discount usage changed while checkout was in progress.",
      );
    }

    reservedDiscountRedemption = {
      id: discount.row.id,
      redemptionCountBefore: discount.row.redemption_count,
    };
  }

  if (giftCard.row && giftCardCents > 0) {
    const balanceAfterCents = giftCard.row.balance_cents - giftCardCents;
    const { data, error } = await db
      .from("gift_cards")
      .update({ balance_cents: balanceAfterCents })
      .eq("id", giftCard.row.id)
      .eq("store_id", storefront.store.id)
      .eq("balance_cents", giftCard.row.balance_cents)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      await rollbackReservedInventory(db, reservedInventory);

      await rollbackDiscountRedemptionReservation(
        db,
        reservedDiscountRedemption,
      );

      return formError(
        error?.message || "Gift card balance changed while checkout was in progress.",
        {
          giftCardCode: ["Gift card balance changed while checkout was in progress."],
        },
      );
    }

    reservedGiftCard = {
      id: giftCard.row.id,
      amountCents: giftCardCents,
      balanceBeforeCents: giftCard.row.balance_cents,
      balanceAfterCents,
    };
  }

  const { data: order, error: orderError } = await db
    .from("orders")
    .insert({
      store_id: storefront.store.id,
      customer_name: parsed.data.customerName,
      customer_email: parsed.data.customerEmail,
      customer_phone: parsed.data.customerPhone || null,
      shipping_address_line1: parsed.data.shippingAddressLine1,
      shipping_address_line2: parsed.data.shippingAddressLine2 || null,
      shipping_city: parsed.data.shippingCity,
      shipping_region: parsed.data.shippingRegion,
      shipping_postal_code: parsed.data.shippingPostalCode,
      shipping_country: parsed.data.shippingCountry,
      customer_note: parsed.data.customerNote || null,
      status: amountDueCents === 0 ? "paid" : "pending",
      order_source: "storefront",
      internal_note: null,
      payment_status: amountDueCents === 0 ? "paid" : "pending",
      payment_method: parsed.data.paymentMethod,
      payment_provider: getManualPaymentProvider(parsed.data.paymentMethod),
      payment_reference: null,
      customer_access_token: customerAccessToken,
      client_order_key: checkoutSessionId,
      subtotal_cents: subtotalCents,
      discount_code: discount.code,
      discount_cents: discount.cents,
      gift_card_code: giftCard.code,
      gift_card_cents: giftCardCents,
      shipping_cents: shippingCents,
      tax_cents: taxCents,
      tax_rate_bps: storefront.store.taxRateBps,
      total_cents: totalCents,
      amount_due_cents: amountDueCents,
      currency: storefront.store.currency,
      paid_at: amountDueCents === 0 ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (orderError) {
    await rollbackReservedInventory(db, reservedInventory);

    await rollbackGiftCardReservation(db, reservedGiftCard);
    await rollbackDiscountRedemptionReservation(db, reservedDiscountRedemption);

    if (isUniqueConstraintError(orderError) && checkoutSessionId) {
      const duplicateCheckoutOrder = await getExistingCheckoutOrder({
        customerEmail: parsed.data.customerEmail,
        db,
        sessionId: checkoutSessionId,
        storeId: storefront.store.id,
        storeSlug: storefront.store.slug,
      });

      if (duplicateCheckoutOrder) {
        return duplicateCheckoutOrder.state;
      }
    }

    return formError(orderError.message);
  }

  const { error: itemError } = await db.from("order_items").insert(
    orderItems.map((item) => ({
      order_id: order.id,
      product_id: item.product.id,
      product_variant_id: item.variant?.id || null,
      product_name: item.product.name,
      variant_name: item.variantName || null,
      variant_sku: item.variantSku || null,
      unit_price_cents: item.unitPriceCents,
      quantity: item.quantity,
    })),
  );

  if (itemError) {
    await db.from("orders").delete().eq("id", order.id);
    await rollbackReservedInventory(db, reservedInventory);

    await rollbackGiftCardReservation(db, reservedGiftCard);
    await rollbackDiscountRedemptionReservation(db, reservedDiscountRedemption);

    return formError(itemError.message);
  }

  if (reservedGiftCard && giftCard.row && giftCardCents > 0) {
    const { error: redemptionError } = await db
      .from("gift_card_redemptions")
      .insert({
        store_id: storefront.store.id,
        gift_card_id: giftCard.row.id,
        order_id: order.id,
        amount_cents: giftCardCents,
        balance_before_cents: reservedGiftCard.balanceBeforeCents,
        balance_after_cents: reservedGiftCard.balanceAfterCents,
      });

    if (redemptionError) {
      await db.from("orders").delete().eq("id", order.id);
      await rollbackReservedInventory(db, reservedInventory);
      await rollbackGiftCardReservation(db, reservedGiftCard);
      await rollbackDiscountRedemptionReservation(db, reservedDiscountRedemption);

      return formError(redemptionError.message);
    }
  }

  const abandonedCheckoutToken = optionalText(
    parsed.data.abandonedCheckoutToken,
  );
  let recoveredAbandonedCheckoutId: string | null = null;

  if (abandonedCheckoutToken) {
    const { data: recoveredCheckout, error: recoveryError } = await db
      .from("abandoned_checkouts")
      .update({
        status: "recovered",
        recovered_order_id: order.id,
        recovered_at: new Date().toISOString(),
      })
      .eq("store_id", storefront.store.id)
      .eq("recovery_token", abandonedCheckoutToken)
      .eq("status", "open")
      .select("id")
      .maybeSingle();

    if (recoveryError) {
      console.warn(
        `Could not mark abandoned checkout recovered: ${recoveryError.message}`,
      );
    } else {
      recoveredAbandonedCheckoutId = recoveredCheckout?.id || null;
    }
  }

  await recordAuditEvent({
    db,
    storeId: storefront.store.id,
    clerkUserId: null,
    action: "checkout_order_created",
    resourceType: "order",
    resourceId: order.id,
    summary: `Storefront checkout created order ${order.id.slice(0, 8)}.`,
    metadata: {
      customerEmail: parsed.data.customerEmail,
      itemCount: orderItems.length,
      totalCents,
      amountDueCents,
      paymentMethod: parsed.data.paymentMethod,
      discountCode: discount.code,
      giftCardCode: giftCard.code,
      giftCardCents,
      recoveredAbandonedCheckoutId,
    },
  });

  if (recoveredAbandonedCheckoutId) {
    await recordAuditEvent({
      db,
      storeId: storefront.store.id,
      clerkUserId: null,
      action: "abandoned_checkout_recovered",
      resourceType: "abandoned_checkout",
      resourceId: recoveredAbandonedCheckoutId,
      summary: `Storefront checkout recovered abandoned cart ${recoveredAbandonedCheckoutId.slice(0, 8)}.`,
      metadata: {
        orderId: order.id,
        customerEmail: parsed.data.customerEmail,
        totalCents,
        amountDueCents,
      },
    });
  }

  const orderStatusUrl = getCustomerOrderStatusHref({
    storeSlug: storefront.store.slug,
    orderId: order.id,
    token: customerAccessToken,
  });

  await queueNotification({
    db,
    storeId: storefront.store.id,
    type: "order_confirmation",
    recipientEmail: parsed.data.customerEmail,
    recipientName: parsed.data.customerName,
    subject: `${storefront.store.name} order ${order.id.slice(0, 8)} received`,
    preview: `Thanks for your order. Total ${(totalCents / 100).toFixed(2)} ${storefront.store.currency}.`,
    resourceType: "order",
    resourceId: order.id,
    metadata: {
      orderId: order.id,
      orderStatusUrl,
      paymentMethod: parsed.data.paymentMethod,
      totalCents,
      amountDueCents,
      giftCardCents,
      currency: storefront.store.currency,
    },
  });

  revalidatePath(`/stores/${storefront.store.slug}`);
  revalidatePath(`/stores/${storefront.store.slug}/checkout`);
  revalidatePath(`/dashboard/stores/${storefront.store.id}`);

  return {
    status: "success",
    message: `Order ${order.id.slice(0, 8)} received.`,
    data: {
      orderId: order.id,
      orderStatusUrl,
    },
  };
}

export async function queueAbandonedCheckoutRecoveryAction(
  storeId: string,
  checkoutId: string,
) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_orders",
  );
  const checkout = workspace.abandonedCheckouts.find(
    (item) => item.id === checkoutId,
  );

  if (!checkout) {
    throw new Error("Abandoned checkout not found.");
  }

  if (!canQueueAbandonedCheckoutRecovery(checkout)) {
    throw new Error("This checkout is not eligible for recovery.");
  }

  const db = getSupabaseAdmin();
  const now = new Date().toISOString();
  const nextRecoveryEmailCount = checkout.recoveryEmailCount + 1;
  const { data: updatedCheckout, error } = await db
    .from("abandoned_checkouts")
    .update({
      recovery_email_sent_at: now,
      recovery_email_count: nextRecoveryEmailCount,
    })
    .eq("id", checkoutId)
    .eq("store_id", storeId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!updatedCheckout) {
    throw new Error("Checkout changed while recovery was being queued.");
  }

  const recoveryUrl = getAbandonedCheckoutRecoveryHref({
    storeSlug: workspace.store.slug,
    recoveryToken: checkout.recoveryToken,
  });

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "abandoned_checkout_recovery_queued",
    resourceType: "abandoned_checkout",
    resourceId: checkoutId,
    summary: `${user.email} queued checkout recovery for ${checkout.customerEmail}.`,
    metadata: {
      recoveryEmailCount: nextRecoveryEmailCount,
      subtotalCents: checkout.subtotalCents,
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "checkout_recovery",
    recipientEmail: checkout.customerEmail,
    recipientName: checkout.customerName,
    subject: `${workspace.store.name} cart is saved`,
    preview: "Your cart is ready when you are.",
    resourceType: "abandoned_checkout",
    resourceId: checkoutId,
    metadata: {
      recoveryUrl,
      recoveryEmailCount: nextRecoveryEmailCount,
      subtotalCents: checkout.subtotalCents,
      currency: checkout.currency,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}/checkout`);
}

export async function dismissAbandonedCheckoutAction(
  storeId: string,
  checkoutId: string,
) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_orders",
  );
  const checkout = workspace.abandonedCheckouts.find(
    (item) => item.id === checkoutId,
  );

  if (!checkout) {
    throw new Error("Abandoned checkout not found.");
  }

  if (checkout.status !== "open") {
    throw new Error("Only open abandoned checkouts can be dismissed.");
  }

  const db = getSupabaseAdmin();
  const { data: updatedCheckout, error } = await db
    .from("abandoned_checkouts")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
    })
    .eq("id", checkoutId)
    .eq("store_id", storeId)
    .eq("status", "open")
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!updatedCheckout) {
    throw new Error("Checkout changed while it was being dismissed.");
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "abandoned_checkout_dismissed",
    resourceType: "abandoned_checkout",
    resourceId: checkoutId,
    summary: `${user.email} dismissed abandoned checkout ${checkoutId.slice(0, 8)}.`,
    metadata: {
      customerEmail: checkout.customerEmail,
      subtotalCents: checkout.subtotalCents,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}/checkout`);
}

export async function publishStoreAction(storeId: string): Promise<ActionState> {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const launchReadiness = getStoreLaunchReadiness(workspace);

  if (!launchReadiness.canPublish) {
    return formError("Resolve launch blockers before publishing this store.", {
      status: launchReadiness.blockingChecks.map((check) => check.detail),
    });
  }

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ status: "active" })
    .eq("id", storeId);

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "store_published",
    resourceType: "store",
    resourceId: storeId,
    summary: `${user.email} published ${workspace.store.name}.`,
    metadata: {
      previousStatus: workspace.store.status,
      status: "active",
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: `${workspace.store.name} published.`,
  };
}

export async function pauseStoreAction(storeId: string): Promise<ActionState> {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ status: "paused" })
    .eq("id", storeId);

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "store_paused",
    resourceType: "store",
    resourceId: storeId,
    summary: `${user.email} paused ${workspace.store.name}.`,
    metadata: {
      previousStatus: workspace.store.status,
      status: "paused",
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: `${workspace.store.name} paused.`,
  };
}

export async function upsertCustomerProfileAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = customerProfileSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    phone: formData.get("phone") || undefined,
    note: formData.get("note") || undefined,
    tags: formData.get("tags") || undefined,
    acceptsMarketing: formData.get("acceptsMarketing") === "on",
    taxExempt: formData.get("taxExempt") === "on",
  });

  if (!parsed.success) {
    return formError("Check the customer profile.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(user.id, storeId, "manage_orders");
  const db = getSupabaseAdmin();
  const email = parsed.data.email.toLowerCase();
  const tags = parseCustomerTags(parsed.data.tags || "");
  const { data: profile, error } = await db
    .from("customer_profiles")
    .upsert(
      {
        store_id: storeId,
        email,
        name: optionalText(parsed.data.name),
        phone: optionalText(parsed.data.phone),
        note: optionalText(parsed.data.note),
        tags,
        accepts_marketing: parsed.data.acceptsMarketing,
        tax_exempt: parsed.data.taxExempt,
      },
      { onConflict: "store_id,email" },
    )
    .select("id")
    .single();

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "customer_profile_updated",
    resourceType: "customer_profile",
    resourceId: profile.id,
    summary: `${user.email} updated customer profile ${email}.`,
    metadata: {
      customerEmail: email,
      tagCount: tags.length,
      acceptsMarketing: parsed.data.acceptsMarketing,
      taxExempt: parsed.data.taxExempt,
      hasNote: Boolean(optionalText(parsed.data.note)),
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/customers`);
  revalidatePath(
    `/dashboard/stores/${storeId}/customers/${encodeURIComponent(email)}`,
  );
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: `Customer profile ${email} saved.`,
  };
}

export async function updateOrderStatusAction(
  storeId: string,
  orderId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = orderStatusSchema.safeParse({
    status: formData.get("status"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid order status.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_orders",
  );
  const db = getSupabaseAdmin();
  const { data: orderData, error: orderError } = await db
    .from("orders")
    .select(
      "status, payment_status, payment_method, payment_provider, payment_reference, total_cents, amount_due_cents, gift_card_cents, currency, paid_at, fulfilled_at, cancelled_at, inventory_restocked_at",
    )
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (orderError) {
    throw orderError;
  }

  if (!orderData) {
    throw new Error("Order not found.");
  }

  const order = orderData as OrderLifecycleRow;

  if (
    !canTransitionOrderStatus(
      order.status,
      parsed.data.status,
      order.payment_status,
    )
  ) {
    throw new Error(
      `Orders cannot move from ${order.status} to ${parsed.data.status}.`,
    );
  }

  if (
    parsed.data.status === "cancelled" &&
    !canCancelOrderPaymentStatus(order.payment_status)
  ) {
    throw new Error(
      "Refund or void captured payment before cancelling this order.",
    );
  }

  const now = new Date().toISOString();
  const updatePayload: {
    status: z.infer<typeof orderStatusSchema>["status"];
    payment_status?: PaymentStatus;
    payment_provider?: string;
    amount_due_cents?: number;
    paid_at?: string;
    fulfilled_at?: string;
    cancelled_at?: string;
    inventory_restocked_at?: string;
  } = {
    status: parsed.data.status,
  };
  let restockedItems: RestockedInventory[] = [];
  let paymentTransactionId: string | null = null;

  if (parsed.data.status === "paid" && !order.paid_at) {
    updatePayload.paid_at = now;
  }

  const shouldCapturePayment =
    (parsed.data.status === "paid" || parsed.data.status === "fulfilled") &&
    (!order.payment_status ||
      order.payment_status === "pending" ||
      order.payment_status === "authorized");

  if (shouldCapturePayment) {
    updatePayload.payment_status = "paid";
    updatePayload.payment_provider =
      order.payment_provider ||
      getManualPaymentProvider(order.payment_method || "manual_invoice");
    updatePayload.amount_due_cents = 0;
  }

  const captureAmountCents = getPaymentCaptureAmountCents({
    amountDueCents: order.amount_due_cents,
    giftCardCents: order.gift_card_cents,
    totalCents: order.total_cents,
  });

  if (updatePayload.payment_status === "paid" && captureAmountCents > 0) {
    const transaction = await insertPaymentTransaction({
      db,
      storeId,
      orderId,
      clerkUserId: user.id,
      type: "capture",
      paymentMethod: order.payment_method || "manual_invoice",
      paymentProvider:
        updatePayload.payment_provider ||
        order.payment_provider ||
        getManualPaymentProvider(order.payment_method || "manual_invoice"),
      providerReference: order.payment_reference,
      amountCents: captureAmountCents,
      currency: order.currency,
      processedAt: updatePayload.paid_at || now,
      metadata: {
        source: "order_status_update",
        nextStatus: parsed.data.status,
        totalCents: order.total_cents,
        giftCardCents: order.gift_card_cents || 0,
      },
    });

    if (transaction.error) {
      throw transaction.error;
    }

    paymentTransactionId = transaction.id;
  }

  if (parsed.data.status === "fulfilled") {
    if (!order.paid_at) {
      updatePayload.paid_at = now;
    }

    if (!order.fulfilled_at) {
      updatePayload.fulfilled_at = now;
    }
  }

  if (parsed.data.status === "cancelled") {
    if (!order.cancelled_at) {
      updatePayload.cancelled_at = now;
    }

    if (
      !order.payment_status ||
      order.payment_status === "pending" ||
      order.payment_status === "authorized"
    ) {
      updatePayload.payment_status = "voided";
      updatePayload.amount_due_cents = 0;
    }

    if (!order.inventory_restocked_at) {
      restockedItems = await restockReservedInventory(db, storeId, orderId);
      updatePayload.inventory_restocked_at = now;
    }

    if (order.payment_status === "authorized" && captureAmountCents > 0) {
      const transaction = await insertPaymentTransaction({
        db,
        storeId,
        orderId,
        clerkUserId: user.id,
        type: "void",
        paymentMethod: order.payment_method || "manual_invoice",
        paymentProvider:
          order.payment_provider ||
          getManualPaymentProvider(order.payment_method || "manual_invoice"),
        providerReference: order.payment_reference,
        amountCents: captureAmountCents,
        currency: order.currency,
        processedAt: now,
        metadata: {
          source: "order_status_update",
          nextStatus: parsed.data.status,
          totalCents: order.total_cents,
          giftCardCents: order.gift_card_cents || 0,
        },
      });

      if (transaction.error) {
        await rollbackRestockedInventory(db, storeId, restockedItems);
        throw transaction.error;
      }

      paymentTransactionId = transaction.id;
    }
  }

  const { data: updatedOrder, error } = await db
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("store_id", storeId)
    .eq("status", order.status)
    .select("id")
    .maybeSingle();

  if (error) {
    await deletePaymentTransaction(db, paymentTransactionId);
    await rollbackRestockedInventory(db, storeId, restockedItems);
    throw error;
  }

  if (!updatedOrder) {
    await deletePaymentTransaction(db, paymentTransactionId);
    await rollbackRestockedInventory(db, storeId, restockedItems);
    throw new Error("Order changed while status was being updated.");
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "order_status_updated",
    resourceType: "order",
    resourceId: orderId,
    summary: `${user.email} changed order ${orderId.slice(0, 8)} to ${parsed.data.status}.`,
    metadata: {
      previousStatus: order.status,
      status: parsed.data.status,
      paymentStatus: updatePayload.payment_status || order.payment_status,
      restockedInventory: restockedItems.length > 0,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
  revalidatePath(`/stores/${workspace.store.slug}/checkout`);
}

export async function confirmOrderPaymentAction(
  storeId: string,
  orderId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = paymentConfirmationSchema.safeParse({
    paymentMethod: formData.get("paymentMethod"),
    paymentProvider: formData.get("paymentProvider") || undefined,
    paymentReference: formData.get("paymentReference") || undefined,
  });

  if (!parsed.success) {
    throw new Error("Check the payment details.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_orders",
  );
  const db = getSupabaseAdmin();
  const { data: orderData, error: orderError } = await db
    .from("orders")
    .select(
      "customer_email, customer_name, status, payment_status, total_cents, amount_due_cents, gift_card_cents, currency, paid_at, cancelled_at",
    )
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (orderError) {
    throw orderError;
  }

  if (!orderData) {
    throw new Error("Order not found.");
  }

  const order = orderData as Pick<
    OrderLifecycleRow,
    | "customer_email"
    | "customer_name"
    | "status"
    | "payment_status"
    | "total_cents"
    | "amount_due_cents"
    | "gift_card_cents"
    | "currency"
    | "paid_at"
    | "cancelled_at"
  >;

  if (order.status === "cancelled" || order.cancelled_at) {
    throw new Error("Cancelled orders cannot be marked paid.");
  }

  if (
    order.payment_status &&
    order.payment_status !== "pending" &&
    order.payment_status !== "authorized"
  ) {
    throw new Error("This order already has a captured payment.");
  }

  const now = new Date().toISOString();
  const nextStatus = order.status === "pending" ? "paid" : order.status;
  const paymentProvider =
    optionalText(parsed.data.paymentProvider) ||
    getManualPaymentProvider(parsed.data.paymentMethod);
  const paymentReference = optionalText(parsed.data.paymentReference);
  const captureAmountCents = getPaymentCaptureAmountCents({
    amountDueCents: order.amount_due_cents,
    giftCardCents: order.gift_card_cents,
    totalCents: order.total_cents,
  });
  let transactionId: string | null = null;

  if (captureAmountCents > 0) {
    const transaction = await insertPaymentTransaction({
      db,
      storeId,
      orderId,
      clerkUserId: user.id,
      type: "capture",
      paymentMethod: parsed.data.paymentMethod,
      paymentProvider,
      providerReference: paymentReference,
      amountCents: captureAmountCents,
      currency: order.currency,
      processedAt: order.paid_at || now,
      metadata: {
        source: "payment_confirmation",
        nextStatus,
        totalCents: order.total_cents,
        giftCardCents: order.gift_card_cents || 0,
      },
    });

    if (transaction.error) {
      throw transaction.error;
    }

    transactionId = transaction.id;
  }

  const { data: updatedOrder, error } = await db
    .from("orders")
    .update({
      status: nextStatus,
      payment_status: "paid",
      payment_method: parsed.data.paymentMethod,
      payment_provider: paymentProvider,
      payment_reference: paymentReference,
      amount_due_cents: 0,
      paid_at: order.paid_at || now,
    })
    .eq("id", orderId)
    .eq("store_id", storeId)
    .eq("status", order.status)
    .select("id")
    .maybeSingle();

  if (error) {
    await deletePaymentTransaction(db, transactionId);
    throw error;
  }

  if (!updatedOrder) {
    await deletePaymentTransaction(db, transactionId);
    throw new Error("Order changed while payment was being confirmed.");
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "payment_confirmed",
    resourceType: "order",
    resourceId: orderId,
    summary: `${user.email} confirmed payment for order ${orderId.slice(0, 8)}.`,
    metadata: {
      paymentMethod: parsed.data.paymentMethod,
      paymentProvider,
      transactionId,
      nextStatus,
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "payment_receipt",
    recipientEmail: order.customer_email,
    recipientName: order.customer_name,
    subject: `${workspace.store.name} payment received`,
    preview: `Payment was confirmed for order ${orderId.slice(0, 8)}.`,
    resourceType: "order",
    resourceId: orderId,
    metadata: {
      orderId,
      paymentMethod: parsed.data.paymentMethod,
      paymentProvider,
      transactionId,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
}

export async function updateOrderFulfillmentAction(
  storeId: string,
  orderId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = orderFulfillmentSchema.safeParse({
    status: formData.get("status"),
    trackingCarrier: formData.get("trackingCarrier") || undefined,
    trackingNumber: formData.get("trackingNumber") || undefined,
    trackingUrl: formData.get("trackingUrl") || undefined,
    fulfillmentNote: formData.get("fulfillmentNote") || undefined,
    markFulfilled: formData.get("markFulfilled") === "on",
  });

  if (!parsed.success) {
    throw new Error("Check the fulfillment details.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_orders",
  );
  const db = getSupabaseAdmin();
  const { data: orderData, error: orderError } = await db
    .from("orders")
    .select(
      "customer_email, customer_name, status, payment_status, payment_method, payment_provider, payment_reference, total_cents, amount_due_cents, gift_card_cents, currency, paid_at, fulfilled_at, cancelled_at",
    )
    .eq("id", orderId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (orderError) {
    throw orderError;
  }

  if (!orderData) {
    throw new Error("Order not found.");
  }

  const order = orderData as Pick<
    OrderLifecycleRow,
    | "customer_email"
    | "customer_name"
    | "status"
    | "payment_status"
    | "payment_method"
    | "payment_provider"
    | "payment_reference"
    | "total_cents"
    | "amount_due_cents"
    | "gift_card_cents"
    | "currency"
    | "paid_at"
    | "fulfilled_at"
    | "cancelled_at"
  >;

  if (order.status === "cancelled" || order.cancelled_at) {
    throw new Error("Cancelled orders cannot be fulfilled.");
  }

  if (parsed.data.status === "cancelled") {
    throw new Error("New shipments cannot be created as cancelled.");
  }

  const now = new Date().toISOString();
  const updatePayload: {
    tracking_carrier: string | null;
    tracking_number: string | null;
    tracking_url: string | null;
    fulfillment_note: string | null;
    status?: z.infer<typeof orderStatusSchema>["status"];
    payment_status?: PaymentStatus;
    payment_provider?: string;
    amount_due_cents?: number;
    paid_at?: string;
    fulfilled_at?: string;
  } = {
    tracking_carrier: optionalText(parsed.data.trackingCarrier),
    tracking_number: optionalText(parsed.data.trackingNumber),
    tracking_url: optionalText(parsed.data.trackingUrl),
    fulfillment_note: optionalText(parsed.data.fulfillmentNote),
  };
  let paymentTransactionId: string | null = null;
  let fulfillmentId: string | null = null;
  const hasShipmentDetails = Boolean(
    optionalText(parsed.data.trackingCarrier) ||
      optionalText(parsed.data.trackingNumber) ||
      optionalText(parsed.data.trackingUrl) ||
      optionalText(parsed.data.fulfillmentNote),
  );

  if (parsed.data.markFulfilled) {
    if (order.status !== "paid" && order.status !== "fulfilled") {
      throw new Error("Only paid orders can be marked fulfilled from this panel.");
    }

    updatePayload.status = "fulfilled";

    const shouldCapturePayment =
      !order.payment_status ||
      order.payment_status === "pending" ||
      order.payment_status === "authorized";

    if (shouldCapturePayment) {
      updatePayload.payment_status = "paid";
      updatePayload.payment_provider =
        order.payment_provider ||
        getManualPaymentProvider(order.payment_method || "manual_invoice");
      updatePayload.amount_due_cents = 0;
    }

    if (!order.paid_at) {
      updatePayload.paid_at = now;
    }

    if (!order.fulfilled_at) {
      updatePayload.fulfilled_at = now;
    }

    const captureAmountCents = getPaymentCaptureAmountCents({
      amountDueCents: order.amount_due_cents,
      giftCardCents: order.gift_card_cents,
      totalCents: order.total_cents,
    });

    if (shouldCapturePayment && captureAmountCents > 0) {
      const transaction = await insertPaymentTransaction({
        db,
        storeId,
        orderId,
        clerkUserId: user.id,
        type: "capture",
        paymentMethod: order.payment_method || "manual_invoice",
        paymentProvider:
          updatePayload.payment_provider ||
          order.payment_provider ||
          getManualPaymentProvider(order.payment_method || "manual_invoice"),
        providerReference: order.payment_reference,
        amountCents: captureAmountCents,
        currency: order.currency,
        processedAt: updatePayload.paid_at || now,
        metadata: {
          source: "fulfillment_update",
          markFulfilled: true,
          totalCents: order.total_cents,
          giftCardCents: order.gift_card_cents || 0,
        },
      });

      if (transaction.error) {
        throw transaction.error;
      }

      paymentTransactionId = transaction.id;
    }
  }

  if (!hasShipmentDetails && !parsed.data.markFulfilled) {
    throw new Error("Add tracking details or mark the order fulfilled.");
  }

  const fulfillmentStatus = parsed.data.status;
  const shippedAt =
    parsed.data.markFulfilled ||
    fulfillmentStatus === "in_transit" ||
    fulfillmentStatus === "delivered"
      ? now
      : null;
  const deliveredAt = fulfillmentStatus === "delivered" ? now : null;
  const { data: fulfillment, error: fulfillmentError } = await db
    .from("order_fulfillments")
    .insert({
      store_id: storeId,
      order_id: orderId,
      clerk_user_id: user.id,
      status: fulfillmentStatus,
      tracking_carrier: updatePayload.tracking_carrier,
      tracking_number: updatePayload.tracking_number,
      tracking_url: updatePayload.tracking_url,
      note: updatePayload.fulfillment_note,
      shipped_at: shippedAt,
      delivered_at: deliveredAt,
      cancelled_at: null,
    })
    .select("id")
    .single();

  if (fulfillmentError) {
    await deletePaymentTransaction(db, paymentTransactionId);
    throw fulfillmentError;
  }

  fulfillmentId = fulfillment.id;

  const { data: updatedOrder, error } = await db
    .from("orders")
    .update(updatePayload)
    .eq("id", orderId)
    .eq("store_id", storeId)
    .eq("status", order.status)
    .select("id")
    .maybeSingle();

  if (error) {
    await deletePaymentTransaction(db, paymentTransactionId);
    await db.from("order_fulfillments").delete().eq("id", fulfillmentId);
    throw error;
  }

  if (!updatedOrder) {
    await deletePaymentTransaction(db, paymentTransactionId);
    await db.from("order_fulfillments").delete().eq("id", fulfillmentId);
    throw new Error("Order changed while fulfillment was being updated.");
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "fulfillment_updated",
    resourceType: "order",
    resourceId: orderId,
    summary: `${user.email} updated fulfillment for order ${orderId.slice(0, 8)}.`,
    metadata: {
      fulfillmentId,
      previousStatus: order.status,
      status: updatePayload.status || order.status,
      fulfillmentStatus,
      markFulfilled: parsed.data.markFulfilled,
      hasTrackingNumber: Boolean(optionalText(parsed.data.trackingNumber)),
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "fulfillment_update",
    recipientEmail: order.customer_email,
    recipientName: order.customer_name,
    subject: `${workspace.store.name} fulfillment update`,
    preview: parsed.data.markFulfilled
      ? `Order ${orderId.slice(0, 8)} has been marked fulfilled.`
      : `Tracking details were updated for order ${orderId.slice(0, 8)}.`,
    resourceType: "order",
    resourceId: orderId,
    metadata: {
      orderId,
      fulfillmentId,
      fulfillmentStatus,
      markFulfilled: parsed.data.markFulfilled,
      trackingCarrier: optionalText(parsed.data.trackingCarrier),
      hasTrackingNumber: Boolean(optionalText(parsed.data.trackingNumber)),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
}

export async function updateOrderFulfillmentStatusAction(
  storeId: string,
  orderId: string,
  fulfillmentId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = orderFulfillmentStatusSchema.safeParse({
    status: formData.get("status"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid fulfillment status.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_orders",
  );
  const order = workspace.orders.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Order not found.");
  }

  if (order.status === "cancelled" || order.cancelledAt) {
    throw new Error("Cancelled orders cannot be fulfilled.");
  }

  const db = getSupabaseAdmin();
  const { data: fulfillmentData, error: fulfillmentError } = await db
    .from("order_fulfillments")
    .select(
      "id, store_id, order_id, status, tracking_carrier, tracking_number, tracking_url, note, shipped_at, delivered_at, cancelled_at",
    )
    .eq("id", fulfillmentId)
    .eq("store_id", storeId)
    .eq("order_id", orderId)
    .maybeSingle();

  if (fulfillmentError) {
    throw fulfillmentError;
  }

  if (!fulfillmentData) {
    throw new Error("Fulfillment not found.");
  }

  const fulfillment = fulfillmentData as OrderFulfillmentActionRow;

  if (fulfillment.status === parsed.data.status) {
    return;
  }

  if (
    !canTransitionFulfillmentStatus(fulfillment.status, parsed.data.status)
  ) {
    throw new Error("This fulfillment cannot move to that status.");
  }

  const now = new Date().toISOString();
  const updatePayload: {
    status: OrderFulfillmentStatus;
    shipped_at?: string | null;
    delivered_at?: string | null;
    cancelled_at?: string | null;
  } = {
    status: parsed.data.status,
  };

  if (
    parsed.data.status === "in_transit" ||
    parsed.data.status === "delivered"
  ) {
    updatePayload.shipped_at = fulfillment.shipped_at || now;
  }

  if (parsed.data.status === "delivered") {
    updatePayload.delivered_at = fulfillment.delivered_at || now;
  }

  if (parsed.data.status === "cancelled") {
    updatePayload.cancelled_at = fulfillment.cancelled_at || now;
  }

  const { error } = await db
    .from("order_fulfillments")
    .update(updatePayload)
    .eq("id", fulfillmentId)
    .eq("store_id", storeId)
    .eq("order_id", orderId)
    .eq("status", fulfillment.status);

  if (error) {
    throw error;
  }

  const activeFulfillments = order.fulfillments
    .filter((item) => item.status !== "cancelled" && item.id !== fulfillmentId)
    .sort(
      (a, b) =>
        new Date(b.shippedAt || b.createdAt).getTime() -
        new Date(a.shippedAt || a.createdAt).getTime(),
    );
  const latestExistingFulfillment = order.fulfillments
    .filter((item) => item.status !== "cancelled")
    .sort(
      (a, b) =>
        new Date(b.shippedAt || b.createdAt).getTime() -
        new Date(a.shippedAt || a.createdAt).getTime(),
    )[0];
  const isLatestFulfillment = latestExistingFulfillment?.id === fulfillmentId;

  if (isLatestFulfillment && parsed.data.status !== "cancelled") {
    await db
      .from("orders")
      .update({
        tracking_carrier: fulfillment.tracking_carrier,
        tracking_number: fulfillment.tracking_number,
        tracking_url: fulfillment.tracking_url,
        fulfillment_note: fulfillment.note,
      })
      .eq("id", orderId)
      .eq("store_id", storeId);
  } else if (isLatestFulfillment && parsed.data.status === "cancelled") {
    const nextFulfillment = activeFulfillments[0];

    await db
      .from("orders")
      .update({
        tracking_carrier: nextFulfillment?.trackingCarrier || null,
        tracking_number: nextFulfillment?.trackingNumber || null,
        tracking_url: nextFulfillment?.trackingUrl || null,
        fulfillment_note: nextFulfillment?.note || null,
      })
      .eq("id", orderId)
      .eq("store_id", storeId);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "fulfillment_updated",
    resourceType: "order_fulfillment",
    resourceId: fulfillmentId,
    summary: `${user.email} changed fulfillment ${fulfillmentId.slice(0, 8)} to ${parsed.data.status}.`,
    metadata: {
      orderId,
      previousStatus: fulfillment.status,
      status: parsed.data.status,
      hasTrackingNumber: Boolean(fulfillment.tracking_number),
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "fulfillment_update",
    recipientEmail: order.customerEmail,
    recipientName: order.customerName,
    subject: `${workspace.store.name} shipment update`,
    preview: `Shipment ${fulfillmentId.slice(0, 8)} is ${parsed.data.status.replaceAll("_", " ")}.`,
    resourceType: "order_fulfillment",
    resourceId: fulfillmentId,
    metadata: {
      orderId,
      fulfillmentId,
      status: parsed.data.status,
      trackingCarrier: fulfillment.tracking_carrier,
      hasTrackingNumber: Boolean(fulfillment.tracking_number),
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
}

export async function createReturnRequestAction(
  storeSlug: string,
  orderId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = returnRequestSchema.safeParse({
    token: formData.get("token"),
    reason: formData.get("reason"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    return formError("Check the return request.", parsed.error.flatten().fieldErrors);
  }

  const rateLimitError = await consumePublicServerActionRateLimit(
    `return-request:${storeSlug}:${orderId}`,
    publicCustomerActionRateLimit,
  );

  if (rateLimitError) {
    return rateLimitError;
  }

  const receipt = await getPublicOrderReceipt({
    slug: storeSlug,
    orderId,
    token: parsed.data.token,
  });

  if (!receipt) {
    return formError("This order link is no longer valid.");
  }

  const eligibility = getCustomerReturnRequestEligibility(receipt.order);

  if (!eligibility.eligible) {
    return formError(eligibility.message);
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "success",
      message: "Return request received. Demo mode will not persist it.",
    };
  }

  const db = getSupabaseAdmin();
  const { data: request, error } = await db
    .from("order_return_requests")
    .insert({
      store_id: receipt.store.id,
      order_id: receipt.order.id,
      customer_email: receipt.order.customerEmail,
      status: "requested",
      reason: parsed.data.reason,
      note: parsed.data.note,
    })
    .select("id")
    .single();

  if (error) {
    if (isUniqueConstraintError(error)) {
      return formError("A return request is already open for this order.");
    }

    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId: receipt.store.id,
    clerkUserId: null,
    action: "return_request_created",
    resourceType: "order_return_request",
    resourceId: request.id,
    summary: `Customer requested a return for order ${receipt.order.id.slice(0, 8)}.`,
    metadata: {
      orderId: receipt.order.id,
      reason: parsed.data.reason,
    },
  });

  await queueNotification({
    db,
    storeId: receipt.store.id,
    type: "return_request_created",
    recipientEmail: receipt.order.customerEmail,
    recipientName: receipt.order.customerName,
    subject: `${receipt.store.name} return request received`,
    preview: `Return request received for order ${receipt.order.id.slice(0, 8)}.`,
    resourceType: "order_return_request",
    resourceId: request.id,
    metadata: {
      orderId: receipt.order.id,
      reason: parsed.data.reason,
    },
  });

  revalidatePath(`/stores/${receipt.store.slug}/orders/${receipt.order.id}`);
  revalidatePath(`/dashboard/stores/${receipt.store.id}`);
  revalidatePath(`/dashboard/stores/${receipt.store.id}/orders/${receipt.order.id}`);

  return {
    status: "success",
    message: "Return request received.",
  };
}

export async function updateReturnRequestStatusAction(
  storeId: string,
  orderId: string,
  returnRequestId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = returnRequestStatusSchema.safeParse({
    status: formData.get("status"),
    merchantNote: formData.get("merchantNote") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the return request status.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_refunds",
  );
  const order = workspace.orders.find((item) => item.id === orderId);
  const returnRequest = order?.returnRequests.find(
    (request) => request.id === returnRequestId,
  );

  if (!order || !returnRequest) {
    return formError("Return request not found.");
  }

  if (
    !canTransitionReturnRequestStatus(returnRequest.status, parsed.data.status)
  ) {
    return formError("This return request cannot move to that status.");
  }

  const now = new Date().toISOString();
  const resolvedAt =
    parsed.data.status === "rejected" || parsed.data.status === "resolved"
      ? returnRequest.resolvedAt || now
      : null;
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("order_return_requests")
    .update({
      status: parsed.data.status,
      merchant_note: optionalText(parsed.data.merchantNote),
      resolved_at: resolvedAt,
    })
    .eq("id", returnRequestId)
    .eq("store_id", storeId)
    .eq("order_id", orderId);

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "return_request_updated",
    resourceType: "order_return_request",
    resourceId: returnRequestId,
    summary: `${user.email} changed return request ${returnRequestId.slice(0, 8)} to ${parsed.data.status}.`,
    metadata: {
      orderId,
      previousStatus: returnRequest.status,
      status: parsed.data.status,
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "return_request_updated",
    recipientEmail: order.customerEmail,
    recipientName: order.customerName,
    subject: `${workspace.store.name} return request update`,
    preview: `Your return request for order ${orderId.slice(0, 8)} is ${parsed.data.status}.`,
    resourceType: "order_return_request",
    resourceId: returnRequestId,
    metadata: {
      orderId,
      status: parsed.data.status,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${workspace.store.slug}/orders/${orderId}`);

  return {
    status: "success",
    message: `Return request marked ${parsed.data.status}.`,
  };
}

export async function createProductReviewAction(
  storeSlug: string,
  orderId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = productReviewSchema.safeParse({
    token: formData.get("token"),
    orderItemId: formData.get("orderItemId"),
    productId: formData.get("productId"),
    rating: formData.get("rating"),
    title: formData.get("title") || undefined,
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return formError("Check the review details.", parsed.error.flatten().fieldErrors);
  }

  const rateLimitError = await consumePublicServerActionRateLimit(
    `product-review:${storeSlug}:${orderId}:${parsed.data.orderItemId}`,
    publicCustomerActionRateLimit,
  );

  if (rateLimitError) {
    return rateLimitError;
  }

  const receipt = await getPublicOrderReceipt({
    slug: storeSlug,
    orderId,
    token: parsed.data.token,
  });

  if (!receipt) {
    return formError("This order link is no longer valid.");
  }

  const item = receipt.order.items?.find(
    (orderItem) =>
      orderItem.id === parsed.data.orderItemId &&
      orderItem.productId === parsed.data.productId,
  );

  if (!item?.productId) {
    return formError("This order item cannot be reviewed.");
  }

  const canReview = canCustomerReviewOrderItem({
    orderStatus: receipt.order.status,
    paymentStatus: receipt.order.paymentStatus,
    productId: item.productId,
    orderItemId: item.id,
    existingReviews: receipt.productReviews,
    orderId: receipt.order.id,
  });

  if (!canReview) {
    return formError("This item is not eligible for a new review right now.");
  }

  if (!isSupabaseConfigured()) {
    return {
      status: "success",
      message: "Review submitted. Demo mode will not persist it.",
    };
  }

  const db = getSupabaseAdmin();
  const { data: review, error } = await db
    .from("product_reviews")
    .insert({
      store_id: receipt.store.id,
      product_id: item.productId,
      order_id: receipt.order.id,
      order_item_id: item.id,
      customer_email: receipt.order.customerEmail,
      customer_name: receipt.order.customerName,
      rating: parsed.data.rating,
      title: optionalText(parsed.data.title),
      body: parsed.data.body,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) {
    return formError(
      error.message.includes("duplicate")
        ? "This item already has a submitted review."
        : error.message,
    );
  }

  await recordAuditEvent({
    db,
    storeId: receipt.store.id,
    clerkUserId: null,
    action: "product_review_created",
    resourceType: "product_review",
    resourceId: review.id,
    summary: `Customer submitted a product review for ${item.productName}.`,
    metadata: {
      orderId: receipt.order.id,
      productId: item.productId,
      rating: parsed.data.rating,
      status: "pending",
    },
  });

  await queueNotification({
    db,
    storeId: receipt.store.id,
    type: "product_review_received",
    recipientEmail: receipt.order.customerEmail,
    recipientName: receipt.order.customerName,
    subject: `${receipt.store.name} review received`,
    preview: `Your review for ${item.productName} is pending moderation.`,
    resourceType: "product_review",
    resourceId: review.id,
    metadata: {
      orderId: receipt.order.id,
      productId: item.productId,
      rating: parsed.data.rating,
    },
  });

  revalidatePath(`/stores/${receipt.store.slug}/orders/${receipt.order.id}`);
  revalidatePath(`/dashboard/stores/${receipt.store.id}`);
  revalidatePath(`/dashboard/stores/${receipt.store.id}/orders/${receipt.order.id}`);

  return {
    status: "success",
    message: "Review submitted for moderation.",
  };
}

export async function updateProductReviewStatusAction(
  storeId: string,
  reviewId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = productReviewStatusSchema.safeParse({
    status: formData.get("status"),
    merchantReply: formData.get("merchantReply") || undefined,
  });

  if (!parsed.success) {
    return formError("Check the review status.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_catalog",
  );
  const review = workspace.productReviews.find((item) => item.id === reviewId);

  if (!review) {
    return formError("Product review not found.");
  }

  const now = new Date().toISOString();
  const status = parsed.data.status as ProductReviewStatus;
  const updatePayload = {
    status,
    merchant_reply: optionalText(parsed.data.merchantReply),
    approved_at: status === "approved" ? review.approvedAt || now : null,
    rejected_at: status === "rejected" ? review.rejectedAt || now : null,
  };
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("product_reviews")
    .update(updatePayload)
    .eq("id", reviewId)
    .eq("store_id", storeId);

  if (error) {
    return formError(error.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "product_review_moderated",
    resourceType: "product_review",
    resourceId: reviewId,
    summary: `${user.email} changed product review ${reviewId.slice(0, 8)} to ${status}.`,
    metadata: {
      productId: review.productId,
      orderId: review.orderId,
      previousStatus: review.status,
      status,
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "product_review_updated",
    recipientEmail: review.customerEmail,
    recipientName: review.customerName,
    subject: `${workspace.store.name} review update`,
    preview: `Your product review is ${status}.`,
    resourceType: "product_review",
    resourceId: reviewId,
    metadata: {
      productId: review.productId,
      orderId: review.orderId,
      status,
    },
  });

  const product = workspace.products.find((item) => item.id === review.productId);

  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${review.orderId}`);
  revalidatePath(`/stores/${workspace.store.slug}/orders/${review.orderId}`);

  if (product) {
    revalidatePath(`/stores/${workspace.store.slug}/products/${product.slug}`);
  }

  return {
    status: "success",
    message: `Review marked ${status}.`,
  };
}

export async function createRefundAction(
  storeId: string,
  orderId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = refundSchema.safeParse({
    amount: formData.get("amount"),
    reason: formData.get("reason"),
    note: formData.get("note") || undefined,
    restockInventory: formData.get("restockInventory") === "on",
  });

  if (!parsed.success) {
    return formError("Check the refund details.", parsed.error.flatten().fieldErrors);
  }

  const amountCents = toPriceCents(parsed.data.amount);

  if (amountCents === null || amountCents <= 0) {
    return formError("Add a valid refund amount.", {
      amount: ["Refund amount must be greater than zero."],
    });
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_refunds",
  );
  const order = workspace.orders.find((item) => item.id === orderId);

  if (!order) {
    return formError("Order not found.");
  }

  if (!isRevenueOrderStatus(order.status)) {
    return formError("Only paid or fulfilled orders can be refunded.");
  }

  if (amountCents > order.refundableCents) {
    return formError("Refund exceeds the remaining refundable amount.", {
      amount: [
        `Refundable balance is ${(order.refundableCents / 100).toFixed(2)}.`,
      ],
    });
  }

  if (parsed.data.restockInventory && order.inventoryRestockedAt) {
    return formError("Inventory was already restocked for this order.");
  }

  const giftCardRefundCents = calculateGiftCardRefundAmount({
    alreadyRefundedGiftCardCents: order.refunds.reduce(
      (sum, refund) => sum + refund.giftCardCents,
      0,
    ),
    giftCardTenderCents: order.giftCardCents,
    refundAmountCents: amountCents,
  });
  const paymentRefundCents = amountCents - giftCardRefundCents;
  const db = getSupabaseAdmin();
  let recreditedGiftCard: RecreditedGiftCard | null = null;
  let restockedItems: RestockedInventory[] = [];

  if (giftCardRefundCents > 0) {
    const { data: redemption, error: redemptionError } = await db
      .from("gift_card_redemptions")
      .select("gift_card_id")
      .eq("store_id", storeId)
      .eq("order_id", orderId)
      .maybeSingle();

    if (redemptionError || !redemption) {
      return formError(
        redemptionError?.message ||
          "Gift card redemption is missing for this order.",
      );
    }

    const redemptionRow = redemption as { gift_card_id: string };
    const { data: giftCard, error: giftCardError } = await db
      .from("gift_cards")
      .select("id, balance_cents")
      .eq("id", redemptionRow.gift_card_id)
      .eq("store_id", storeId)
      .maybeSingle();

    if (giftCardError || !giftCard) {
      return formError(
        giftCardError?.message || "Gift card could not be re-credited.",
      );
    }

    const giftCardRow = giftCard as { id: string; balance_cents: number };
    const balanceAfterCents = giftCardRow.balance_cents + giftCardRefundCents;
    const { data: updatedGiftCard, error: recreditError } = await db
      .from("gift_cards")
      .update({ balance_cents: balanceAfterCents })
      .eq("id", giftCardRow.id)
      .eq("store_id", storeId)
      .eq("balance_cents", giftCardRow.balance_cents)
      .select("id")
      .maybeSingle();

    if (recreditError || !updatedGiftCard) {
      return formError(
        recreditError?.message ||
          "Gift card balance changed while refund was being saved.",
      );
    }

    recreditedGiftCard = {
      id: giftCardRow.id,
      balanceBeforeCents: giftCardRow.balance_cents,
      balanceAfterCents,
      amountCents: giftCardRefundCents,
    };
  }

  if (parsed.data.restockInventory) {
    try {
      restockedItems = await restockReservedInventory(db, storeId, orderId);
    } catch (error) {
      await rollbackGiftCardRecredit(db, recreditedGiftCard);

      return formError(
        error instanceof Error
          ? error.message
          : "Could not restock inventory for this refund.",
      );
    }
  }

  const restockedAt = new Date().toISOString();
  let inventoryMarkedRestocked = false;

  if (parsed.data.restockInventory) {
    const { data: updatedOrder, error: restockMarkError } = await db
      .from("orders")
      .update({ inventory_restocked_at: restockedAt })
      .eq("id", orderId)
      .eq("store_id", storeId)
      .is("inventory_restocked_at", null)
      .select("id")
      .maybeSingle();

    if (restockMarkError || !updatedOrder) {
      await rollbackRestockedInventory(db, storeId, restockedItems);
      await rollbackGiftCardRecredit(db, recreditedGiftCard);

      return formError(
        restockMarkError?.message ||
          "Order inventory changed while this refund was being saved.",
      );
    }

    inventoryMarkedRestocked = true;
  }

  const { data: refund, error } = await db
    .from("order_refunds")
    .insert({
      store_id: storeId,
      order_id: orderId,
      clerk_user_id: user.id,
      amount_cents: amountCents,
      gift_card_cents: giftCardRefundCents,
      payment_cents: paymentRefundCents,
      reason: parsed.data.reason,
      note: optionalText(parsed.data.note),
      restocked_inventory: parsed.data.restockInventory,
    })
    .select("id")
    .single();

  if (error) {
    await rollbackGiftCardRecredit(db, recreditedGiftCard);

    if (parsed.data.restockInventory) {
      await rollbackRestockedInventory(db, storeId, restockedItems);

      if (inventoryMarkedRestocked) {
        await db
          .from("orders")
          .update({ inventory_restocked_at: null })
          .eq("id", orderId)
          .eq("store_id", storeId)
          .eq("inventory_restocked_at", restockedAt);
      }
    }

    if (isRefundLimitError(error)) {
      return formError("Refund exceeds the remaining refundable amount.", {
        amount: ["Refund exceeds the remaining refundable amount."],
      });
    }

    return formError(error.message);
  }

  const refundTransaction =
    paymentRefundCents > 0
      ? await insertPaymentTransaction({
          db,
          storeId,
          orderId,
          clerkUserId: user.id,
          type: "refund",
          paymentMethod: order.paymentMethod,
          paymentProvider: order.paymentProvider,
          providerReference: refund.id,
          amountCents: paymentRefundCents,
          currency: order.currency,
          processedAt: new Date().toISOString(),
          metadata: {
            source: "refund",
            orderRefundId: refund.id,
            reason: parsed.data.reason,
            restockInventory: parsed.data.restockInventory,
            giftCardRefundCents,
          },
        })
      : { id: null, error: null };

  if (refundTransaction.error) {
    await db.from("order_refunds").delete().eq("id", refund.id).eq("store_id", storeId);
    await rollbackGiftCardRecredit(db, recreditedGiftCard);

    if (parsed.data.restockInventory) {
      await rollbackRestockedInventory(db, storeId, restockedItems);

      if (inventoryMarkedRestocked) {
        await db
          .from("orders")
          .update({ inventory_restocked_at: null })
          .eq("id", orderId)
          .eq("store_id", storeId)
          .eq("inventory_restocked_at", restockedAt);
      }
    }

    return formError(refundTransaction.error.message);
  }

  const nextRefundedCents = order.refundedCents + amountCents;
  const nextPaymentStatus: PaymentStatus =
    nextRefundedCents >= order.totalCents ? "refunded" : "partially_refunded";
  const { error: paymentStatusError } = await db
    .from("orders")
    .update({ payment_status: nextPaymentStatus })
    .eq("id", orderId)
    .eq("store_id", storeId);

  if (paymentStatusError) {
    await deletePaymentTransaction(db, refundTransaction.id);
    await db.from("order_refunds").delete().eq("id", refund.id).eq("store_id", storeId);
    await rollbackGiftCardRecredit(db, recreditedGiftCard);

    if (parsed.data.restockInventory) {
      await rollbackRestockedInventory(db, storeId, restockedItems);

      if (inventoryMarkedRestocked) {
        await db
          .from("orders")
          .update({ inventory_restocked_at: null })
          .eq("id", orderId)
          .eq("store_id", storeId)
          .eq("inventory_restocked_at", restockedAt);
      }
    }

    return formError(paymentStatusError.message);
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "refund_created",
    resourceType: "order_refund",
    resourceId: refund.id,
    summary: `${user.email} recorded a refund for order ${orderId.slice(0, 8)}.`,
    metadata: {
      orderId,
      amountCents,
      giftCardRefundCents,
      paymentRefundCents,
      reason: parsed.data.reason,
      restockInventory: parsed.data.restockInventory,
      paymentStatus: nextPaymentStatus,
      transactionId: refundTransaction.id,
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "refund_confirmation",
    recipientEmail: order.customerEmail,
    recipientName: order.customerName,
    subject: `${workspace.store.name} refund recorded`,
    preview: `A refund of ${(amountCents / 100).toFixed(2)} ${order.currency} was recorded for order ${orderId.slice(0, 8)}.`,
    resourceType: "order_refund",
    resourceId: refund.id,
    metadata: {
      orderId,
      amountCents,
      giftCardRefundCents,
      paymentRefundCents,
      reason: parsed.data.reason,
      paymentStatus: nextPaymentStatus,
      transactionId: refundTransaction.id,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/dashboard/stores/${storeId}/customers`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: `Refund recorded for ${(amountCents / 100).toFixed(2)}.`,
  };
}

export async function updateDiscountStatusAction(
  storeId: string,
  discountId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = discountStatusSchema.safeParse({
    status: formData.get("status"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid discount status.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  await assertStorePermission(user.id, storeId, "manage_discounts");
  const db = getSupabaseAdmin();
  const { data: discount, error: discountError } = await db
    .from("discount_codes")
    .select("code, status")
    .eq("id", discountId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (discountError) {
    throw discountError;
  }

  if (!discount) {
    throw new Error("Discount not found.");
  }

  const { error } = await db
    .from("discount_codes")
    .update({ status: parsed.data.status })
    .eq("id", discountId)
    .eq("store_id", storeId);

  if (error) {
    throw error;
  }

  const discountRow = discount as { code: string; status: string };

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "discount_status_updated",
    resourceType: "discount_code",
    resourceId: discountId,
    summary: `${user.email} changed discount ${discountRow.code} to ${parsed.data.status}.`,
    metadata: {
      code: discountRow.code,
      previousStatus: discountRow.status,
      status: parsed.data.status,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
}

export async function updateGiftCardStatusAction(
  storeId: string,
  giftCardId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = giftCardStatusSchema.safeParse({
    status: formData.get("status"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid gift card status.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  await assertStorePermission(user.id, storeId, "manage_discounts");
  const db = getSupabaseAdmin();
  const { data: giftCard, error: giftCardError } = await db
    .from("gift_cards")
    .select("code, status, recipient_email")
    .eq("id", giftCardId)
    .eq("store_id", storeId)
    .maybeSingle();

  if (giftCardError) {
    throw giftCardError;
  }

  if (!giftCard) {
    throw new Error("Gift card not found.");
  }

  const { error } = await db
    .from("gift_cards")
    .update({ status: parsed.data.status })
    .eq("id", giftCardId)
    .eq("store_id", storeId);

  if (error) {
    throw error;
  }

  const giftCardRow = giftCard as {
    code: string;
    recipient_email: string | null;
    status: string;
  };

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "gift_card_status_updated",
    resourceType: "gift_card",
    resourceId: giftCardId,
    summary: `${user.email} changed gift card ${maskGiftCardCode(giftCardRow.code)} to ${parsed.data.status}.`,
    metadata: {
      code: maskGiftCardCode(giftCardRow.code),
      previousStatus: giftCardRow.status,
      status: parsed.data.status,
    },
  });

  if (giftCardRow.recipient_email) {
    await queueNotification({
      db,
      storeId,
      type: "gift_card_status_updated",
      recipientEmail: giftCardRow.recipient_email,
      subject: "Gift card status updated",
      preview: `Your gift card is ${parsed.data.status}.`,
      resourceType: "gift_card",
      resourceId: giftCardId,
      metadata: {
        code: maskGiftCardCode(giftCardRow.code),
        status: parsed.data.status,
      },
    });
  }

  revalidatePath(`/dashboard/stores/${storeId}`);
}

export async function createStoreInvitationAction(
  storeId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();
  const parsed = teamInvitationSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return formError("Check the team invitation.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStorePermission(user.id, storeId, "manage_team");
  const email = parsed.data.email.toLowerCase();

  if (email === user.email.toLowerCase()) {
    return formError("You are already the store owner.", {
      email: ["Invite another team member."],
    });
  }

  await upsertProfileForUser(user);

  const db = getSupabaseAdmin();
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("clerk_user_id")
    .eq("email", email)
    .maybeSingle();

  if (profileError) {
    return formError(profileError.message);
  }

  if (profile) {
    const { data: membership, error: membershipError } = await db
      .from("store_memberships")
      .select("clerk_user_id")
      .eq("store_id", storeId)
      .eq("clerk_user_id", (profile as { clerk_user_id: string }).clerk_user_id)
      .maybeSingle();

    if (membershipError) {
      return formError(membershipError.message);
    }

    if (membership) {
      return formError("This user is already on the store team.", {
        email: ["Choose a different email."],
      });
    }
  }

  const { data: invitation, error: inviteLookupError } = await db
    .from("store_invitations")
    .select("id")
    .eq("store_id", storeId)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (inviteLookupError) {
    return formError(inviteLookupError.message);
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  let invitationId: string;

  if (invitation) {
    invitationId = (invitation as { id: string }).id;
    const { error } = await db
      .from("store_invitations")
      .update({
        role: parsed.data.role,
        invited_by_user_id: user.id,
        expires_at: expiresAt,
      })
      .eq("id", invitationId)
      .eq("store_id", storeId);

    if (error) {
      return formError(error.message);
    }
  } else {
    const { data: createdInvitation, error } = await db
      .from("store_invitations")
      .insert({
        store_id: storeId,
        email,
        role: parsed.data.role,
        invited_by_user_id: user.id,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error) {
      return formError(error.message);
    }

    invitationId = createdInvitation.id;
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "team_invited",
    resourceType: "store_invitation",
    resourceId: invitationId,
    summary: `${user.email} invited ${email} as ${parsed.data.role}.`,
    metadata: {
      email,
      role: parsed.data.role,
      expiresAt,
    },
  });

  await queueNotification({
    db,
    storeId,
    type: "team_invitation",
    recipientEmail: email,
    subject: `Invitation to join ${workspace.store.name}`,
    preview: `${user.email} invited you to join ${workspace.store.name} as ${parsed.data.role}.`,
    resourceType: "store_invitation",
    resourceId: invitationId,
    metadata: {
      invitationId,
      role: parsed.data.role,
      invitedBy: user.email,
      expiresAt,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);

  return {
    status: "success",
    message: `Invitation ready for ${email}.`,
  };
}

export async function revokeStoreInvitationAction(
  storeId: string,
  invitationId: string,
) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  await assertStorePermission(user.id, storeId, "manage_team");

  const db = getSupabaseAdmin();
  const { data: invitation, error: invitationError } = await db
    .from("store_invitations")
    .select("email, role")
    .eq("id", invitationId)
    .eq("store_id", storeId)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (invitationError) {
    throw invitationError;
  }

  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  const { error } = await db
    .from("store_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .eq("store_id", storeId)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (error) {
    throw error;
  }

  const invitationRow = invitation as { email: string; role: string };

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "team_invite_revoked",
    resourceType: "store_invitation",
    resourceId: invitationId,
    summary: `${user.email} revoked the invitation for ${invitationRow.email}.`,
    metadata: {
      email: invitationRow.email,
      role: invitationRow.role,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
}

export async function updateStoreMemberRoleAction(
  storeId: string,
  memberUserId: string,
  formData: FormData,
) {
  const user = await requireAppUser();
  const parsed = teamMemberRoleSchema.safeParse({
    role: formData.get("role"),
  });

  if (!parsed.success) {
    throw new Error("Choose a valid team role.");
  }

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(user.id, storeId, "manage_team");

  if (memberUserId === workspace.store.ownerId) {
    throw new Error("The store owner role cannot be changed.");
  }

  const db = getSupabaseAdmin();
  const { data: member, error: memberError } = await db
    .from("store_memberships")
    .select("clerk_user_id, role")
    .eq("store_id", storeId)
    .eq("clerk_user_id", memberUserId)
    .maybeSingle();

  if (memberError) {
    throw memberError;
  }

  if (!member) {
    throw new Error("Team member not found.");
  }

  if ((member as StoreMemberActionRow).role === "owner") {
    throw new Error("The store owner role cannot be changed.");
  }

  const { error } = await db
    .from("store_memberships")
    .update({ role: parsed.data.role })
    .eq("store_id", storeId)
    .eq("clerk_user_id", memberUserId);

  if (error) {
    throw error;
  }

  const previousRole = (member as StoreMemberActionRow).role;

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "team_member_role_updated",
    resourceType: "store_membership",
    resourceId: memberUserId,
    summary: `${user.email} changed a team member role to ${parsed.data.role}.`,
    metadata: {
      memberUserId,
      previousRole,
      role: parsed.data.role,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
}

export async function removeStoreMemberAction(
  storeId: string,
  memberUserId: string,
) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(user.id, storeId, "manage_team");

  if (memberUserId === workspace.store.ownerId || memberUserId === user.id) {
    throw new Error("The store owner cannot be removed.");
  }

  const db = getSupabaseAdmin();
  const { data: member, error: memberError } = await db
    .from("store_memberships")
    .select("clerk_user_id, role")
    .eq("store_id", storeId)
    .eq("clerk_user_id", memberUserId)
    .maybeSingle();

  if (memberError) {
    throw memberError;
  }

  if (!member) {
    throw new Error("Team member not found.");
  }

  if ((member as StoreMemberActionRow).role === "owner") {
    throw new Error("The store owner cannot be removed.");
  }

  const { error } = await db
    .from("store_memberships")
    .delete()
    .eq("store_id", storeId)
    .eq("clerk_user_id", memberUserId);

  if (error) {
    throw error;
  }

  await recordAuditEvent({
    db,
    storeId,
    clerkUserId: user.id,
    action: "team_member_removed",
    resourceType: "store_membership",
    resourceId: memberUserId,
    summary: `${user.email} removed a team member from the store.`,
    metadata: {
      memberUserId,
      role: (member as StoreMemberActionRow).role,
    },
  });

  revalidatePath(`/dashboard/stores/${storeId}`);
}

export async function acceptStoreInvitationAction(invitationId: string) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  await upsertProfileForUser(user);

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("store_invitations")
    .select("id, store_id, email, role, accepted_at, revoked_at, expires_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error("Invitation not found.");
  }

  const invitation = data as StoreInvitationActionRow;

  if (invitation.accepted_at || invitation.revoked_at) {
    throw new Error("This invitation is no longer active.");
  }

  if (new Date(invitation.expires_at).getTime() < Date.now()) {
    throw new Error("This invitation has expired.");
  }

  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    throw new Error("This invitation belongs to another email address.");
  }

  const { error: membershipError } = await db.from("store_memberships").upsert(
    {
      store_id: invitation.store_id,
      clerk_user_id: user.id,
      role: invitation.role,
    },
    { onConflict: "store_id,clerk_user_id" },
  );

  if (membershipError) {
    throw membershipError;
  }

  const { error: inviteUpdateError } = await db
    .from("store_invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .is("revoked_at", null);

  if (inviteUpdateError) {
    throw inviteUpdateError;
  }

  await recordAuditEvent({
    db,
    storeId: invitation.store_id,
    clerkUserId: user.id,
    action: "team_invite_accepted",
    resourceType: "store_membership",
    resourceId: user.id,
    summary: `${user.email} accepted a team invitation.`,
    metadata: {
      invitationId: invitation.id,
      email: invitation.email,
      role: invitation.role,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${invitation.store_id}`);
  redirect(`/dashboard/stores/${invitation.store_id}`);
}
