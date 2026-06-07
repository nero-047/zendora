export type StoreStatus = "draft" | "active" | "paused";
export type StoreMembershipRole = "owner" | "admin" | "staff";
export type ShippingZoneStatus = "active" | "paused";
export type ProductStatus = "draft" | "active" | "archived";
export type ProductVariantStatus = "active" | "paused";
export type CollectionStatus = "draft" | "active" | "archived";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "cancelled";
export type OrderSource = "storefront" | "manual";
export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "partially_refunded"
  | "refunded"
  | "voided";
export type PaymentMethod =
  | "manual_invoice"
  | "bank_transfer"
  | "cash_on_delivery"
  | "card"
  | "other";
export type PaymentTransactionType =
  | "authorization"
  | "capture"
  | "refund"
  | "void";
export type PaymentTransactionStatus = "pending" | "succeeded" | "failed";
export type RefundReason =
  | "customer_request"
  | "damaged"
  | "fraud"
  | "other";
export type ReturnRequestStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "resolved";
export type ReturnRequestReason =
  | "changed_mind"
  | "damaged"
  | "wrong_item"
  | "quality"
  | "other";
export type AbandonedCheckoutStatus = "open" | "recovered" | "dismissed";
export type DiscountStatus = "active" | "paused";
export type DiscountType = "percent" | "fixed";
export type StorePolicyType = "refund" | "shipping" | "privacy" | "terms";
export type StorePolicyStatus = "draft" | "published";
export type NotificationStatus = "pending" | "sent" | "failed" | "suppressed";
export type NotificationType =
  | "order_confirmation"
  | "manual_order_invoice"
  | "payment_receipt"
  | "fulfillment_update"
  | "checkout_recovery"
  | "return_request_created"
  | "return_request_updated"
  | "refund_confirmation"
  | "team_invitation";
export type AuditEventAction =
  | "store_created"
  | "store_updated"
  | "store_policy_updated"
  | "store_published"
  | "store_paused"
  | "product_created"
  | "product_updated"
  | "inventory_adjusted"
  | "discount_created"
  | "discount_status_updated"
  | "collection_created"
  | "collection_status_updated"
  | "shipping_zone_created"
  | "shipping_zone_status_updated"
  | "checkout_order_created"
  | "manual_order_created"
  | "abandoned_checkout_recovered"
  | "abandoned_checkout_recovery_queued"
  | "abandoned_checkout_dismissed"
  | "order_status_updated"
  | "payment_confirmed"
  | "fulfillment_updated"
  | "return_request_created"
  | "return_request_updated"
  | "refund_created"
  | "team_invited"
  | "team_invite_revoked"
  | "team_member_role_updated"
  | "team_member_removed"
  | "team_invite_accepted";

export type Store = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  currency: string;
  themeColor: string;
  seoTitle?: string;
  seoDescription?: string;
  socialImageUrl?: string;
  status: StoreStatus;
  createdAt: string;
  productCount: number;
  orderCount: number;
  revenueCents: number;
  inventoryCount: number;
  shippingRateCents: number;
  freeShippingThresholdCents: number;
  taxRateBps: number;
};

export type StoreMember = {
  storeId: string;
  userId: string;
  email: string;
  name: string;
  role: StoreMembershipRole;
  createdAt: string;
};

export type StoreInvitation = {
  id: string;
  storeId: string;
  email: string;
  role: Exclude<StoreMembershipRole, "owner">;
  invitedByUserId: string;
  acceptedAt?: string;
  revokedAt?: string;
  expiresAt: string;
  createdAt: string;
};

export type StoreAuditEvent = {
  id: string;
  storeId: string;
  clerkUserId?: string;
  action: AuditEventAction;
  resourceType: string;
  resourceId?: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type StoreNotification = {
  id: string;
  storeId: string;
  type: NotificationType;
  status: NotificationStatus;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  preview: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  sentAt?: string;
  failedAt?: string;
  createdAt: string;
};

export type StorePolicy = {
  id: string;
  storeId: string;
  type: StorePolicyType;
  title: string;
  body: string;
  status: StorePolicyStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type ShippingZone = {
  id: string;
  storeId: string;
  name: string;
  countries: string[];
  rateCents: number;
  freeShippingThresholdCents: number;
  status: ShippingZoneStatus;
  createdAt: string;
};

export type Product = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  sku?: string;
  category?: string;
  description: string;
  priceCents: number;
  currency: string;
  inventoryCount: number;
  imageUrl: string;
  imagePath?: string;
  status: ProductStatus;
  createdAt: string;
  variants: ProductVariant[];
};

export type ProductVariant = {
  id: string;
  storeId: string;
  productId: string;
  optionName: string;
  optionValue: string;
  sku?: string;
  priceCents: number;
  currency: string;
  inventoryCount: number;
  status: ProductVariantStatus;
  sortOrder: number;
  createdAt: string;
};

export type ProductCollection = {
  id: string;
  storeId: string;
  title: string;
  slug: string;
  description: string;
  imageUrl?: string;
  status: CollectionStatus;
  sortOrder: number;
  productIds: string[];
  productCount: number;
  createdAt: string;
};

export type InventoryAdjustmentReason =
  | "restock"
  | "correction"
  | "damage"
  | "return"
  | "manual_edit";

export type InventoryAdjustment = {
  id: string;
  storeId: string;
  productId: string;
  productVariantId?: string;
  clerkUserId: string;
  reason: InventoryAdjustmentReason;
  reference?: string;
  note?: string;
  delta: number;
  previousInventory: number;
  nextInventory: number;
  createdAt: string;
};

export type Order = {
  id: string;
  storeId: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  shippingAddress?: ShippingAddress;
  customerNote?: string;
  status: OrderStatus;
  source: OrderSource;
  internalNote?: string;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentProvider: string;
  paymentReference?: string;
  customerAccessToken?: string;
  subtotalCents: number;
  discountCode?: string;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  taxRateBps: number;
  totalCents: number;
  refundedCents: number;
  refundableCents: number;
  currency: string;
  createdAt: string;
  paidAt?: string;
  fulfilledAt?: string;
  cancelledAt?: string;
  inventoryRestockedAt?: string;
  trackingCarrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  fulfillmentNote?: string;
  items?: OrderItem[];
  refunds: OrderRefund[];
  returnRequests: OrderReturnRequest[];
  paymentTransactions: OrderPaymentTransaction[];
};

export type ShippingAddress = {
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId?: string;
  productVariantId?: string;
  productName: string;
  variantName?: string;
  variantSku?: string;
  unitPriceCents: number;
  quantity: number;
  createdAt: string;
};

export type OrderRefund = {
  id: string;
  storeId: string;
  orderId: string;
  clerkUserId: string;
  amountCents: number;
  reason: RefundReason;
  note?: string;
  restockedInventory: boolean;
  createdAt: string;
};

export type OrderReturnRequest = {
  id: string;
  storeId: string;
  orderId: string;
  customerEmail: string;
  status: ReturnRequestStatus;
  reason: ReturnRequestReason;
  note?: string;
  merchantNote?: string;
  requestedAt: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type OrderPaymentTransaction = {
  id: string;
  storeId: string;
  orderId: string;
  clerkUserId?: string;
  type: PaymentTransactionType;
  status: PaymentTransactionStatus;
  paymentMethod: PaymentMethod;
  paymentProvider: string;
  providerReference?: string;
  amountCents: number;
  currency: string;
  processedAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AbandonedCheckoutLine = {
  productId: string;
  productVariantId?: string;
  productName: string;
  variantName?: string;
  unitPriceCents: number;
  quantity: number;
  imageUrl?: string;
};

export type AbandonedCheckout = {
  id: string;
  storeId: string;
  customerEmail: string;
  customerName?: string;
  recoveryToken: string;
  status: AbandonedCheckoutStatus;
  lines: AbandonedCheckoutLine[];
  subtotalCents: number;
  currency: string;
  lastSeenAt: string;
  recoveryEmailSentAt?: string;
  recoveryEmailCount: number;
  recoveredOrderId?: string;
  recoveredAt?: string;
  dismissedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Discount = {
  id: string;
  storeId: string;
  code: string;
  type: DiscountType;
  value: number;
  minSubtotalCents: number;
  usageLimit?: number;
  redemptionCount: number;
  status: DiscountStatus;
  startsAt?: string;
  endsAt?: string;
  createdAt: string;
};

export type StoreWorkspace = {
  membershipRole?: StoreMembershipRole;
  store: Store;
  members: StoreMember[];
  invitations: StoreInvitation[];
  auditEvents: StoreAuditEvent[];
  notifications: StoreNotification[];
  policies: StorePolicy[];
  shippingZones: ShippingZone[];
  products: Product[];
  collections: ProductCollection[];
  orders: Order[];
  abandonedCheckouts: AbandonedCheckout[];
  discounts: Discount[];
  inventoryAdjustments: InventoryAdjustment[];
};

export type CustomerSummary = {
  email: string;
  name: string;
  phone?: string;
  orderCount: number;
  paidOrderCount: number;
  totalSpentCents: number;
  currency: string;
  firstOrderAt: string;
  lastOrderAt: string;
  lastOrderStatus: OrderStatus;
  latestShippingAddress?: ShippingAddress;
  orders: Order[];
};

export type CustomerStats = {
  totalCustomers: number;
  repeatCustomers: number;
  paidOrders: number;
  totalSpentCents: number;
  averageOrderValueCents: number;
};

export type DashboardOverview = {
  stores: Store[];
  lowStockProducts: Product[];
  totalProducts: number;
  totalOrders: number;
  totalRevenueCents: number;
};
