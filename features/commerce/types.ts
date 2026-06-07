export type StoreStatus = "draft" | "active" | "paused";
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
export type RefundReason =
  | "customer_request"
  | "damaged"
  | "fraud"
  | "other";
export type DiscountStatus = "active" | "paused";
export type DiscountType = "percent" | "fixed";

export type Store = {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description: string;
  currency: string;
  themeColor: string;
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
  store: Store;
  shippingZones: ShippingZone[];
  products: Product[];
  collections: ProductCollection[];
  orders: Order[];
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
