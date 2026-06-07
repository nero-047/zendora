export type StoreStatus = "draft" | "active" | "paused";
export type ProductStatus = "draft" | "active" | "archived";
export type ProductVariantStatus = "active" | "paused";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "cancelled";
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
  subtotalCents: number;
  discountCode?: string;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  taxRateBps: number;
  totalCents: number;
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
  products: Product[];
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
