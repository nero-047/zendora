"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAppUser } from "@/features/auth/app-user";
import type { ActionState } from "@/features/commerce/action-state";
import type {
  PaymentMethod,
  PaymentStatus,
  Product,
  ProductVariant,
  ShippingZone,
} from "@/features/commerce/types";
import {
  getAvailableCollectionSlug,
  getAvailableProductSlug,
  getAvailableStoreSlug,
  getLivePublicStorefront,
  getStoreWorkspace,
  upsertProfileForUser,
} from "@/features/commerce/data";
import {
  canTransitionOrderStatus,
  isRevenueOrderStatus,
} from "@/features/commerce/order-status";
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

const discountStatusSchema = z.object({
  status: z.enum(["active", "paused"]),
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
  status: z.infer<typeof orderStatusSchema>["status"];
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  payment_provider: string | null;
  payment_reference: string | null;
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

function normalizeShippingCountry(value: string) {
  return value.trim().toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ");
}

function parseShippingCountries(value: string) {
  const countries = value
    .split(/[\n,]+/)
    .map((country) => country.trim())
    .filter(Boolean);

  return [...new Set(countries)];
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

function getMatchingShippingZone(zones: ShippingZone[], country: string) {
  const normalizedCountry = normalizeShippingCountry(country);

  if (!normalizedCountry) {
    return undefined;
  }

  return zones.find(
    (zone) =>
      zone.status === "active" &&
      zone.countries.some(
        (zoneCountry) =>
          normalizeShippingCountry(zoneCountry) === normalizedCountry,
      ),
  );
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

function calculateDiscountCents(
  discount: CheckoutDiscountRow,
  subtotalCents: number,
) {
  if (discount.type === "percent") {
    return Math.min(
      subtotalCents,
      Math.floor((subtotalCents * discount.value) / 100),
    );
  }

  return Math.min(subtotalCents, discount.value);
}

function calculateShippingQuote(input: {
  discountedSubtotalCents: number;
  freeShippingThresholdCents: number;
  shippingCountry: string;
  shippingRateCents: number;
  shippingZones: ShippingZone[];
}) {
  const zone = getMatchingShippingZone(input.shippingZones, input.shippingCountry);
  const freeShippingThresholdCents =
    zone?.freeShippingThresholdCents ?? input.freeShippingThresholdCents;
  const shippingRateCents = zone?.rateCents ?? input.shippingRateCents;

  if (input.discountedSubtotalCents <= 0) {
    return {
      shippingCents: 0,
      zone,
    };
  }

  if (
    freeShippingThresholdCents > 0 &&
    input.discountedSubtotalCents >= freeShippingThresholdCents
  ) {
    return {
      shippingCents: 0,
      zone,
    };
  }

  return {
    shippingCents: shippingRateCents,
    zone,
  };
}

function calculateTaxCents(discountedSubtotalCents: number, taxRateBps: number) {
  if (discountedSubtotalCents <= 0 || taxRateBps <= 0) {
    return 0;
  }

  return Math.round((discountedSubtotalCents * taxRateBps) / 10000);
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

function normalizeCartLines(
  lines: Array<z.infer<typeof checkoutLineSchema>>,
) {
  const quantitiesByLine = new Map<
    string,
    { productId: string; variantId?: string; quantity: number }
  >();

  for (const line of lines) {
    const variantId = optionalText(line.variantId);
    const key = `${line.productId}:${variantId || ""}`;
    const existing = quantitiesByLine.get(key);

    quantitiesByLine.set(key, {
      productId: line.productId,
      variantId: variantId || undefined,
      quantity: (existing?.quantity || 0) + line.quantity,
    });
  }

  return [...quantitiesByLine.values()];
}

async function assertStoreAccess(userId: string, storeId: string) {
  const workspace = await getStoreWorkspace(userId, storeId);

  if (!workspace) {
    throw new Error("You do not have access to this store.");
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

  const workspace = await assertStoreAccess(user.id, storeId);
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
  });

  if (!parsed.success) {
    return formError("Check the store details.", parsed.error.flatten().fieldErrors);
  }

  if (!isSupabaseConfigured()) {
    return demoDisabledState();
  }

  const workspace = await assertStoreAccess(user.id, storeId);
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

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: "Store updated.",
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

  const workspace = await assertStoreAccess(user.id, storeId);
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

  const workspace = await assertStoreAccess(user.id, storeId);
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

  await assertStoreAccess(user.id, storeId);

  const db = getSupabaseAdmin();
  const { error } = await db.from("discount_codes").insert({
    store_id: storeId,
    code,
    type: parsed.data.type,
    value,
    min_subtotal_cents: minSubtotalCents,
    usage_limit: usageLimit,
    status: parsed.data.status,
    starts_at: startsAt,
    ends_at: endsAt,
  });

  if (error) {
    return formError(error.message);
  }

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

  const workspace = await assertStoreAccess(user.id, storeId);
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

  const workspace = await assertStoreAccess(user.id, storeId);
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

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { error } = await db.from("shipping_zones").insert({
    store_id: storeId,
    name: parsed.data.name,
    countries,
    rate_cents: rateCents,
    free_shipping_threshold_cents: freeShippingThresholdCents,
    status: parsed.data.status,
  });

  if (error) {
    return formError(error.message);
  }

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

  const workspace = await assertStoreAccess(user.id, storeId);
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

  const workspace = await assertStoreAccess(user.id, storeId);
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
      payment_provider:
        optionalText(parsed.data.paymentProvider) ||
        getManualPaymentProvider(parsed.data.paymentMethod),
      payment_reference: optionalText(parsed.data.paymentReference),
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

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders`);
  revalidatePath(`/dashboard/stores/${storeId}/customers`);
  revalidatePath(`/stores/${workspace.store.slug}`);

  return {
    status: "success",
    message: `Manual order ${order.id.slice(0, 8)} created.`,
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

  revalidatePath(`/stores/${storefront.store.slug}`);
  revalidatePath(`/stores/${storefront.store.slug}/checkout`);
  revalidatePath(`/dashboard/stores/${storefront.store.id}`);

  return {
    status: "success",
    message: `Order ${order.id.slice(0, 8)} received.`,
  };
}

export async function publishStoreAction(storeId: string) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ status: "active" })
    .eq("id", storeId);

  if (error) {
    throw error;
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
}

export async function pauseStoreAction(storeId: string) {
  const user = await requireAppUser();

  if (!isSupabaseConfigured()) {
    return;
  }

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("stores")
    .update({ status: "paused" })
    .eq("id", storeId);

  if (error) {
    throw error;
  }

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

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { data: orderData, error: orderError } = await db
    .from("orders")
    .select(
      "status, payment_status, payment_method, payment_provider, payment_reference, paid_at, fulfilled_at, cancelled_at, inventory_restocked_at",
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

  if (parsed.data.status === "paid" && !order.paid_at) {
    updatePayload.paid_at = now;
  }

  if (
    (parsed.data.status === "paid" || parsed.data.status === "fulfilled") &&
    order.payment_status !== "paid"
  ) {
    updatePayload.payment_status = "paid";
    updatePayload.payment_provider =
      order.payment_provider ||
      getManualPaymentProvider(order.payment_method || "manual_invoice");
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
    await rollbackRestockedInventory(db, storeId, restockedItems);
    throw error;
  }

  if (!updatedOrder) {
    await rollbackRestockedInventory(db, storeId, restockedItems);
    throw new Error("Order changed while status was being updated.");
  }

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

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { data: orderData, error: orderError } = await db
    .from("orders")
    .select("status, payment_status, paid_at, cancelled_at")
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
    "status" | "payment_status" | "paid_at" | "cancelled_at"
  >;

  if (order.status === "cancelled" || order.cancelled_at) {
    throw new Error("Cancelled orders cannot be marked paid.");
  }

  const now = new Date().toISOString();
  const nextStatus = order.status === "pending" ? "paid" : order.status;
  const { data: updatedOrder, error } = await db
    .from("orders")
    .update({
      status: nextStatus,
      payment_status: "paid",
      payment_method: parsed.data.paymentMethod,
      payment_provider:
        optionalText(parsed.data.paymentProvider) ||
        getManualPaymentProvider(parsed.data.paymentMethod),
      payment_reference: optionalText(parsed.data.paymentReference),
      paid_at: order.paid_at || now,
    })
    .eq("id", orderId)
    .eq("store_id", storeId)
    .eq("status", order.status)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!updatedOrder) {
    throw new Error("Order changed while payment was being confirmed.");
  }

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

  const workspace = await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { data: orderData, error: orderError } = await db
    .from("orders")
    .select(
      "status, payment_status, payment_method, payment_provider, paid_at, fulfilled_at, cancelled_at",
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
    | "status"
    | "payment_status"
    | "payment_method"
    | "payment_provider"
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

  if (parsed.data.markFulfilled) {
    if (order.status !== "paid" && order.status !== "fulfilled") {
      throw new Error("Only paid orders can be marked fulfilled from this panel.");
    }

    updatePayload.status = "fulfilled";
    updatePayload.payment_status = "paid";
    updatePayload.payment_provider =
      order.payment_provider ||
      getManualPaymentProvider(order.payment_method || "manual_invoice");

    if (!order.paid_at) {
      updatePayload.paid_at = now;
    }

    if (!order.fulfilled_at) {
      updatePayload.fulfilled_at = now;
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
    throw error;
  }

  if (!updatedOrder) {
    throw new Error("Order changed while fulfillment was being updated.");
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/orders/${orderId}`);
  revalidatePath(`/stores/${workspace.store.slug}`);
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

  const workspace = await assertStoreAccess(user.id, storeId);
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

  const { error } = await db.from("order_refunds").insert({
    store_id: storeId,
    order_id: orderId,
    clerk_user_id: user.id,
    amount_cents: amountCents,
    reason: parsed.data.reason,
    note: optionalText(parsed.data.note),
    restocked_inventory: parsed.data.restockInventory,
  });

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

  const nextRefundedCents = order.refundedCents + amountCents;
  const nextPaymentStatus: PaymentStatus =
    nextRefundedCents >= order.totalCents ? "refunded" : "partially_refunded";
  const { error: paymentStatusError } = await db
    .from("orders")
    .update({ payment_status: nextPaymentStatus })
    .eq("id", orderId)
    .eq("store_id", storeId);

  if (paymentStatusError) {
    return formError(paymentStatusError.message);
  }

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

  await assertStoreAccess(user.id, storeId);
  const db = getSupabaseAdmin();
  const { error } = await db
    .from("discount_codes")
    .update({ status: parsed.data.status })
    .eq("id", discountId)
    .eq("store_id", storeId);

  if (error) {
    throw error;
  }

  revalidatePath(`/dashboard/stores/${storeId}`);
}
