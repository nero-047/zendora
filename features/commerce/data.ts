import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/features/auth/app-user";
import {
  mockDiscounts,
  mockInventoryAdjustments,
  mockOrders,
  mockProducts,
  mockStores,
} from "@/features/commerce/mock-data";
import { isRevenueOrderStatus } from "@/features/commerce/order-status";
import type {
  DashboardOverview,
  Discount,
  DiscountStatus,
  DiscountType,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  ProductVariant,
  ProductVariantStatus,
  ProductStatus,
  InventoryAdjustment,
  InventoryAdjustmentReason,
  Store,
  StoreStatus,
  StoreWorkspace,
} from "@/features/commerce/types";
import {
  getSupabaseConfig,
  isSupabaseConfigured,
  isSupabasePublicConfigured,
} from "@/lib/env";
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
  status: StoreStatus;
  shipping_rate_cents: number | null;
  free_shipping_threshold_cents: number | null;
  tax_rate_bps: number | null;
  created_at: string;
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
  subtotal_cents: number | null;
  discount_code: string | null;
  discount_cents: number | null;
  shipping_cents: number | null;
  tax_cents: number | null;
  tax_rate_bps: number | null;
  total_cents: number;
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

function mapOrder(row: OrderRow, items: OrderItem[] = []): Order {
  const hasShippingAddress = Boolean(
    row.shipping_address_line1 ||
      row.shipping_city ||
      row.shipping_region ||
      row.shipping_postal_code ||
      row.shipping_country,
  );

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
    subtotalCents:
      row.subtotal_cents && row.subtotal_cents > 0
        ? row.subtotal_cents
        : row.total_cents,
    discountCode: row.discount_code || undefined,
    discountCents: row.discount_cents || 0,
    shippingCents: row.shipping_cents || 0,
    taxCents: row.tax_cents || 0,
    taxRateBps: row.tax_rate_bps || 0,
    totalCents: row.total_cents,
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

function mapStore(row: StoreRow, products: Product[], orders: Order[]): Store {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    currency: row.currency,
    themeColor: row.theme_color,
    status: row.status,
    createdAt: row.created_at,
    productCount: products.length,
    orderCount: orders.length,
    revenueCents: orders
      .filter((order) => isRevenueOrderStatus(order.status))
      .reduce((sum, order) => sum + order.totalCents, 0),
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

function byProductId(items: ProductVariant[]) {
  const grouped = new Map<string, ProductVariant[]>();

  for (const item of items) {
    grouped.set(item.productId, [...(grouped.get(item.productId) || []), item]);
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
    if (shouldUseDemoCatalogFallback(error)) {
      return [];
    }

    throw error;
  }

  return ((data || []) as ProductVariantRow[]).map(mapProductVariant);
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
  const items = await loadOrderItems(rows.map((row) => row.id));
  const itemsByOrder = byOrderId(items);

  return rows.map((row) => mapOrder(row, itemsByOrder.get(row.id) || []));
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

function getMockPublicStorefront(slug: string): StoreWorkspace | null {
  const store = mockStores.find((item) => item.slug === slug);

  if (!store || store.status !== "active") {
    return null;
  }

  return {
    store,
    products: mockProducts.filter(
      (product) => product.storeId === store.id && product.status === "active",
    ),
    orders: [],
    discounts: [],
    inventoryAdjustments: [],
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

function shouldUseDemoCatalogFallback(error: unknown) {
  const message = getCatalogErrorMessage(error).toLowerCase();

  return (
    message.includes("could not find the table") ||
    message.includes("schema cache") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
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
    throw new Error(productError.message);
  }

  const productRowsMapped = ((productRows || []) as ProductRow[]).map(mapProduct);
  const variants = await loadProductVariants([row.id], true, db);
  const products = attachProductVariants(productRowsMapped, variants);

  return {
    store: mapStore(row, products, []),
    products,
    orders: [],
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
    return mockStores.map((store) => mapDemoStoreForUser(store, userId));
  }

  const db = getSupabaseAdmin();
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
}

export async function getDashboardOverview(
  userId: string,
): Promise<DashboardOverview> {
  const stores = await listStoresForUser(userId);

  if (!isSupabaseConfigured()) {
    const storeIds = stores.map((store) => store.id);
    const products = mockProducts.filter((product) =>
      storeIds.includes(product.storeId),
    );
    const orders = mockOrders.filter((order) => storeIds.includes(order.storeId));

    return {
      stores,
      lowStockProducts: products
        .filter((product) => product.inventoryCount <= 12)
        .slice(0, 4),
      totalProducts: products.length,
      totalOrders: orders.length,
      totalRevenueCents: orders
        .filter((order) => isRevenueOrderStatus(order.status))
        .reduce((sum, order) => sum + order.totalCents, 0),
    };
  }

  const products = await loadProducts(stores.map((store) => store.id));
  const orders = await loadOrders(stores.map((store) => store.id));

  return {
    stores,
    lowStockProducts: products
      .filter((product) => product.inventoryCount <= 12)
      .slice(0, 4),
    totalProducts: products.length,
    totalOrders: orders.length,
    totalRevenueCents: orders
      .filter((order) => isRevenueOrderStatus(order.status))
      .reduce((sum, order) => sum + order.totalCents, 0),
  };
}

export async function getStoreWorkspace(
  userId: string,
  storeId: string,
): Promise<StoreWorkspace | null> {
  if (!isSupabaseConfigured()) {
    const store = mockStores.find(
      (item) => item.id === storeId || item.slug === storeId,
    );

    if (!store) {
      return null;
    }

    return {
      store: mapDemoStoreForUser(store, userId),
      products: mockProducts.filter((product) => product.storeId === store.id),
      orders: mockOrders.filter((order) => order.storeId === store.id),
      discounts: mockDiscounts.filter((discount) => discount.storeId === store.id),
      inventoryAdjustments: mockInventoryAdjustments.filter(
        (adjustment) => adjustment.storeId === store.id,
      ),
    };
  }

  if (!isUuid(storeId)) {
    return null;
  }

  const db = getSupabaseAdmin();
  const { data: storeRow, error: storeError } = await db
    .from("stores")
    .select("*")
    .eq("id", storeId)
    .maybeSingle();

  if (storeError) {
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
    throw membershipError;
  }

  if (row.owner_id !== userId && !membership) {
    return null;
  }

  const [products, orders, discounts, inventoryAdjustments] = await Promise.all([
    loadProducts([storeId]),
    loadOrders([storeId]),
    loadDiscounts([storeId]),
    loadInventoryAdjustments([storeId]),
  ]);

  return {
    store: mapStore(row, products, orders),
    products,
    orders,
    discounts,
    inventoryAdjustments,
  };
}

export async function getPublicStorefront(
  slug: string,
): Promise<StoreWorkspace | null> {
  const demoStorefront = getMockPublicStorefront(slug);

  if (isSupabaseConfigured()) {
    try {
      return await loadPublicStorefrontFromClient(getSupabaseAdmin(), slug);
    } catch (error) {
      if (demoStorefront && shouldUseDemoCatalogFallback(error)) {
        return demoStorefront;
      }

      throw error;
    }
  }

  if (isSupabasePublicConfigured()) {
    try {
      return await loadPublicStorefrontFromClient(getSupabasePublic(), slug);
    } catch (error) {
      if (demoStorefront && shouldUseDemoCatalogFallback(error)) {
        return demoStorefront;
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

  return loadPublicStorefrontFromClient(getSupabaseAdmin(), slug);
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
