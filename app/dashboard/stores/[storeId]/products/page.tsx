import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Edit3,
  Filter,
  Package,
  PackagePlus,
  Search,
  ShieldCheck,
  Store,
  TriangleAlert,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { getStoreWorkspace } from "@/features/commerce/data";
import { getInventoryPlanningSignals } from "@/features/commerce/inventory-planning";
import { getProductHealth } from "@/features/commerce/product-health";
import {
  filterProducts,
  getProductCategories,
  getProductEditHref,
  getProductStats,
  parseProductHealthFilter,
  parseProductInventoryUrgencyFilter,
  parseProductSortOption,
  productStatusFilters,
  productStatusLabels,
  productHealthFilters,
  productHealthFilterLabels,
  productInventoryUrgencyFilters,
  productInventoryUrgencyFilterLabels,
  productSortLabels,
  productSortOptions,
  readProductSearchParam,
  parseProductStatusFilter,
} from "@/features/commerce/products";
import {
  buildDashboardPageHref,
  buildDashboardExportHref,
  dashboardPageSizeOptions,
  paginateItems,
  parseDashboardPage,
  parseDashboardPageSize,
} from "@/features/commerce/pagination";
import { formatCurrency } from "@/lib/utils";

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ storeId: string }>;
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
    category?: string | string[];
    health?: string | string[];
    inventory?: string | string[];
    sort?: string | string[];
    page?: string | string[];
    pageSize?: string | string[];
  }>;
}) {
  const { storeId } = await params;
  const query = await searchParams;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const { store, products, orders } = workspace;
  const searchQuery = readProductSearchParam(query.q);
  const selectedStatus = parseProductStatusFilter(query.status);
  const selectedCategory = readProductSearchParam(query.category);
  const selectedHealth = parseProductHealthFilter(query.health);
  const selectedInventory = parseProductInventoryUrgencyFilter(query.inventory);
  const selectedSort = parseProductSortOption(query.sort);
  const selectedPage = parseDashboardPage(query.page);
  const selectedPageSize = parseDashboardPageSize(query.pageSize);
  const categories = getProductCategories(products);
  const stats = getProductStats(products);
  const inventorySignals = getInventoryPlanningSignals({
    products,
    orders,
    limit: products.length || 1,
  });
  const inventorySignalsByProduct = new Map(
    inventorySignals.map((signal) => [signal.productId, signal]),
  );
  const filteredProducts = filterProducts({
    products,
    query: searchQuery,
    status: selectedStatus,
    category: selectedCategory,
    health: selectedHealth,
    inventory: selectedInventory,
    sort: selectedSort,
    inventorySignalsByProduct,
  });
  const paginatedProducts = paginateItems({
    items: filteredProducts,
    page: selectedPage,
    pageSize: selectedPageSize,
  });
  const productsBasePath = `/dashboard/stores/${store.id}/products`;
  const productsExportHref = buildDashboardExportHref({
    basePath: `${productsBasePath}/export`,
    params: query,
  });
  const variantsExportHref = buildDashboardExportHref({
    basePath: `${productsBasePath}/variants/export`,
    params: query,
  });
  const productFeedExportHref = buildDashboardExportHref({
    basePath: `${productsBasePath}/feed/export`,
    params: query,
  });
  const productImportTemplateHref = `/dashboard/stores/${store.id}/products/import-template/export`;
  const reorderNowCount = inventorySignals.filter(
    (signal) =>
      signal.urgency === "out_of_stock" || signal.urgency === "reorder_now",
  ).length;
  const metricCards = [
    {
      icon: Package,
      label: "Products",
      value: String(stats.totalProducts),
    },
    {
      icon: Store,
      label: "Ready to sell",
      value: String(stats.readyProducts),
    },
    {
      icon: ShieldCheck,
      label: "Sellable units",
      value: String(stats.sellableInventory),
    },
    {
      icon: TriangleAlert,
      label: "Needs attention",
      value: String(stats.needsAttentionProducts),
    },
    {
      icon: Boxes,
      label: "Reorder now",
      value: String(reorderNowCount),
    },
    {
      icon: Boxes,
      label: "Low stock",
      value: String(stats.lowStockProducts),
    },
    {
      icon: CircleDollarSign,
      label: "Stock value",
      value: formatCurrency(stats.inventoryValueCents, store.currency),
    },
  ];

  return (
    <div className="grid gap-5">
      <Link
        className="secondary-button w-fit px-4 text-sm"
        href={`/dashboard/stores/${store.id}`}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        {store.name}
      </Link>

      <section className="glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-pill mb-3">
              <Package aria-hidden="true" size={14} />
              Products
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Product catalog
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Search products, watch inventory, and keep the storefront catalog
              ready to sell.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="secondary-button px-4 text-sm" href={productsExportHref}>
              <Download aria-hidden="true" size={17} />
              Export CSV
            </Link>
            <Link className="secondary-button px-4 text-sm" href={variantsExportHref}>
              <Download aria-hidden="true" size={17} />
              Variants CSV
            </Link>
            <Link className="secondary-button px-4 text-sm" href={productFeedExportHref}>
              <Download aria-hidden="true" size={17} />
              Product Feed CSV
            </Link>
            <Link className="secondary-button px-4 text-sm" href={productImportTemplateHref}>
              <Download aria-hidden="true" size={17} />
              Import Template
            </Link>
            <Link
              className="primary-button px-4 text-sm"
              href={`/dashboard/stores/${store.id}/products/new`}
            >
              <PackagePlus aria-hidden="true" size={17} />
              Product
            </Link>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        {metricCards.map(({ icon: Icon, label, value }) => (
          <div className="soft-panel p-4" key={label}>
            <Icon aria-hidden="true" className="text-sky-700" size={20} />
            <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="soft-panel p-4">
        <form className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto_auto_auto]" method="get">
          <input name="page" type="hidden" value="1" />
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Search products
            <span className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <input
                className="field pl-9"
                defaultValue={searchQuery}
                name="q"
                placeholder="Name, SKU, category"
              />
            </span>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Status
            <select className="field min-w-40" defaultValue={selectedStatus} name="status">
              {productStatusFilters.map((status) => (
                <option key={status} value={status}>
                  {status === "all" ? "All statuses" : productStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Health
            <select
              className="field min-w-44"
              defaultValue={selectedHealth}
              name="health"
            >
              {productHealthFilters.map((health) => (
                <option key={health} value={health}>
                  {productHealthFilterLabels[health]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Inventory
            <select
              className="field min-w-44"
              defaultValue={selectedInventory}
              name="inventory"
            >
              {productInventoryUrgencyFilters.map((inventory) => (
                <option key={inventory} value={inventory}>
                  {productInventoryUrgencyFilterLabels[inventory]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Category
            <select
              className="field min-w-44"
              defaultValue={selectedCategory}
              name="category"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Sort
            <select
              className="field min-w-44"
              defaultValue={selectedSort}
              name="sort"
            >
              {productSortOptions.map((sort) => (
                <option key={sort} value={sort}>
                  {productSortLabels[sort]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Page size
            <select
              className="field min-w-32"
              defaultValue={selectedPageSize}
              name="pageSize"
            >
              {dashboardPageSizeOptions.map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button mt-auto min-h-12 px-4 text-sm" type="submit">
            <Filter aria-hidden="true" size={16} />
            Filter
          </button>
        </form>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Showing {paginatedProducts.startItem}-{paginatedProducts.endItem} of{" "}
          {filteredProducts.length} matching products.
        </p>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400 xl:grid-cols-[1.4fr_auto_auto_auto_auto_auto_auto]">
          <span>Product</span>
          <span className="hidden xl:inline">Status</span>
          <span className="hidden xl:inline">Health</span>
          <span className="hidden xl:inline">Plan</span>
          <span className="hidden xl:inline">Stock</span>
          <span className="hidden xl:inline">Price</span>
          <span>Edit</span>
        </div>
        {paginatedProducts.items.map((product) => {
          const health = getProductHealth(product);
          const inventorySignal = inventorySignalsByProduct.get(product.id);

          return (
            <div
              className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-100 px-4 py-4 last:border-0 xl:grid-cols-[1.4fr_auto_auto_auto_auto_auto_auto]"
              key={product.id}
            >
              <div className="flex min-w-0 items-center gap-3">
                <Image
                  alt={product.name}
                  className="h-16 w-16 rounded-[8px] object-cover"
                  height={128}
                  src={product.imageUrl}
                  width={128}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {product.name}
                    </p>
                    <span className="status-pill xl:hidden">{health.label}</span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {[
                      product.category,
                      product.variants.length > 0
                        ? `${product.variants.length} variants`
                        : product.sku,
                    ].filter(Boolean).join(" / ") ||
                      product.slug}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-slate-700 xl:hidden">
                    {health.sellableInventoryCount} sellable /{" "}
                    {product.variants.length > 0 ? "From " : ""}
                    {formatCurrency(product.priceCents, product.currency)}
                  </p>
                  {health.status !== "ready" ? (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                      {health.nextAction}
                    </p>
                  ) : null}
                  {inventorySignal ? (
                    <p className="mt-2 line-clamp-2 text-xs text-slate-500 xl:hidden">
                      {inventorySignal.detail}
                    </p>
                  ) : null}
                </div>
              </div>
              <span className="status-pill hidden w-fit xl:inline-flex">
                {productStatusLabels[product.status]}
              </span>
              <span className="status-pill hidden w-fit xl:inline-flex">
                {health.label}
              </span>
              <span className="hidden max-w-44 text-sm text-slate-600 xl:inline">
                {inventorySignal ? inventorySignal.label : "No plan"}
              </span>
              <span className="hidden text-sm font-semibold text-slate-700 xl:inline">
                {health.sellableInventoryCount}
              </span>
              <span className="hidden text-sm font-semibold text-slate-950 xl:inline">
                {product.variants.length > 0 ? "From " : ""}
                {formatCurrency(product.priceCents, product.currency)}
              </span>
              <Link
                aria-label={`Edit ${product.name}`}
                className="icon-button h-10 min-h-10 w-10"
                href={getProductEditHref(store.id, product.id)}
              >
                <Edit3 aria-hidden="true" size={16} />
              </Link>
            </div>
          );
        })}
        {filteredProducts.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">
            No products match the current filters.
          </p>
        ) : null}
      </section>
      {filteredProducts.length > 0 ? (
        <nav
          aria-label="Product catalog pages"
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p className="font-medium text-slate-500">
            Page {paginatedProducts.page} of {paginatedProducts.totalPages}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              aria-disabled={!paginatedProducts.hasPreviousPage}
              className={
                paginatedProducts.hasPreviousPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: productsBasePath,
                params: query,
                page: paginatedProducts.page - 1,
                pageSize: paginatedProducts.pageSize,
              })}
            >
              <ChevronLeft aria-hidden="true" size={16} />
              Previous
            </Link>
            <Link
              aria-disabled={!paginatedProducts.hasNextPage}
              className={
                paginatedProducts.hasNextPage
                  ? "secondary-button px-3 text-sm"
                  : "secondary-button pointer-events-none px-3 text-sm opacity-50"
              }
              href={buildDashboardPageHref({
                basePath: productsBasePath,
                params: query,
                page: paginatedProducts.page + 1,
                pageSize: paginatedProducts.pageSize,
              })}
            >
              Next
              <ChevronRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
