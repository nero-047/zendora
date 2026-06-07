import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  CircleDollarSign,
  PackageSearch,
  ReceiptText,
  Repeat,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { getStoreAnalytics } from "@/features/commerce/analytics";
import { getStoreWorkspace } from "@/features/commerce/data";
import { orderStatusLabels } from "@/features/commerce/order-status";
import { formatCurrency } from "@/lib/utils";

function formatPercent(value: number) {
  return `${value}%`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function barWidth(value: number, maxValue: number) {
  if (value <= 0 || maxValue <= 0) {
    return "0%";
  }

  return `${Math.max(6, Math.round((value / maxValue) * 100))}%`;
}

export default async function StoreAnalyticsPage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  const user = await requireAppUser();
  const workspace = await getStoreWorkspace(user.id, storeId);

  if (!workspace) {
    notFound();
  }

  const { store, orders, products, abandonedCheckouts } = workspace;
  const analytics = getStoreAnalytics({
    orders,
    products,
    abandonedCheckouts,
    storeId: store.id,
    currency: store.currency,
    dayCount: 14,
  });
  const maxDaySales = Math.max(
    1,
    ...analytics.days.map((day) => day.netSalesCents),
  );
  const maxOrderStage = Math.max(
    1,
    analytics.pendingOrders,
    analytics.paidOrders,
    analytics.fulfilledOrders,
    analytics.cancelledOrders,
  );
  const maxProductSales = Math.max(
    1,
    ...analytics.topProducts.map((product) => product.netSalesCents),
  );
  const maxCustomerSales = Math.max(
    1,
    ...analytics.topCustomers.map((customer) => customer.netSalesCents),
  );
  const metricCards = [
    {
      icon: CircleDollarSign,
      label: "Net sales",
      value: formatCurrency(analytics.netSalesCents, store.currency),
      detail: `${formatCurrency(analytics.refundCents, store.currency)} refunded`,
    },
    {
      icon: ReceiptText,
      label: "Orders",
      value: formatNumber(analytics.totalOrders),
      detail: `${formatNumber(analytics.paidOrders)} paid or fulfilled`,
    },
    {
      icon: ShoppingBag,
      label: "Average order",
      value: formatCurrency(analytics.averageOrderValueCents, store.currency),
      detail: `${analytics.averageItemsPerPaidOrder} items per paid order`,
    },
    {
      icon: CircleDollarSign,
      label: "Pending revenue",
      value: formatCurrency(analytics.pendingRevenueCents, store.currency),
      detail: `${formatNumber(analytics.pendingOrders)} pending orders`,
    },
    {
      icon: TrendingUp,
      label: "Cart recovery",
      value: formatPercent(analytics.checkoutRecoveryRate),
      detail: `${formatNumber(
        analytics.recoveredAbandonedCheckouts,
      )}/${formatNumber(analytics.abandonedCheckoutCount)} recovered`,
    },
    {
      icon: Repeat,
      label: "Repeat buyers",
      value: formatPercent(analytics.repeatCustomerRate),
      detail: "Based on customer order history",
    },
  ];
  const orderStages = [
    {
      label: orderStatusLabels.pending,
      count: analytics.pendingOrders,
    },
    {
      label: "Paid or fulfilled",
      count: analytics.paidOrders,
    },
    {
      label: orderStatusLabels.fulfilled,
      count: analytics.fulfilledOrders,
    },
    {
      label: orderStatusLabels.cancelled,
      count: analytics.cancelledOrders,
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
              <BarChart3 aria-hidden="true" size={14} />
              Analytics
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">
              Store performance
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Track revenue, order quality, product performance, refunds, and
              inventory risk from the current commerce data.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="secondary-button px-4 text-sm"
              href={`/dashboard/stores/${store.id}/orders`}
            >
              <ReceiptText aria-hidden="true" size={17} />
              Orders
            </Link>
            <Link
              className="secondary-button px-4 text-sm"
              href={`/dashboard/stores/${store.id}/customers`}
            >
              <Users aria-hidden="true" size={17} />
              Customers
            </Link>
            <Link className="primary-button px-4 text-sm" href={`/stores/${store.slug}`}>
              <ShoppingBag aria-hidden="true" size={17} />
              Storefront
            </Link>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        {metricCards.map(({ icon: Icon, label, value, detail }) => (
          <div className="soft-panel p-4" key={label}>
            <Icon aria-hidden="true" className="text-sky-700" size={20} />
            <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
            <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>
          </div>
        ))}
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <TrendingUp aria-hidden="true" size={18} />
            Analytics priorities
          </h2>
        </div>
        {analytics.insights.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {analytics.insights.map((insight) => (
              <div
                className="grid gap-3 p-4 md:grid-cols-[auto_1fr_auto]"
                key={insight.id}
              >
                <span className="status-pill w-fit capitalize">
                  {insight.severity}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-950">
                    {insight.title}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {insight.detail}
                  </p>
                </div>
                {insight.href ? (
                  <Link
                    className="secondary-button min-h-10 px-3 text-sm"
                    href={insight.href}
                  >
                    <ArrowUpRight aria-hidden="true" size={16} />
                    {insight.actionLabel}
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            Analytics priorities will appear as the store receives more signal.
          </p>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <TrendingUp aria-hidden="true" size={18} />
              Net sales trend
            </h2>
          </div>
          <div className="grid gap-3 p-4">
            {analytics.days.map((day) => (
              <div className="grid gap-2 sm:grid-cols-[88px_1fr_auto]" key={day.key}>
                <div>
                  <p className="text-sm font-semibold text-slate-950">{day.label}</p>
                  <p className="text-xs text-slate-500">{day.orderCount} orders</p>
                </div>
                <div className="h-10 overflow-hidden rounded-[8px] bg-slate-100">
                  <div
                    className="h-full rounded-[8px] bg-gradient-to-r from-emerald-500 to-sky-500"
                    style={{ width: barWidth(day.netSalesCents, maxDaySales) }}
                  />
                </div>
                <p className="text-sm font-semibold text-slate-950 sm:text-right">
                  {formatCurrency(day.netSalesCents, store.currency)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <ReceiptText aria-hidden="true" size={18} />
              Order health
            </h2>
          </div>
          <div className="grid gap-4 p-4">
            {orderStages.map((stage) => (
              <div key={stage.label}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">
                    {stage.label}
                  </p>
                  <p className="text-sm font-semibold text-slate-950">
                    {formatNumber(stage.count)}
                  </p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-900"
                    style={{ width: barWidth(stage.count, maxOrderStage) }}
                  />
                </div>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Paid rate
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatPercent(analytics.paidRate)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Refund rate
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatPercent(analytics.refundRate)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Fulfilled
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatPercent(analytics.fulfillmentRate)}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">
                  Gross sales
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-950">
                  {formatCurrency(analytics.grossSalesCents, store.currency)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Users aria-hidden="true" size={18} />
            Customer concentration
          </h2>
        </div>
        {analytics.topCustomers.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {analytics.topCustomers.map((customer) => (
              <div
                className="grid gap-3 p-4 md:grid-cols-[1fr_180px_auto]"
                key={customer.customerEmail}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {customer.customerName}
                  </p>
                  <p className="mt-1 truncate text-xs font-medium text-slate-500">
                    {customer.customerEmail} / {customer.orderCount} orders
                  </p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100 md:mt-2">
                  <div
                    className="h-full rounded-full bg-violet-600"
                    style={{
                      width: barWidth(customer.netSalesCents, maxCustomerSales),
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                  <span className="status-pill">{formatPercent(customer.share)}</span>
                  <p className="text-sm font-semibold text-slate-950 md:text-right">
                    {formatCurrency(customer.netSalesCents, store.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            Customer concentration appears after paid orders are created.
          </p>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <Truck aria-hidden="true" size={18} />
              Channel mix
            </h2>
          </div>
          <div className="grid gap-4 p-4">
            {analytics.sourceMix.map((source) => (
              <div key={source.source}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold capitalize text-slate-700">
                    {source.source}
                  </p>
                  <p className="text-sm font-semibold text-slate-950">
                    {source.count} / {formatPercent(source.share)}
                  </p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-600"
                    style={{ width: barWidth(source.share, 100) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="soft-panel overflow-hidden">
          <div className="border-b border-slate-100 p-4">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
              <PackageSearch aria-hidden="true" size={18} />
              Product performance
            </h2>
          </div>
          {analytics.topProducts.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {analytics.topProducts.map((product) => (
                <div
                  className="grid gap-3 p-4 md:grid-cols-[1fr_180px_auto]"
                  key={product.productId || product.productName}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {product.productName}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {product.quantity} sold / {product.orderCount} orders
                    </p>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100 md:mt-2">
                    <div
                      className="h-full rounded-full bg-emerald-600"
                      style={{
                        width: barWidth(product.netSalesCents, maxProductSales),
                      }}
                    />
                  </div>
                  <p className="text-sm font-semibold text-slate-950 md:text-right">
                    {formatCurrency(product.netSalesCents, store.currency)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-sm text-slate-500">
              Product sales will appear after paid orders are created.
            </p>
          )}
        </div>
      </section>

      <section className="soft-panel overflow-hidden">
        <div className="border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <PackageSearch aria-hidden="true" size={18} />
            Inventory risk
          </h2>
        </div>
        {analytics.lowStockProducts.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {analytics.lowStockProducts.map((product) => (
              <div
                className="grid gap-3 p-4 sm:grid-cols-[1fr_auto_auto]"
                key={product.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">
                    {product.name}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {product.status} / {product.category || "uncategorized"}
                  </p>
                </div>
                <span className="status-pill w-fit">
                  {product.inventoryCount} in stock
                </span>
                <Link
                  className="secondary-button min-h-10 px-3 text-sm"
                  href={`/dashboard/stores/${store.id}/products/${product.id}/edit`}
                >
                  Edit
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-slate-500">
            No low-stock products in the current threshold.
          </p>
        )}
      </section>
    </div>
  );
}
