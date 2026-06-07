export type StoreStatus = "draft" | "active" | "paused";
export type ProductStatus = "draft" | "active" | "archived";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "cancelled";

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
};

export type Product = {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  currency: string;
  inventoryCount: number;
  imageUrl: string;
  imagePath?: string;
  status: ProductStatus;
  createdAt: string;
};

export type Order = {
  id: string;
  storeId: string;
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  orderId: string;
  productId?: string;
  productName: string;
  unitPriceCents: number;
  quantity: number;
  createdAt: string;
};

export type StoreWorkspace = {
  store: Store;
  products: Product[];
  orders: Order[];
};

export type DashboardOverview = {
  stores: Store[];
  lowStockProducts: Product[];
  totalProducts: number;
  totalOrders: number;
  totalRevenueCents: number;
};
