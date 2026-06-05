import "server-only";

import type { AppUser } from "@/features/auth/app-user";
import { mockOrders, mockProducts, mockStores } from "@/features/commerce/mock-data";
import type {
  DashboardOverview,
  Order,
  OrderStatus,
  Product,
  ProductStatus,
  Store,
  StoreStatus,
  StoreWorkspace,
} from "@/features/commerce/types";
import { getSupabaseConfig, isSupabaseConfigured } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
  created_at: string;
};

type ProductRow = {
  id: string;
  store_id: string;
  name: string;
  slug: string;
  description: string | null;
  price_cents: number;
  currency: string;
  inventory_count: number;
  image_url: string | null;
  image_path: string | null;
  status: ProductStatus;
  created_at: string;
};

type OrderRow = {
  id: string;
  store_id: string;
  customer_name: string | null;
  customer_email: string;
  status: OrderStatus;
  total_cents: number;
  currency: string;
  created_at: string;
};

function mapProduct(row: ProductRow): Product {
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    slug: row.slug,
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
  };
}

function mapOrder(row: OrderRow): Order {
  return {
    id: row.id,
    storeId: row.store_id,
    customerName: row.customer_name || "Guest customer",
    customerEmail: row.customer_email,
    status: row.status,
    totalCents: row.total_cents,
    currency: row.currency,
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
    revenueCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
    inventoryCount: products.reduce(
      (sum, product) => sum + product.inventoryCount,
      0,
    ),
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

  return ((data || []) as ProductRow[]).map(mapProduct);
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

  return ((data || []) as OrderRow[]).map(mapOrder);
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
      totalRevenueCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
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
    totalRevenueCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
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

  const [products, orders] = await Promise.all([
    loadProducts([storeId]),
    loadOrders([storeId]),
  ]);

  return {
    store: mapStore(row, products, orders),
    products,
    orders,
  };
}

export async function getPublicStorefront(
  slug: string,
): Promise<StoreWorkspace | null> {
  if (!isSupabaseConfigured()) {
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
    };
  }

  const db = getSupabaseAdmin();
  const { data: storeRow, error: storeError } = await db
    .from("stores")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  if (storeError) {
    throw storeError;
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
    throw productError;
  }

  const products = ((productRows || []) as ProductRow[]).map(mapProduct);

  return {
    store: mapStore(row, products, []),
    products,
    orders: [],
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
