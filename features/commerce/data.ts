import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/features/auth/app-user";
import {
  mockAbandonedCheckouts,
  mockCollections,
  mockCustomerProfiles,
  mockDiscounts,
  mockGiftCards,
  mockInventoryAdjustments,
  mockStoreNavigationMenus,
  mockOrderRefunds,
  mockOrders,
  mockProductReviews,
  mockStorePages,
  mockProducts,
  mockShippingZones,
  mockStorePolicies,
  mockStores,
} from "@/features/commerce/mock-data";
import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import { getOrderAmountDueCents } from "@/features/commerce/payments";
import type {
  AbandonedCheckout,
  AbandonedCheckoutLine,
  AbandonedCheckoutStatus,
  DashboardOverview,
  AuditEventAction,
  ProductCollection,
  CollectionStatus,
  CustomerProfile,
  Discount,
  DiscountStatus,
  DiscountType,
  GiftCard,
  GiftCardRedemption,
  GiftCardStatus,
  StoreNavigationMenuLocation,
  Order,
  OrderFulfillment,
  OrderFulfillmentStatus,
  OrderItem,
  OrderPaymentTransaction,
  OrderRefund,
  OrderReturnRequest,
  OrderSource,
  OrderStatus,
  NotificationStatus,
  NotificationType,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionStatus,
  PaymentTransactionType,
  Product,
  ProductReview,
  ProductReviewStatus,
  ProductVariant,
  ProductVariantStatus,
  ProductStatus,
  RefundReason,
  ReturnRequestReason,
  ReturnRequestStatus,
  ShippingZone,
  ShippingZoneStatus,
  StoreAuditEvent,
  StoreInvitation,
  StoreMember,
  StoreMembershipRole,
  StoreNavigationMenu,
  StoreNotification,
  StorePage,
  StorePageStatus,
  StorePolicy,
  StorePolicyStatus,
  StorePolicyType,
  InventoryAdjustment,
  InventoryAdjustmentReason,
  Store,
  StoreStatus,
  StoreWorkspace,
} from "@/features/commerce/types";
import {
  getSupabaseConfig,
  isDemoDataEnabled,
  isSupabaseConfigured,
  isSupabasePublicConfigured,
} from "@/lib/env";
import {
  mapNavigationMenuLocation,
  sanitizeNavigationLinks,
} from "@/features/commerce/navigation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupabasePublic } from "@/lib/supabase/public";
import { isUuid, slugify } from "@/lib/utils";

type StoreRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  theme_color: string;
  seo_title: string | null;
  seo_description: string | null;
  social_image_url: string | null;
  status: StoreStatus;
  shipping_rate_cents: number | null;
  free_shipping_threshold_cents: number | null;
  tax_rate_bps: number | null;
  created_at: string;
};

type ShippingZoneRow = {
  id: string;
  store_id: string;
  name: string;
  countries: string[] | null;
  rate_cents: number | null;
  free_shipping_threshold_cents: number | null;
  status: ShippingZoneStatus;
  created_at: string;
};

type StoreMembershipRow = {
  store_id: string;
  clerk_user_id: string;
  role: StoreMembershipRole;
  created_at: string;
};

type ProfileRow = {
  clerk_user_id: string;
  email: string;
  name: string;
};

type StoreInvitationRow = {
  id: string;
  store_id: string;
  email: string;
  role: Exclude<StoreMembershipRole, "owner">;
  invited_by_user_id: string;
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
};

type StoreAuditEventRow = {
  id: string;
  store_id: string;
  clerk_user_id: string | null;
  action: AuditEventAction;
  resource_type: string;
  resource_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type StoreNotificationRow = {
  id: string;
  store_id: string;
  type: NotificationType;
  status: NotificationStatus;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  preview: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown> | null;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
};

type StorePolicyRow = {
  id: string;
  store_id: string;
  type: StorePolicyType;
  title: string;
  body: string | null;
  status: StorePolicyStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type StorePageRow = {
  id: string;
  store_id: string;
  title: string;
  slug: string;
  body: string | null;
  seo_title: string | null;
  seo_description: string | null;
  status: StorePageStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerProfileRow = {
  id: string;
  store_id: string;
  email: string;
  name: string | null;
  phone: string | null;
  note: string | null;
  tags: string[] | null;
  accepts_marketing: boolean | null;
  tax_exempt: boolean | null;
  created_at: string;
  updated_at: string;
};

type StoreNavigationMenuRow = {
  id: string;
  store_id: string;
  location: StoreNavigationMenuLocation | string;
  links: unknown;
  created_at: string;
  updated_at: string;
};

type ProductRow = {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  price_cents: number;
  currency: string;
  inventory_count: number;
  image_url: string | null;
  image_path: string | null;
  status: ProductStatus;
  created_at: string;
};

type ProductVariantRow = {
  id: string;
  store_id: string;
  product_id: string;
  option_name: string;
  option_value: string;
  sku: string | null;
  price_cents: number;
  currency: string;
  inventory_count: number;
  status: ProductVariantStatus;
  sort_order: number | null;
  created_at: string;
};

type CollectionRow = {
  id: string;
  store_id: string;
  title: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  status: CollectionStatus;
  sort_order: number | null;
  created_at: string;
};

type CollectionProductRow = {
  collection_id: string;
  product_id: string;
  sort_order: number | null;
};

type InventoryAdjustmentRow = {
  id: string;
  store_id: string;
  product_id: string;
  product_variant_id: string | null;
  clerk_user_id: string;
  reason: InventoryAdjustmentReason;
  reference: string | null;
  note: string | null;
  delta: number;
  previous_inventory: number;
  next_inventory: number;
  created_at: string;
};

type OrderRow = {
  id: string;
  store_id: string;
  customer_name: string | null;
  customer_email: string;
  customer_phone: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_region: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  customer_note: string | null;
  status: OrderStatus;
  order_source: OrderSource | null;
  internal_note: string | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  payment_provider: string | null;
  payment_reference: string | null;
  customer_access_token: string | null;
  client_order_key: string | null;
  subtotal_cents: number | null;
  discount_code: string | null;
  discount_cents: number | null;
  gift_card_code: string | null;
  gift_card_cents: number | null;
  shipping_cents: number | null;
  tax_cents: number | null;
  tax_rate_bps: number | null;
  total_cents: number;
  amount_due_cents: number | null;
  currency: string;
  created_at: string;
  paid_at: string | null;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  inventory_restocked_at: string | null;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  fulfillment_note: string | null;
};

type DiscountRow = {
  id: string;
  store_id: string;
  code: string;
  type: DiscountType;
  value: number;
  min_subtotal_cents: number;
  usage_limit: number | null;
  redemption_count: number;
  status: DiscountStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

type GiftCardRow = {
  id: string;
  store_id: string;
  code: string;
  initial_balance_cents: number;
  balance_cents: number;
  currency: string;
  status: GiftCardStatus;
  recipient_email: string | null;
  note: string | null;
  expires_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type GiftCardRedemptionRow = {
  id: string;
  store_id: string;
  gift_card_id: string;
  order_id: string;
  amount_cents: number;
  balance_before_cents: number;
  balance_after_cents: number;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  variant_sku: string | null;
  unit_price_cents: number;
  quantity: number;
  created_at: string;
};

type OrderFulfillmentRow = {
  id: string;
  store_id: string;
  order_id: string;
  clerk_user_id: string | null;
  status: OrderFulfillmentStatus;
  tracking_carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  note: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderRefundRow = {
  id: string;
  store_id: string;
  order_id: string;
  clerk_user_id: string;
  amount_cents: number;
  gift_card_cents: number | null;
  payment_cents: number | null;
  reason: RefundReason;
  note: string | null;
  restocked_inventory: boolean;
  created_at: string;
};

type OrderReturnRequestRow = {
  id: string;
  store_id: string;
  order_id: string;
  customer_email: string;
  status: ReturnRequestStatus;
  reason: ReturnRequestReason;
  note: string | null;
  merchant_note: string | null;
  requested_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderPaymentTransactionRow = {
  id: string;
  store_id: string;
  order_id: string;
  clerk_user_id: string | null;
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  payment_method: PaymentMethod | null;
  payment_provider: string | null;
  provider_reference: string | null;
  amount_cents: number;
  currency: string;
  processed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type AbandonedCheckoutRow = {
  id: string;
  store_id: string;
  customer_email: string;
  customer_name: string | null;
  recovery_token: string;
  status: AbandonedCheckoutStatus;
  cart: unknown;
  subtotal_cents: number | null;
  currency: string | null;
  last_seen_at: string;
  recovery_email_sent_at: string | null;
  recovery_email_count: number | null;
  recovered_order_id: string | null;
  recovered_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProductReviewRow = {
  id: string;
  store_id: string;
  product_id: string;
  order_id: string;
  order_item_id: string | null;
  customer_email: string;
  customer_name: string;
  rating: number;
  title: string | null;
  body: string;
  status: ProductReviewStatus;
  merchant_reply: string | null;
  reviewed_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    slug: row.slug,
    sku: row.sku || undefined,
    category: row.category || undefined,
    description: row.description || "",
    priceCents: row.price_cents,
    currency: row.currency,
    inventoryCount: row.inventory_count,
    imageUrl:
      row.image_url ||
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80",
    imagePath: row.image_path || undefined,
    status: row.status,
    createdAt: row.created_at,
    variants: [],
  };
}

function mapProductVariant(row: ProductVariantRow): ProductVariant {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    optionName: row.option_name,
    optionValue: row.option_value,
    sku: row.sku || undefined,
    priceCents: row.price_cents,
    currency: row.currency,
    inventoryCount: row.inventory_count,
    status: row.status,
    sortOrder: row.sort_order || 0,
    createdAt: row.created_at,
  };
}

function mapCollection(
  row: CollectionRow,
  productIds: string[] = [],
): ProductCollection {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    slug: row.slug,
    description: row.description || "",
    imageUrl: row.image_url || undefined,
    status: row.status,
    sortOrder: row.sort_order || 0,
    productIds,
    productCount: productIds.length,
    createdAt: row.created_at,
  };
}

function mapInventoryAdjustment(
  row: InventoryAdjustmentRow,
): InventoryAdjustment {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    productVariantId: row.product_variant_id || undefined,
    clerkUserId: row.clerk_user_id,
    reason: row.reason,
    reference: row.reference || undefined,
    note: row.note || undefined,
    delta: row.delta,
    previousInventory: row.previous_inventory,
    nextInventory: row.next_inventory,
    createdAt: row.created_at,
  };
}

function mapOrderItem(row: OrderItemRow): OrderItem {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id || undefined,
    productVariantId: row.product_variant_id || undefined,
    productName: row.product_name,
    variantName: row.variant_name || undefined,
    variantSku: row.variant_sku || undefined,
    unitPriceCents: row.unit_price_cents,
    quantity: row.quantity,
    createdAt: row.created_at,
  };
}

function mapOrderRefund(row: OrderRefundRow): OrderRefund {
  return {
    id: row.id,
    storeId: row.store_id,
    orderId: row.order_id,
    clerkUserId: row.clerk_user_id,
    amountCents: row.amount_cents,
    giftCardCents: row.gift_card_cents || 0,
    paymentCents:
      row.payment_cents && row.payment_cents > 0
        ? row.payment_cents
        : Math.max(0, row.amount_cents - (row.gift_card_cents || 0)),
    reason: row.reason,
    note: row.note || undefined,
    restockedInventory: row.restocked_inventory,
    createdAt: row.created_at,
  };
}

function mapOrderFulfillment(row: OrderFulfillmentRow): OrderFulfillment {
  return {
    id: row.id,
    storeId: row.store_id,
    orderId: row.order_id,
    clerkUserId: row.clerk_user_id || undefined,
    status: row.status,
    trackingCarrier: row.tracking_carrier || undefined,
    trackingNumber: row.tracking_number || undefined,
    trackingUrl: row.tracking_url || undefined,
    note: row.note || undefined,
    shippedAt: row.shipped_at || undefined,
    deliveredAt: row.delivered_at || undefined,
    cancelledAt: row.cancelled_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderReturnRequest(row: OrderReturnRequestRow): OrderReturnRequest {
  return {
    id: row.id,
    storeId: row.store_id,
    orderId: row.order_id,
    customerEmail: row.customer_email,
    status: row.status,
    reason: row.reason,
    note: row.note || undefined,
    merchantNote: row.merchant_note || undefined,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderPaymentTransaction(
  row: OrderPaymentTransactionRow,
): OrderPaymentTransaction {
  return {
    id: row.id,
    storeId: row.store_id,
    orderId: row.order_id,
    clerkUserId: row.clerk_user_id || undefined,
    type: row.type,
    status: row.status,
    paymentMethod: row.payment_method || "manual_invoice",
    paymentProvider: row.payment_provider || "manual",
    providerReference: row.provider_reference || undefined,
    amountCents: row.amount_cents,
    currency: row.currency,
    processedAt: row.processed_at || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function mapAbandonedCheckoutLine(line: unknown): AbandonedCheckoutLine | null {
  if (typeof line !== "object" || !line) {
    return null;
  }

  const value = line as Record<string, unknown>;
  const productId = String(value.productId || "");
  const productName = String(value.productName || "");
  const unitPriceCents = Number(value.unitPriceCents);
  const quantity = Number(value.quantity);

  if (
    !productId ||
    !productName ||
    !Number.isInteger(unitPriceCents) ||
    unitPriceCents < 0 ||
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    return null;
  }

  return {
    productId,
    productVariantId:
      typeof value.productVariantId === "string" && value.productVariantId
        ? value.productVariantId
        : undefined,
    productName,
    variantName:
      typeof value.variantName === "string" && value.variantName
        ? value.variantName
        : undefined,
    unitPriceCents,
    quantity,
    imageUrl:
      typeof value.imageUrl === "string" && value.imageUrl
        ? value.imageUrl
        : undefined,
  };
}

function mapAbandonedCheckout(row: AbandonedCheckoutRow): AbandonedCheckout {
  const lines = Array.isArray(row.cart)
    ? row.cart
        .map((line) => mapAbandonedCheckoutLine(line))
        .filter((line): line is AbandonedCheckoutLine => Boolean(line))
    : [];
  const subtotalCents = lines.reduce(
    (sum, line) => sum + line.unitPriceCents * line.quantity,
    0,
  );

  return {
    id: row.id,
    storeId: row.store_id,
    customerEmail: row.customer_email,
    customerName: row.customer_name || undefined,
    recoveryToken: row.recovery_token,
    status: row.status,
    lines,
    subtotalCents:
      row.subtotal_cents && row.subtotal_cents > 0
        ? row.subtotal_cents
        : subtotalCents,
    currency: row.currency || "USD",
    lastSeenAt: row.last_seen_at,
    recoveryEmailSentAt: row.recovery_email_sent_at || undefined,
    recoveryEmailCount: row.recovery_email_count || 0,
    recoveredOrderId: row.recovered_order_id || undefined,
    recoveredAt: row.recovered_at || undefined,
    dismissedAt: row.dismissed_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProductReview(row: ProductReviewRow): ProductReview {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    orderId: row.order_id,
    orderItemId: row.order_item_id || undefined,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    rating: row.rating,
    title: row.title || undefined,
    body: row.body,
    status: row.status,
    merchantReply: row.merchant_reply || undefined,
    reviewedAt: row.reviewed_at,
    approvedAt: row.approved_at || undefined,
    rejectedAt: row.rejected_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrder(
  row: OrderRow,
  items: OrderItem[] = [],
  fulfillments: OrderFulfillment[] = [],
  refunds: OrderRefund[] = [],
  returnRequests: OrderReturnRequest[] = [],
  paymentTransactions: OrderPaymentTransaction[] = [],
): Order {
  const hasShippingAddress = Boolean(
    row.shipping_address_line1 ||
      row.shipping_city ||
      row.shipping_region ||
      row.shipping_postal_code ||
      row.shipping_country,
  );

  const refundedCents = refunds.reduce(
    (sum, refund) => sum + refund.amountCents,
    0,
  );
  const amountDueCents = getOrderAmountDueCents({
    amountDueCents: row.amount_due_cents,
    giftCardCents: row.gift_card_cents,
    paymentStatus: row.payment_status,
    totalCents: row.total_cents,
  });

  return {
    id: row.id,
    storeId: row.store_id,
    customerName: row.customer_name || "Guest customer",
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone || undefined,
    shippingAddress: hasShippingAddress
      ? {
          line1: row.shipping_address_line1 || "",
          line2: row.shipping_address_line2 || undefined,
          city: row.shipping_city || "",
          region: row.shipping_region || "",
          postalCode: row.shipping_postal_code || "",
          country: row.shipping_country || "",
        }
      : undefined,
    customerNote: row.customer_note || undefined,
    status: row.status,
    source: row.order_source || "storefront",
    internalNote: row.internal_note || undefined,
    paymentStatus: row.payment_status || "pending",
    paymentMethod: row.payment_method || "manual_invoice",
    paymentProvider: row.payment_provider || "manual",
    paymentReference: row.payment_reference || undefined,
    customerAccessToken: row.customer_access_token || undefined,
    clientOrderKey: row.client_order_key || undefined,
    subtotalCents:
      row.subtotal_cents && row.subtotal_cents > 0
        ? row.subtotal_cents
        : row.total_cents,
    discountCode: row.discount_code || undefined,
    discountCents: row.discount_cents || 0,
    giftCardCode: row.gift_card_code || undefined,
    giftCardCents: row.gift_card_cents || 0,
    shippingCents: row.shipping_cents || 0,
    taxCents: row.tax_cents || 0,
    taxRateBps: row.tax_rate_bps || 0,
    totalCents: row.total_cents,
    amountDueCents,
    refundedCents,
    refundableCents: Math.max(0, row.total_cents - refundedCents),
    currency: row.currency,
    createdAt: row.created_at,
    paidAt: row.paid_at || undefined,
    fulfilledAt: row.fulfilled_at || undefined,
    cancelledAt: row.cancelled_at || undefined,
    inventoryRestockedAt: row.inventory_restocked_at || undefined,
    trackingCarrier: row.tracking_carrier || undefined,
    trackingNumber: row.tracking_number || undefined,
    trackingUrl: row.tracking_url || undefined,
    fulfillmentNote: row.fulfillment_note || undefined,
    items,
    fulfillments,
    refunds,
    returnRequests,
    paymentTransactions,
  };
}

function mapDiscount(row: DiscountRow): Discount {
  return {
    id: row.id,
    storeId: row.store_id,
    code: row.code,
    type: row.type,
    value: row.value,
    minSubtotalCents: row.min_subtotal_cents,
    usageLimit: row.usage_limit || undefined,
    redemptionCount: row.redemption_count,
    status: row.status,
    startsAt: row.starts_at || undefined,
    endsAt: row.ends_at || undefined,
    createdAt: row.created_at,
  };
}

function mapGiftCardRedemption(row: GiftCardRedemptionRow): GiftCardRedemption {
  return {
    id: row.id,
    storeId: row.store_id,
    giftCardId: row.gift_card_id,
    orderId: row.order_id,
    amountCents: row.amount_cents,
    balanceBeforeCents: row.balance_before_cents,
    balanceAfterCents: row.balance_after_cents,
    createdAt: row.created_at,
  };
}

function mapGiftCard(
  row: GiftCardRow,
  redemptions: GiftCardRedemption[] = [],
): GiftCard {
  return {
    id: row.id,
    storeId: row.store_id,
    code: row.code,
    initialBalanceCents: row.initial_balance_cents,
    balanceCents: row.balance_cents,
    currency: row.currency,
    status: row.status,
    recipientEmail: row.recipient_email || undefined,
    note: row.note || undefined,
    expiresAt: row.expires_at || undefined,
    createdByUserId: row.created_by_user_id || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    redemptions,
  };
}

function mapStore(row: StoreRow, products: Product[], orders: Order[]): Store {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    currency: row.currency,
    themeColor: row.theme_color,
    seoTitle: row.seo_title || undefined,
    seoDescription: row.seo_description || undefined,
    socialImageUrl: row.social_image_url || undefined,
    status: row.status,
    createdAt: row.created_at,
    productCount: products.length,
    orderCount: orders.length,
    revenueCents: orders
      .filter((order) => isRevenueOrderStatus(order.status))
      .reduce(
        (sum, order) => sum + Math.max(0, order.totalCents - order.refundedCents),
        0,
      ),
    inventoryCount: products.reduce(
      (sum, product) => sum + product.inventoryCount,
      0,
    ),
    shippingRateCents: row.shipping_rate_cents || 0,
    freeShippingThresholdCents: row.free_shipping_threshold_cents || 0,
    taxRateBps: row.tax_rate_bps || 0,
  };
}

function mapDemoStoreForUser(store: Store, userId: string): Store {
  return {
    ...store,
    ownerId: userId,
  };
}

function getDemoStoresForUser(userId: string) {
  return mockStores.map((store) => mapDemoStoreForUser(store, userId));
}

function getMockDashboardOverviewForStores(stores: Store[]): DashboardOverview {
  const storeIds = stores.map((store) => store.id);
  const products = mockProducts.filter((product) =>
    storeIds.includes(product.storeId),
  );
  const orders = mockOrders.filter((order) => storeIds.includes(order.storeId));
  const refundsByOrder = refundsByOrderId(
    mockOrderRefunds.filter((refund) => storeIds.includes(refund.storeId)),
  );

  return {
    stores,
    lowStockProducts: products
      .filter((product) => product.inventoryCount <= 12)
      .slice(0, 4),
    totalProducts: products.length,
    totalOrders: orders.length,
    totalRevenueCents: orders
      .filter((order) => isRevenueOrderStatus(order.status))
      .reduce((sum, order) => {
        const refundedCents = (refundsByOrder.get(order.id) || []).reduce(
          (refundSum, refund) => refundSum + refund.amountCents,
          0,
        );

        return sum + Math.max(0, order.totalCents - refundedCents);
      }, 0),
  };
}

function mapShippingZone(row: ShippingZoneRow): ShippingZone {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    countries: row.countries || [],
    rateCents: row.rate_cents || 0,
    freeShippingThresholdCents: row.free_shipping_threshold_cents || 0,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapStoreInvitation(row: StoreInvitationRow): StoreInvitation {
  return {
    id: row.id,
    storeId: row.store_id,
    email: row.email,
    role: row.role,
    invitedByUserId: row.invited_by_user_id,
    acceptedAt: row.accepted_at || undefined,
    revokedAt: row.revoked_at || undefined,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapStoreAuditEvent(row: StoreAuditEventRow): StoreAuditEvent {
  return {
    id: row.id,
    storeId: row.store_id,
    clerkUserId: row.clerk_user_id || undefined,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id || undefined,
    summary: row.summary,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  };
}

function mapStoreNotification(row: StoreNotificationRow): StoreNotification {
  return {
    id: row.id,
    storeId: row.store_id,
    type: row.type,
    status: row.status,
    recipientEmail: row.recipient_email,
    recipientName: row.recipient_name || undefined,
    subject: row.subject,
    preview: row.preview,
    resourceType: row.resource_type,
    resourceId: row.resource_id || undefined,
    metadata: row.metadata || {},
    sentAt: row.sent_at || undefined,
    failedAt: row.failed_at || undefined,
    createdAt: row.created_at,
  };
}

function mapStorePolicy(row: StorePolicyRow): StorePolicy {
  return {
    id: row.id,
    storeId: row.store_id,
    type: row.type,
    title: row.title,
    body: row.body || "",
    status: row.status,
    publishedAt: row.published_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStorePage(row: StorePageRow): StorePage {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    slug: row.slug,
    body: row.body || "",
    seoTitle: row.seo_title || undefined,
    seoDescription: row.seo_description || undefined,
    status: row.status,
    publishedAt: row.published_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCustomerProfile(row: CustomerProfileRow): CustomerProfile {
  return {
    id: row.id,
    storeId: row.store_id,
    email: row.email.trim().toLowerCase(),
    name: row.name || undefined,
    phone: row.phone || undefined,
    note: row.note || undefined,
    tags: row.tags || [],
    acceptsMarketing: Boolean(row.accepts_marketing),
    taxExempt: Boolean(row.tax_exempt),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStoreNavigationMenu(
  row: StoreNavigationMenuRow,
): StoreNavigationMenu {
  return {
    id: row.id,
    storeId: row.store_id,
    location: mapNavigationMenuLocation(row.location),
    links: sanitizeNavigationLinks(row.links),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function byStoreId<T extends { storeId: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();

  for (const item of items) {
    grouped.set(item.storeId, [...(grouped.get(item.storeId) || []), item]);
  }

  return grouped;
}

function byOrderId(items: OrderItem[]) {
  const grouped = new Map<string, OrderItem[]>();

  for (const item of items) {
    grouped.set(item.orderId, [...(grouped.get(item.orderId) || []), item]);
  }

  return grouped;
}

function refundsByOrderId(items: OrderRefund[]) {
  const grouped = new Map<string, OrderRefund[]>();

  for (const item of items) {
    grouped.set(item.orderId, [...(grouped.get(item.orderId) || []), item]);
  }

  return grouped;
}

function fulfillmentsByOrderId(items: OrderFulfillment[]) {
  const grouped = new Map<string, OrderFulfillment[]>();

  for (const item of items) {
    grouped.set(item.orderId, [...(grouped.get(item.orderId) || []), item]);
  }

  return grouped;
}

function returnRequestsByOrderId(items: OrderReturnRequest[]) {
  const grouped = new Map<string, OrderReturnRequest[]>();

  for (const item of items) {
    grouped.set(item.orderId, [...(grouped.get(item.orderId) || []), item]);
  }

  return grouped;
}

function paymentTransactionsByOrderId(items: OrderPaymentTransaction[]) {
  const grouped = new Map<string, OrderPaymentTransaction[]>();

  for (const item of items) {
    grouped.set(item.orderId, [...(grouped.get(item.orderId) || []), item]);
  }

  return grouped;
}

function giftCardRedemptionsByGiftCardId(items: GiftCardRedemption[]) {
  const grouped = new Map<string, GiftCardRedemption[]>();

  for (const item of items) {
    grouped.set(item.giftCardId, [
      ...(grouped.get(item.giftCardId) || []),
      item,
    ]);
  }

  return grouped;
}

function byProductId(items: ProductVariant[]) {
  const grouped = new Map<string, ProductVariant[]>();

  for (const item of items) {
    grouped.set(item.productId, [...(grouped.get(item.productId) || []), item]);
  }

  return grouped;
}

function byCollectionId(items: CollectionProductRow[]) {
  const grouped = new Map<string, CollectionProductRow[]>();

  for (const item of items) {
    grouped.set(item.collection_id, [
      ...(grouped.get(item.collection_id) || []),
      item,
    ]);
  }

  return grouped;
}

function attachProductVariants(
  products: Product[],
  variants: ProductVariant[],
): Product[] {
  const variantsByProduct = byProductId(variants);

  return products.map((product) => {
    const productVariants = (variantsByProduct.get(product.id) || []).sort(
      (a, b) => a.sortOrder - b.sortOrder || a.optionValue.localeCompare(b.optionValue),
    );

    const activeVariants = productVariants.filter(
      (variant) => variant.status === "active",
    );

    if (productVariants.length === 0 || activeVariants.length === 0) {
      return {
        ...product,
        variants: productVariants,
      };
    }

    return {
      ...product,
      priceCents: Math.min(...activeVariants.map((variant) => variant.priceCents)),
      inventoryCount: activeVariants.reduce(
        (sum, variant) => sum + variant.inventoryCount,
        0,
      ),
      variants: productVariants,
    };
  });
}

async function loadProductVariants(
  storeIds: string[],
  activeOnly = false,
  client?: SupabaseClient,
) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  let query = db
    .from("product_variants")
    .select("*")
    .in("store_id", storeIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as ProductVariantRow[]).map(mapProductVariant);
}

async function loadShippingZones(
  storeIds: string[],
  activeOnly = false,
  client?: SupabaseClient,
) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  let query = db
    .from("shipping_zones")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: true });

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as ShippingZoneRow[]).map(mapShippingZone);
}

async function loadProducts(storeIds: string[]) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("products")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const products = ((data || []) as ProductRow[]).map(mapProduct);
  const variants = await loadProductVariants(storeIds);

  return attachProductVariants(products, variants);
}

async function loadCollectionProducts(
  collectionIds: string[],
  client?: SupabaseClient,
) {
  if (collectionIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  const { data, error } = await db
    .from("collection_products")
    .select("collection_id, product_id, sort_order")
    .in("collection_id", collectionIds)
    .order("sort_order", { ascending: true });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return (data || []) as CollectionProductRow[];
}

async function loadCollections(
  storeIds: string[],
  activeOnly = false,
  client?: SupabaseClient,
) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  let query = db
    .from("collections")
    .select("*")
    .in("store_id", storeIds)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (activeOnly) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  const rows = (data || []) as CollectionRow[];
  const collectionProducts = await loadCollectionProducts(
    rows.map((row) => row.id),
    db,
  );
  const productsByCollection = byCollectionId(collectionProducts);

  return rows.map((row) => {
    const productIds = (productsByCollection.get(row.id) || [])
      .sort(
        (a, b) =>
          (a.sort_order || 0) - (b.sort_order || 0) ||
          a.product_id.localeCompare(b.product_id),
      )
      .map((item) => item.product_id);

    return mapCollection(row, productIds);
  });
}

async function loadOrderItems(orderIds: string[]) {
  if (orderIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("order_items")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return ((data || []) as OrderItemRow[]).map(mapOrderItem);
}

async function loadOrderRefunds(orderIds: string[]) {
  if (orderIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("order_refunds")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as OrderRefundRow[]).map(mapOrderRefund);
}

async function loadOrderFulfillments(orderIds: string[]) {
  if (orderIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("order_fulfillments")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as OrderFulfillmentRow[]).map(mapOrderFulfillment);
}

async function loadOrderReturnRequests(orderIds: string[]) {
  if (orderIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("order_return_requests")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as OrderReturnRequestRow[]).map(mapOrderReturnRequest);
}

async function loadOrderPaymentTransactions(orderIds: string[]) {
  if (orderIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("order_payment_transactions")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as OrderPaymentTransactionRow[]).map(
    mapOrderPaymentTransaction,
  );
}

async function loadOrders(storeIds: string[]) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("orders")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data || []) as OrderRow[];
  const orderIds = rows.map((row) => row.id);
  const [
    items,
    fulfillments,
    refunds,
    returnRequests,
    paymentTransactions,
  ] = await Promise.all([
    loadOrderItems(orderIds),
    loadOrderFulfillments(orderIds),
    loadOrderRefunds(orderIds),
    loadOrderReturnRequests(orderIds),
    loadOrderPaymentTransactions(orderIds),
  ]);
  const itemsByOrder = byOrderId(items);
  const fulfillmentsByOrder = fulfillmentsByOrderId(fulfillments);
  const refundsByOrder = refundsByOrderId(refunds);
  const returnRequestsByOrder = returnRequestsByOrderId(returnRequests);
  const paymentTransactionsByOrder =
    paymentTransactionsByOrderId(paymentTransactions);

  return rows.map((row) =>
    mapOrder(
      row,
      itemsByOrder.get(row.id) || [],
      fulfillmentsByOrder.get(row.id) || [],
      refundsByOrder.get(row.id) || [],
      returnRequestsByOrder.get(row.id) || [],
      paymentTransactionsByOrder.get(row.id) || [],
    ),
  );
}

async function loadAbandonedCheckouts(storeIds: string[]) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("abandoned_checkouts")
    .select("*")
    .in("store_id", storeIds)
    .order("last_seen_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as AbandonedCheckoutRow[]).map(mapAbandonedCheckout);
}

async function loadProductReviews(
  storeIds: string[],
  approvedOnly = false,
  client?: SupabaseClient,
) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  let query = db
    .from("product_reviews")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (approvedOnly) {
    query = query.eq("status", "approved");
  }

  const { data, error } = await query;

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as ProductReviewRow[]).map(mapProductReview);
}

async function loadProductReviewsByOrder(orderId: string) {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("product_reviews")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as ProductReviewRow[]).map(mapProductReview);
}

async function loadDiscounts(storeIds: string[]) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("discount_codes")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as DiscountRow[]).map(mapDiscount);
}

async function loadGiftCardRedemptions(giftCardIds: string[]) {
  if (giftCardIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_card_redemptions")
    .select("*")
    .in("gift_card_id", giftCardIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as GiftCardRedemptionRow[]).map(mapGiftCardRedemption);
}

async function loadGiftCards(storeIds: string[]) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("gift_cards")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  const rows = (data || []) as GiftCardRow[];
  const redemptions = await loadGiftCardRedemptions(rows.map((row) => row.id));
  const redemptionsByGiftCard = giftCardRedemptionsByGiftCardId(redemptions);

  return rows.map((row) =>
    mapGiftCard(row, redemptionsByGiftCard.get(row.id) || []),
  );
}

async function loadInventoryAdjustments(storeIds: string[]) {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("inventory_adjustments")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as InventoryAdjustmentRow[]).map(
    mapInventoryAdjustment,
  );
}

async function loadStoreMembers(storeIds: string[]): Promise<StoreMember[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data: membershipRows, error: membershipError } = await db
    .from("store_memberships")
    .select("store_id, clerk_user_id, role, created_at")
    .in("store_id", storeIds)
    .order("created_at", { ascending: true });

  if (membershipError) {
    throw membershipError;
  }

  const memberships = (membershipRows || []) as StoreMembershipRow[];
  const userIds = [...new Set(memberships.map((row) => row.clerk_user_id))];

  if (userIds.length === 0) {
    return [];
  }

  const { data: profileRows, error: profileError } = await db
    .from("profiles")
    .select("clerk_user_id, email, name")
    .in("clerk_user_id", userIds);

  if (profileError) {
    throw profileError;
  }

  const profilesById = new Map(
    ((profileRows || []) as ProfileRow[]).map((profile) => [
      profile.clerk_user_id,
      profile,
    ]),
  );

  return memberships.map((membership) => {
    const profile = profilesById.get(membership.clerk_user_id);

    return {
      storeId: membership.store_id,
      userId: membership.clerk_user_id,
      email: profile?.email || "Unknown email",
      name: profile?.name || "Team member",
      role: membership.role,
      createdAt: membership.created_at,
    };
  });
}

async function loadStoreInvitations(
  storeIds: string[],
): Promise<StoreInvitation[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("store_invitations")
    .select("*")
    .in("store_id", storeIds)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  return ((data || []) as StoreInvitationRow[]).map(mapStoreInvitation);
}

async function loadStoreAuditEvents(
  storeIds: string[],
): Promise<StoreAuditEvent[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("store_audit_events")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw error;
  }

  return ((data || []) as StoreAuditEventRow[]).map(mapStoreAuditEvent);
}

async function loadStoreNotifications(
  storeIds: string[],
): Promise<StoreNotification[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("store_notifications")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw error;
  }

  return ((data || []) as StoreNotificationRow[]).map(mapStoreNotification);
}

async function loadStorePolicies(
  storeIds: string[],
  publishedOnly = false,
  client?: SupabaseClient,
): Promise<StorePolicy[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  let query = db
    .from("store_policies")
    .select("*")
    .in("store_id", storeIds)
    .order("type", { ascending: true });

  if (publishedOnly) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as StorePolicyRow[]).map(mapStorePolicy);
}

async function loadStorePages(
  storeIds: string[],
  publishedOnly = false,
  client?: SupabaseClient,
): Promise<StorePage[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  let query = db
    .from("store_pages")
    .select("*")
    .in("store_id", storeIds)
    .order("created_at", { ascending: true });

  if (publishedOnly) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query;

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as StorePageRow[]).map(mapStorePage);
}

async function loadStoreNavigationMenus(
  storeIds: string[],
  client?: SupabaseClient,
): Promise<StoreNavigationMenu[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = client || getSupabaseAdmin();
  const { data, error } = await db
    .from("store_navigation_menus")
    .select("*")
    .in("store_id", storeIds)
    .order("location", { ascending: true });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as StoreNavigationMenuRow[]).map(
    mapStoreNavigationMenu,
  );
}

async function loadCustomerProfiles(
  storeIds: string[],
): Promise<CustomerProfile[]> {
  if (storeIds.length === 0) {
    return [];
  }

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("customer_profiles")
    .select("*")
    .in("store_id", storeIds)
    .order("updated_at", { ascending: false });

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as CustomerProfileRow[]).map(mapCustomerProfile);
}

function getMockPublicStorefront(slug: string): StoreWorkspace | null {
  const store = mockStores.find((item) => item.slug === slug);

  if (!store || store.status !== "active") {
    return null;
  }

  return {
    store,
    members: [],
    invitations: [],
    auditEvents: [],
    notifications: [],
    policies: mockStorePolicies.filter(
      (policy) => policy.storeId === store.id && policy.status === "published",
    ),
    customPages: mockStorePages.filter(
      (page) => page.storeId === store.id && page.status === "published",
    ),
    navigationMenus: mockStoreNavigationMenus.filter(
      (menu) => menu.storeId === store.id,
    ),
    customerProfiles: [],
    shippingZones: mockShippingZones.filter(
      (zone) => zone.storeId === store.id && zone.status === "active",
    ),
    products: mockProducts.filter(
      (product) => product.storeId === store.id && product.status === "active",
    ),
    collections: mockCollections.filter(
      (collection) => collection.storeId === store.id && collection.status === "active",
    ),
    orders: [],
    abandonedCheckouts: [],
    productReviews: mockProductReviews.filter(
      (review) => review.storeId === store.id && review.status === "approved",
    ),
    giftCards: [],
    discounts: [],
    inventoryAdjustments: [],
  };
}

function getMockStoreWorkspaceForUser(
  userId: string,
  storeId: string,
): StoreWorkspace | null {
  const store = mockStores.find(
    (item) => item.id === storeId || item.slug === storeId,
  );

  if (!store) {
    return null;
  }

  return {
    membershipRole: "owner",
    store: mapDemoStoreForUser(store, userId),
    members: [
      {
        storeId: store.id,
        userId,
        email: "founder@zendora.dev",
        name: "Store owner",
        role: "owner",
        createdAt: store.createdAt,
      },
    ],
    invitations: [],
    auditEvents: [],
    notifications: [],
    policies: mockStorePolicies.filter((policy) => policy.storeId === store.id),
    customPages: mockStorePages.filter((page) => page.storeId === store.id),
    navigationMenus: mockStoreNavigationMenus.filter(
      (menu) => menu.storeId === store.id,
    ),
    customerProfiles: mockCustomerProfiles.filter(
      (profile) => profile.storeId === store.id,
    ),
    shippingZones: mockShippingZones.filter((zone) => zone.storeId === store.id),
    products: mockProducts.filter((product) => product.storeId === store.id),
    collections: mockCollections.filter(
      (collection) => collection.storeId === store.id,
    ),
    orders: mockOrders.filter((order) => order.storeId === store.id),
    abandonedCheckouts: mockAbandonedCheckouts.filter(
      (checkout) => checkout.storeId === store.id,
    ),
    productReviews: mockProductReviews.filter(
      (review) => review.storeId === store.id,
    ),
    giftCards: mockGiftCards.filter((giftCard) => giftCard.storeId === store.id),
    discounts: mockDiscounts.filter((discount) => discount.storeId === store.id),
    inventoryAdjustments: mockInventoryAdjustments.filter(
      (adjustment) => adjustment.storeId === store.id,
    ),
  };
}

function getCatalogErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message || "");
  }

  return "";
}

function isCommerceSchemaUnavailableError(error: unknown) {
  const message = getCatalogErrorMessage(error).toLowerCase();

  return (
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function shouldUseEmptyCatalogFallback(error: unknown) {
  return isCommerceSchemaUnavailableError(error);
}

function shouldUseDemoCatalogFallback(error: unknown) {
  return isDemoDataEnabled() && isCommerceSchemaUnavailableError(error);
}

async function loadPublicStorefrontFromClient(
  db: SupabaseClient,
  slug: string,
): Promise<StoreWorkspace | null> {
  const { data: storeRow, error: storeError } = await db
    .from("stores")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (storeError) {
    throw new Error(storeError.message);
  }

  if (!storeRow) {
    return null;
  }

  const row = storeRow as StoreRow;
  const { data: productRows, error: productError } = await db
    .from("products")
    .select("*")
    .eq("store_id", row.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (productError) {
    if (shouldUseEmptyCatalogFallback(productError)) {
      return {
        store: mapStore(row, [], []),
        members: [],
        invitations: [],
        auditEvents: [],
        notifications: [],
        policies: [],
        customPages: [],
        navigationMenus: [],
        customerProfiles: [],
        shippingZones: [],
        products: [],
        collections: [],
        orders: [],
        abandonedCheckouts: [],
        productReviews: [],
        giftCards: [],
        discounts: [],
        inventoryAdjustments: [],
      };
    }

    throw new Error(productError.message);
  }

  const productRowsMapped = ((productRows || []) as ProductRow[]).map(mapProduct);
  const [
    variants,
    shippingZones,
    policies,
    customPages,
    navigationMenus,
    productReviews,
  ] =
    await Promise.all([
      loadProductVariants([row.id], true, db),
      loadShippingZones([row.id], true, db),
      loadStorePolicies([row.id], true, db),
      loadStorePages([row.id], true, db),
      loadStoreNavigationMenus([row.id], db),
      loadProductReviews([row.id], true, db),
    ]);
  const products = attachProductVariants(productRowsMapped, variants);
  const allCollections = await loadCollections([row.id], true, db);
  const activeProductIds = new Set(products.map((product) => product.id));
  const collections = allCollections
    .map((collection) => {
      const productIds = collection.productIds.filter((id) =>
        activeProductIds.has(id),
      );

      return {
        ...collection,
        productIds,
        productCount: productIds.length,
      };
    })
    .filter((collection) => collection.productCount > 0);

  return {
    store: mapStore(row, products, []),
    members: [],
    invitations: [],
    auditEvents: [],
    notifications: [],
    policies,
    customPages,
    navigationMenus,
    customerProfiles: [],
    shippingZones,
    products,
    collections,
    orders: [],
    abandonedCheckouts: [],
    productReviews,
    giftCards: [],
    discounts: [],
    inventoryAdjustments: [],
  };
}

export async function upsertProfileForUser(user: AppUser) {
  if (!isSupabaseConfigured()) {
    return;
  }

  const db = getSupabaseAdmin();

  const { error } = await db.from("profiles").upsert({
    clerk_user_id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.imageUrl || null,
    deleted_at: null,
  });

  if (error) {
    if (isCommerceSchemaUnavailableError(error)) {
      return;
    }

    throw error;
  }
}

export async function upsertProfileFromWebhook(input: {
  clerkUserId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}) {
  const db = getSupabaseAdmin();

  const { error } = await db.from("profiles").upsert({
    clerk_user_id: input.clerkUserId,
    email: input.email,
    name: input.name,
    avatar_url: input.avatarUrl || null,
    deleted_at: null,
  });

  if (error) {
    throw error;
  }
}

export async function markProfileDeleted(clerkUserId: string) {
  const db = getSupabaseAdmin();

  const { error } = await db
    .from("profiles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("clerk_user_id", clerkUserId);

  if (error) {
    throw error;
  }
}

export async function listStoresForUser(userId: string): Promise<Store[]> {
  if (!isSupabaseConfigured()) {
    if (!isDemoDataEnabled()) {
      return [];
    }

    return getDemoStoresForUser(userId);
  }

  const db = getSupabaseAdmin();

  try {
    const { data: membershipRows, error: membershipError } = await db
      .from("store_memberships")
      .select("store_id")
      .eq("clerk_user_id", userId);

    if (membershipError) {
      throw membershipError;
    }

    const memberStoreIds = (membershipRows || []).map((row) => row.store_id);
    const storeRows = new Map<string, StoreRow>();

    const { data: ownedStores, error: ownedError } = await db
      .from("stores")
      .select("*")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });

    if (ownedError) {
      throw ownedError;
    }

    for (const row of (ownedStores || []) as StoreRow[]) {
      storeRows.set(row.id, row);
    }

    if (memberStoreIds.length > 0) {
      const { data: memberStores, error: memberError } = await db
        .from("stores")
        .select("*")
        .in("id", memberStoreIds);

      if (memberError) {
        throw memberError;
      }

      for (const row of (memberStores || []) as StoreRow[]) {
        storeRows.set(row.id, row);
      }
    }

    const stores = [...storeRows.values()];
    const products = await loadProducts(stores.map((store) => store.id));
    const orders = await loadOrders(stores.map((store) => store.id));
    const productsByStore = byStoreId(products);
    const ordersByStore = byStoreId(orders);

    return stores.map((store) =>
      mapStore(
        store,
        productsByStore.get(store.id) || [],
        ordersByStore.get(store.id) || [],
      ),
    );
  } catch (error) {
    if (isCommerceSchemaUnavailableError(error)) {
      return isDemoDataEnabled() ? getDemoStoresForUser(userId) : [];
    }

    throw error;
  }
}

export async function getDashboardOverview(
  userId: string,
): Promise<DashboardOverview> {
  const stores = await listStoresForUser(userId);

  if (!isSupabaseConfigured()) {
    return getMockDashboardOverviewForStores(stores);
  }

  let products: Product[];
  let orders: Order[];

  try {
    products = await loadProducts(stores.map((store) => store.id));
    orders = await loadOrders(stores.map((store) => store.id));
  } catch (error) {
    if (isCommerceSchemaUnavailableError(error)) {
      if (isDemoDataEnabled()) {
        return getMockDashboardOverviewForStores(stores);
      }

      return {
        stores,
        lowStockProducts: [],
        totalProducts: 0,
        totalOrders: 0,
        totalRevenueCents: 0,
      };
    }

    throw error;
  }

  return {
    stores,
    lowStockProducts: products
      .filter((product) => product.inventoryCount <= 12)
      .slice(0, 4),
    totalProducts: products.length,
    totalOrders: orders.length,
    totalRevenueCents: orders
      .filter((order) => isRevenueOrderStatus(order.status))
      .reduce(
        (sum, order) => sum + Math.max(0, order.totalCents - order.refundedCents),
        0,
      ),
  };
}

export async function getStoreWorkspace(
  userId: string,
  storeId: string,
): Promise<StoreWorkspace | null> {
  if (!isSupabaseConfigured()) {
    return isDemoDataEnabled()
      ? getMockStoreWorkspaceForUser(userId, storeId)
      : null;
  }

  if (!isUuid(storeId)) {
    return isDemoDataEnabled()
      ? getMockStoreWorkspaceForUser(userId, storeId)
      : null;
  }

  const db = getSupabaseAdmin();
  const { data: storeRow, error: storeError } = await db
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) {
    if (isCommerceSchemaUnavailableError(storeError)) {
      return isDemoDataEnabled()
        ? getMockStoreWorkspaceForUser(userId, storeId)
        : null;
    }

    throw storeError;
  }

  if (!storeRow) {
    return null;
  }

  const row = storeRow as StoreRow;
  const { data: membership, error: membershipError } = await db
    .from("store_memberships")
    .select("role")
    .eq("store_id", storeId)
    .eq("clerk_user_id", userId)
    .maybeSingle();

  if (membershipError) {
    if (isCommerceSchemaUnavailableError(membershipError)) {
      return isDemoDataEnabled()
        ? getMockStoreWorkspaceForUser(userId, storeId)
        : null;
    }

    throw membershipError;
  }

  if (row.owner_id !== userId && !membership) {
    return null;
  }

  const membershipRole =
    row.owner_id === userId ? "owner" : (membership as StoreMembershipRow).role;

  let workspaceData: [
    Product[],
    ShippingZone[],
    ProductCollection[],
    Order[],
    AbandonedCheckout[],
    ProductReview[],
    GiftCard[],
    Discount[],
    InventoryAdjustment[],
    StoreMember[],
    StoreInvitation[],
    StoreAuditEvent[],
    StoreNotification[],
    StorePolicy[],
    StorePage[],
    StoreNavigationMenu[],
    CustomerProfile[],
  ];

  try {
    workspaceData = await Promise.all([
      loadProducts([storeId]),
      loadShippingZones([storeId]),
      loadCollections([storeId]),
      loadOrders([storeId]),
      loadAbandonedCheckouts([storeId]),
      loadProductReviews([storeId]),
      loadGiftCards([storeId]),
      loadDiscounts([storeId]),
      loadInventoryAdjustments([storeId]),
      loadStoreMembers([storeId]),
      loadStoreInvitations([storeId]),
      loadStoreAuditEvents([storeId]),
      loadStoreNotifications([storeId]),
      loadStorePolicies([storeId]),
      loadStorePages([storeId]),
      loadStoreNavigationMenus([storeId]),
      loadCustomerProfiles([storeId]),
    ]);
  } catch (error) {
    if (isCommerceSchemaUnavailableError(error)) {
      return isDemoDataEnabled()
        ? getMockStoreWorkspaceForUser(userId, storeId)
        : null;
    }

    throw error;
  }

  const [
    products,
    shippingZones,
    collections,
    orders,
    abandonedCheckouts,
    productReviews,
    giftCards,
    discounts,
    inventoryAdjustments,
    members,
    invitations,
    auditEvents,
    notifications,
    policies,
    customPages,
    navigationMenus,
    customerProfiles,
  ] = workspaceData;

  return {
    membershipRole,
    store: mapStore(row, products, orders),
    members,
    invitations,
    auditEvents,
    notifications,
    policies,
    customPages,
    navigationMenus,
    customerProfiles,
    shippingZones,
    products,
    collections,
    orders,
    abandonedCheckouts,
    productReviews,
    giftCards,
    discounts,
    inventoryAdjustments,
  };
}

export async function getPublicStorefront(
  slug: string,
): Promise<StoreWorkspace | null> {
  const demoStorefront = isDemoDataEnabled()
    ? getMockPublicStorefront(slug)
    : null;

  if (isSupabaseConfigured()) {
    try {
      return await loadPublicStorefrontFromClient(getSupabaseAdmin(), slug);
    } catch (error) {
      if (shouldUseDemoCatalogFallback(error)) {
        return demoStorefront;
      }

      if (isCommerceSchemaUnavailableError(error)) {
        return null;
      }

      throw error;
    }
  }

  if (isSupabasePublicConfigured()) {
    try {
      return await loadPublicStorefrontFromClient(getSupabasePublic(), slug);
    } catch (error) {
      if (shouldUseDemoCatalogFallback(error)) {
        return demoStorefront;
      }

      if (isCommerceSchemaUnavailableError(error)) {
        return null;
      }

      throw error;
    }
  }

  return demoStorefront;
}

export async function getLivePublicStorefront(
  slug: string,
): Promise<StoreWorkspace | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    return await loadPublicStorefrontFromClient(getSupabaseAdmin(), slug);
  } catch (error) {
    if (isCommerceSchemaUnavailableError(error)) {
      return null;
    }

    throw error;
  }
}

export async function getPublicAbandonedCheckout(input: {
  slug: string;
  token?: string;
}): Promise<{
  store: Store;
  checkout: AbandonedCheckout;
  products: Product[];
  shippingZones: ShippingZone[];
  policies: StorePolicy[];
} | null> {
  const token = input.token?.trim();

  if (!token) {
    return null;
  }

  if (!isSupabaseConfigured()) {
    if (!isDemoDataEnabled()) {
      return null;
    }

    const storefront = getMockPublicStorefront(input.slug);

    if (!storefront) {
      return null;
    }

    const checkout = mockAbandonedCheckouts.find(
      (item) =>
        item.storeId === storefront.store.id &&
        item.recoveryToken === token &&
        item.status === "open",
    );

    if (!checkout) {
      return null;
    }

    return {
      store: storefront.store,
      checkout,
      products: storefront.products,
      shippingZones: storefront.shippingZones,
      policies: storefront.policies,
    };
  }

  const db = getSupabaseAdmin();
  let storefront: StoreWorkspace | null;

  try {
    storefront = await loadPublicStorefrontFromClient(db, input.slug);
  } catch (error) {
    if (isCommerceSchemaUnavailableError(error)) {
      return null;
    }

    throw error;
  }

  if (!storefront) {
    return null;
  }

  const { data, error } = await db
    .from("abandoned_checkouts")
    .select("*")
    .eq("store_id", storefront.store.id)
    .eq("recovery_token", token)
    .eq("status", "open")
    .maybeSingle();

  if (error) {
    if (shouldUseEmptyCatalogFallback(error)) {
      return null;
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    store: storefront.store,
    checkout: mapAbandonedCheckout(data as AbandonedCheckoutRow),
    products: storefront.products,
    shippingZones: storefront.shippingZones,
    policies: storefront.policies,
  };
}

export async function getPublicOrderReceipt(input: {
  slug: string;
  orderId: string;
  token?: string;
}): Promise<{
  store: Store;
  order: Order;
  policies: StorePolicy[];
  navigationMenus: StoreNavigationMenu[];
  productReviews: ProductReview[];
} | null> {
  const token = input.token?.trim();

  if (!token) {
    return null;
  }

  if (!isSupabaseConfigured()) {
    if (!isDemoDataEnabled()) {
      return null;
    }

    const store = mockStores.find(
      (item) => item.slug === input.slug && item.status === "active",
    );

    if (!store) {
      return null;
    }

    const order = mockOrders.find(
      (item) =>
        item.storeId === store.id &&
        item.id === input.orderId &&
        item.customerAccessToken === token,
    );

    if (!order) {
      return null;
    }

    return {
      store: mapDemoStoreForUser(store, store.ownerId),
      order,
      policies: mockStorePolicies.filter((policy) => policy.storeId === store.id),
      navigationMenus: mockStoreNavigationMenus.filter(
        (menu) => menu.storeId === store.id,
      ),
      productReviews: mockProductReviews.filter(
        (review) => review.orderId === order.id,
      ),
    };
  }

  if (!isUuid(input.orderId)) {
    return null;
  }

  const db = getSupabaseAdmin();
  const { data: storeRow, error: storeError } = await db
    .from("stores")
    .select("*")
    .eq("slug", input.slug)
    .eq("status", "active")
    .maybeSingle();

  if (storeError) {
    if (isCommerceSchemaUnavailableError(storeError)) {
      return null;
    }

    throw storeError;
  }

  if (!storeRow) {
    return null;
  }

  const store = storeRow as StoreRow;
  const { data: orderRow, error: orderError } = await db
    .from("orders")
    .select("*")
    .eq("id", input.orderId)
    .eq("store_id", store.id)
    .eq("customer_access_token", token)
    .maybeSingle();

  if (orderError) {
    if (isCommerceSchemaUnavailableError(orderError)) {
      return null;
    }

    throw orderError;
  }

  if (!orderRow) {
    return null;
  }

  let receiptData: [
    OrderItem[],
    OrderFulfillment[],
    OrderRefund[],
    OrderReturnRequest[],
    OrderPaymentTransaction[],
    StorePolicy[],
    StoreNavigationMenu[],
    ProductReview[],
  ];

  try {
    receiptData = await Promise.all([
      loadOrderItems([input.orderId]),
      loadOrderFulfillments([input.orderId]),
      loadOrderRefunds([input.orderId]),
      loadOrderReturnRequests([input.orderId]),
      loadOrderPaymentTransactions([input.orderId]),
      loadStorePolicies([store.id]),
      loadStoreNavigationMenus([store.id]),
      loadProductReviewsByOrder(input.orderId),
    ]);
  } catch (error) {
    if (isCommerceSchemaUnavailableError(error)) {
      return null;
    }

    throw error;
  }

  const [
    items,
    fulfillments,
    refunds,
    returnRequests,
    paymentTransactions,
    policies,
    navigationMenus,
    productReviews,
  ] = receiptData;
  const order = mapOrder(
    orderRow as OrderRow,
    items,
    fulfillments,
    refunds,
    returnRequests,
    paymentTransactions,
  );

  return {
    store: mapStore(store, [], [order]),
    order,
    policies,
    navigationMenus,
    productReviews,
  };
}

export async function getAvailableStoreSlug(name: string) {
  const base = slugify(name) || "store";

  if (!getSupabaseConfig()) {
    return base;
  }

  const db = getSupabaseAdmin();
  let candidate = base;
  let suffix = 2;

  while (true) {
    const { data, error } = await db
      .from("stores")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      if (isCommerceSchemaUnavailableError(error)) {
        return candidate;
      }

      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function getAvailableProductSlug(storeId: string, name: string) {
  const base = slugify(name) || "product";

  if (!getSupabaseConfig()) {
    return base;
  }

  const db = getSupabaseAdmin();
  let candidate = base;
  let suffix = 2;

  while (true) {
    const { data, error } = await db
      .from("products")
      .select("id")
      .eq("store_id", storeId)
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function getAvailableCollectionSlug(storeId: string, title: string) {
  const base = slugify(title) || "collection";

  if (!getSupabaseConfig()) {
    return base;
  }

  const db = getSupabaseAdmin();
  let candidate = base;
  let suffix = 2;

  while (true) {
    const { data, error } = await db
      .from("collections")
      .select("id")
      .eq("store_id", storeId)
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

export async function getAvailableStorePageSlug(
  storeId: string,
  title: string,
  ignorePageId?: string,
) {
  const base = slugify(title) || "page";

  if (!getSupabaseConfig()) {
    return base;
  }

  const db = getSupabaseAdmin();
  let candidate = base;
  let suffix = 2;

  while (true) {
    let query = db
      .from("store_pages")
      .select("id")
      .eq("store_id", storeId)
      .eq("slug", candidate);

    if (ignorePageId) {
      query = query.neq("id", ignorePageId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}
