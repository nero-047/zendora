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
export type OrderFulfillmentStatus =
  | "created"
  | "in_transit"
  | "delivered"
  | "cancelled";
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
export type ProductReviewStatus = "pending" | "approved" | "rejected";
export type GiftCardStatus = "active" | "disabled" | "expired";
export type DiscountStatus = "active" | "paused";
export type DiscountType = "percent" | "fixed";
export type StorePolicyType = "refund" | "shipping" | "privacy" | "terms";
export type StorePolicyStatus = "draft" | "published";
export type StorePageStatus = "draft" | "published";
export type StoreNavigationMenuLocation = "header" | "footer";
export type NotificationStatus = "pending" | "sent" | "failed" | "suppressed";
export type NotificationType =
  | "order_confirmation"
  | "manual_order_invoice"
  | "payment_receipt"
  | "fulfillment_update"
  | "checkout_recovery"
  | "customer_message"
  | "product_review_received"
  | "product_review_updated"
  | "gift_card_created"
  | "gift_card_status_updated"
  | "return_request_created"
  | "return_request_updated"
  | "refund_confirmation"
  | "team_invitation";
export type AuditEventAction =
  | "store_created"
  | "store_updated"
  | "customer_profile_updated"
  | "store_policy_updated"
  | "store_page_created"
  | "store_page_updated"
  | "store_navigation_updated"
  | "store_published"
  | "store_paused"
  | "product_created"
  | "product_updated"
  | "inventory_adjusted"
  | "discount_created"
  | "discount_updated"
  | "discount_status_updated"
  | "collection_created"
  | "collection_updated"
  | "collection_status_updated"
  | "shipping_zone_created"
  | "shipping_zone_updated"
  | "shipping_zone_status_updated"
  | "checkout_order_created"
  | "manual_order_created"
  | "abandoned_checkout_recovered"
  | "abandoned_checkout_recovery_queued"
  | "abandoned_checkout_dismissed"
  | "product_review_created"
  | "product_review_moderated"
  | "gift_card_created"
  | "gift_card_updated"
  | "gift_card_status_updated"
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

export type StorePage = {
  id: string;
  storeId: string;
  title: string;
  slug: string;
  body: string;
  seoTitle?: string;
  seoDescription?: string;
  status: StorePageStatus;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type StoreNavigationLink = {
  label: string;
  href: string;
};

export type StoreNavigationMenu = {
  id: string;
  storeId: string;
  location: StoreNavigationMenuLocation;
  links: StoreNavigationLink[];
  createdAt: string;
  updatedAt: string;
};

export type StoreLaunchReadinessCheck = {
  id: string;
  label: string;
  status: "passed" | "warning" | "blocking";
  detail: string;
  href?: string;
};

export type CustomerProfile = {
  id: string;
  storeId: string;
  email: string;
  name?: string;
  phone?: string;
  note?: string;
  tags: string[];
  acceptsMarketing: boolean;
  taxExempt: boolean;
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
  compareAtCents?: number;
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
  compareAtCents?: number;
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
  clientOrderKey?: string;
  subtotalCents: number;
  discountCode?: string;
  discountCents: number;
  giftCardCode?: string;
  giftCardCents: number;
  shippingCents: number;
  taxCents: number;
  taxRateBps: number;
  totalCents: number;
  amountDueCents: number;
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
  fulfillments: OrderFulfillment[];
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
  giftCardCents: number;
  paymentCents: number;
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

export type OrderFulfillment = {
  id: string;
  storeId: string;
  orderId: string;
  clerkUserId?: string;
  status: OrderFulfillmentStatus;
  trackingCarrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  note?: string;
  shippedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
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

export type ProductReview = {
  id: string;
  storeId: string;
  productId: string;
  orderId: string;
  orderItemId?: string;
  customerEmail: string;
  customerName: string;
  rating: number;
  title?: string;
  body: string;
  status: ProductReviewStatus;
  merchantReply?: string;
  reviewedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type GiftCardRedemption = {
  id: string;
  storeId: string;
  giftCardId: string;
  orderId: string;
  amountCents: number;
  balanceBeforeCents: number;
  balanceAfterCents: number;
  createdAt: string;
};

export type GiftCard = {
  id: string;
  storeId: string;
  code: string;
  initialBalanceCents: number;
  balanceCents: number;
  currency: string;
  status: GiftCardStatus;
  recipientEmail?: string;
  note?: string;
  expiresAt?: string;
  createdByUserId?: string;
  createdAt: string;
  updatedAt: string;
  redemptions: GiftCardRedemption[];
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
  customPages: StorePage[];
  navigationMenus: StoreNavigationMenu[];
  customerProfiles: CustomerProfile[];
  shippingZones: ShippingZone[];
  products: Product[];
  collections: ProductCollection[];
  orders: Order[];
  abandonedCheckouts: AbandonedCheckout[];
  productReviews: ProductReview[];
  giftCards: GiftCard[];
  discounts: Discount[];
  inventoryAdjustments: InventoryAdjustment[];
};

export type CustomerSummary = {
  profileId?: string;
  email: string;
  name: string;
  phone?: string;
  note?: string;
  tags: string[];
  acceptsMarketing: boolean;
  taxExempt: boolean;
  profileCreatedAt?: string;
  profileUpdatedAt?: string;
  orderCount: number;
  paidOrderCount: number;
  totalSpentCents: number;
  currency: string;
  firstOrderAt?: string;
  lastOrderAt?: string;
  lastOrderStatus?: OrderStatus;
  latestShippingAddress?: ShippingAddress;
  orders: Order[];
};

export type CustomerStats = {
  totalCustomers: number;
  repeatCustomers: number;
  marketingOptIns: number;
  leads: number;
  vipCustomers: number;
  atRiskCustomers: number;
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
