"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
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
  parseShippingCountries,
} from "@/features/commerce/business-rules";
import type {
  AuditEventAction,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
  Product,
  ProductVariant,
  StoreMembershipRole,
} from "@/features/commerce/types";
import {
  getAvailableCollectionSlug,
  getAvailableProductSlug,
  getAvailableStoreSlug,
  getLivePublicStorefront,
  getPublicOrderReceipt,
  getStoreWorkspace,
  upsertProfileForUser,
} from "@/features/commerce/data";
import {
  canTransitionOrderStatus,
  isRevenueOrderStatus,
} from "@/features/commerce/order-status";
import { storePolicyTypes } from "@/features/commerce/policies";
import {
  canStoreRole,
  getStorePermissionLabel,
  type StorePermission,
} from "@/features/commerce/permissions";
import {
  canCustomerRequestReturn,
  returnRequestReasons,
  returnRequestStatuses,
} from "@/features/commerce/returns";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uploadProductImageObject } from "@/lib/supabase/storage";
import { toPriceCents } from "@/lib/utils";

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
  abandonedCheckoutToken: z
    .string()
    .trim()
    .min(16, "Checkout recovery token is invalid.")
    .max(96, "Checkout recovery token is invalid.")
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

const orderFulfillmentSchema = z.object({
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

const discountStatusSchema = z.object({
  status: z.enum(["active", "paused"]),
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

type OrderLifecycleRow = {
  customer_email: string;
  customer_name: string | null;
  status: z.infer<typeof orderStatusSchema>["status"];
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  payment_provider: string | null;
  payment_reference: string | null;
  total_cents: number;
  currency: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  inventory_restocked_at: string | null;
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
  productInventoryCount: number;
  productVariantId?: string;
  variantInventoryCount?: number;
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

function getCustomerOrderStatusHref(input: {
  storeSlug: string;
  orderId: string;
  token: string;
}) {
  const encodedOrderId = encodeURIComponent(input.orderId);
  const encodedToken = encodeURIComponent(input.token);

  return `/stores/${input.storeSlug}/orders/${encodedOrderId}?token=${encodedToken}`;
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

function formError(message: string, errors?: ActionState["errors"]): ActionState {
  return {
    status: "error",
    message,
    errors,
  };
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
    if (item.productVariantId && item.variantInventoryCount !== undefined) {
      await db
        .from("product_variants")
        .update({ inventory_count: item.variantInventoryCount })
        .eq("id", item.productVariantId);
    }

    await db
      .from("products")
      .update({ inventory_count: item.productInventoryCount })
      .eq("id", item.productId);
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
        await input.db
          .from("product_variants")
          .update({ inventory_count: currentVariantInventory })
          .eq("id", item.variant.id);
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
      productInventoryCount: productInventory,
      productVariantId: item.variant?.id,
      variantInventoryCount: item.variant?.inventoryCount,
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
      shipping_cents: manualShippingCents,
      tax_cents: taxCents,
      tax_rate_bps: workspace.store.taxRateBps,
      total_cents: totalCents,
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
    abandonedCheckoutToken:
      formData.get("abandonedCheckoutToken") || undefined,
    cart: readCartPayload(formData.get("cart")),
  });

  if (!parsed.success) {
    return formError("Check the checkout details.", parsed.error.flatten().fieldErrors);
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

  const db = getSupabaseAdmin();
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

  let discountRedemptionReserved = false;

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
        await db
          .from("product_variants")
          .update({ inventory_count: currentVariantInventory })
          .eq("id", item.variant.id);
      }

      await rollbackReservedInventory(db, reservedInventory);

      return formError(
        error?.message || "Inventory changed while checkout was in progress.",
      );
    }

    reservedInventory.push({
      productId: item.product.id,
      productInventoryCount: productInventory,
      productVariantId: item.variant?.id,
      variantInventoryCount: item.variant?.inventoryCount,
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

    discountRedemptionReserved = true;
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
      status: "pending",
      order_source: "storefront",
      internal_note: null,
      payment_status: "pending",
      payment_method: parsed.data.paymentMethod,
      payment_provider: getManualPaymentProvider(parsed.data.paymentMethod),
      payment_reference: null,
      customer_access_token: customerAccessToken,
      subtotal_cents: subtotalCents,
      discount_code: discount.code,
      discount_cents: discount.cents,
      shipping_cents: shippingCents,
      tax_cents: taxCents,
      tax_rate_bps: storefront.store.taxRateBps,
      total_cents: totalCents,
      currency: storefront.store.currency,
    })
    .select("id")
    .single();

  if (orderError) {
    await rollbackReservedInventory(db, reservedInventory);

    if (discount.row && discountRedemptionReserved) {
      await db
        .from("discount_codes")
        .update({ redemption_count: discount.row.redemption_count })
        .eq("id", discount.row.id);
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

    if (discount.row && discountRedemptionReserved) {
      await db
        .from("discount_codes")
        .update({ redemption_count: discount.row.redemption_count })
        .eq("id", discount.row.id);
    }

    return formError(itemError.message);
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
      paymentMethod: parsed.data.paymentMethod,
      discountCode: discount.code,
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

export async function publishStoreAction(storeId: string) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStorePermission(
    user.id,
    storeId,
    "manage_store_settings",
  );
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ status: "active" })
    .eq("id", storeId);

  if (error) {
    throw error;
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
}

export async function pauseStoreAction(storeId: string) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
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
    throw error;
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
      "status, payment_status, payment_method, payment_provider, payment_reference, total_cents, currency, paid_at, fulfilled_at, cancelled_at, inventory_restocked_at",
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

  if (!canTransitionOrderStatus(order.status, parsed.data.status)) {
    throw new Error(
      `Orders cannot move from ${order.status} to ${parsed.data.status}.`,
    );
  }

  const now = new Date().toISOString();
  const updatePayload: {
    status: z.infer<typeof orderStatusSchema>["status"];
    payment_status?: PaymentStatus;
    payment_provider?: string;
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
  }

  if (updatePayload.payment_status === "paid" && order.total_cents > 0) {
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
      amountCents: order.total_cents,
      currency: order.currency,
      processedAt: updatePayload.paid_at || now,
      metadata: {
        source: "order_status_update",
        nextStatus: parsed.data.status,
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

    if (!order.inventory_restocked_at) {
      restockedItems = await restockReservedInventory(db, storeId, orderId);
      updatePayload.inventory_restocked_at = now;
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
      "customer_email, customer_name, status, payment_status, total_cents, currency, paid_at, cancelled_at",
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
  let transactionId: string | null = null;

  if (order.total_cents > 0) {
    const transaction = await insertPaymentTransaction({
      db,
      storeId,
      orderId,
      clerkUserId: user.id,
      type: "capture",
      paymentMethod: parsed.data.paymentMethod,
      paymentProvider,
      providerReference: paymentReference,
      amountCents: order.total_cents,
      currency: order.currency,
      processedAt: order.paid_at || now,
      metadata: {
        source: "payment_confirmation",
        nextStatus,
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
      "customer_email, customer_name, status, payment_status, payment_method, payment_provider, payment_reference, total_cents, currency, paid_at, fulfilled_at, cancelled_at",
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
    | "currency"
    | "paid_at"
    | "fulfilled_at"
    | "cancelled_at"
  >;

  if (order.status === "cancelled" || order.cancelled_at) {
    throw new Error("Cancelled orders cannot be fulfilled.");
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
    paid_at?: string;
    fulfilled_at?: string;
  } = {
    tracking_carrier: optionalText(parsed.data.trackingCarrier),
    tracking_number: optionalText(parsed.data.trackingNumber),
    tracking_url: optionalText(parsed.data.trackingUrl),
    fulfillment_note: optionalText(parsed.data.fulfillmentNote),
  };
  let paymentTransactionId: string | null = null;

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
    }

    if (!order.paid_at) {
      updatePayload.paid_at = now;
    }

    if (!order.fulfilled_at) {
      updatePayload.fulfilled_at = now;
    }

    if (shouldCapturePayment && order.total_cents > 0) {
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
        amountCents: order.total_cents,
        currency: order.currency,
        processedAt: updatePayload.paid_at || now,
        metadata: {
          source: "fulfillment_update",
          markFulfilled: true,
        },
      });

      if (transaction.error) {
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
    throw error;
  }

  if (!updatedOrder) {
    await deletePaymentTransaction(db, paymentTransactionId);
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
      previousStatus: order.status,
      status: updatePayload.status || order.status,
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

  const receipt = await getPublicOrderReceipt({
    slug: storeSlug,
    orderId,
    token: parsed.data.token,
  });

  if (!receipt) {
    return formError("This order link is no longer valid.");
  }

  if (!canCustomerRequestReturn(receipt.order)) {
    return formError(
      "This order is not eligible for a new return request right now.",
    );
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

  const resolvedAt =
    parsed.data.status === "rejected" || parsed.data.status === "resolved"
      ? new Date().toISOString()
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

  const db = getSupabaseAdmin();
  let restockedItems: RestockedInventory[] = [];

  if (parsed.data.restockInventory) {
    try {
      restockedItems = await restockReservedInventory(db, storeId, orderId);
    } catch (error) {
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
      reason: parsed.data.reason,
      note: optionalText(parsed.data.note),
      restocked_inventory: parsed.data.restockInventory,
    })
    .select("id")
    .single();

  if (error) {
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

    return formError(error.message);
  }

  const refundTransaction = await insertPaymentTransaction({
    db,
    storeId,
    orderId,
    clerkUserId: user.id,
    type: "refund",
    paymentMethod: order.paymentMethod,
    paymentProvider: order.paymentProvider,
    providerReference: refund.id,
    amountCents,
    currency: order.currency,
    processedAt: new Date().toISOString(),
    metadata: {
      source: "refund",
      orderRefundId: refund.id,
      reason: parsed.data.reason,
      restockInventory: parsed.data.restockInventory,
    },
  });

  if (refundTransaction.error) {
    await db.from("order_refunds").delete().eq("id", refund.id).eq("store_id", storeId);

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
