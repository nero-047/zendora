import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Boxes, CircleDollarSign, Package, ShoppingBag, Store } from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { getDashboardOverview } from "@/features/commerce/data";
import { formatCurrency } from "@/lib/utils";

export default async function DashboardPage() {
  const user = await requireAppUser();
  const overview = await getDashboardOverview(user.id);
  const metrics = [
    {
      icon: CircleDollarSign,
      label: "Revenue",
      value: formatCurrency(overview.totalRevenueCents),
    },
    { icon: ShoppingBag, label: "Orders", value: String(overview.totalOrders) },
    { icon: Package, label: "Products", value: String(overview.totalProducts) },
    { icon: Boxes, label: "Stores", value: String(overview.stores.length) },
  ];

  return (
    <div className="grid gap-5">
      <div className="glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-pill mb-3">Today</span>
            <h1 className="text-3xl font-semibold text-slate-950">Commerce command center</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Manage brands, stock, storefront publishing, and the first order loop from one account.
            </p>
          </div>
          <Link className="primary-button px-4" href="/dashboard/stores/new">
            <Store aria-hidden="true" size={18} />
            New store
          </Link>
        </div>
      </div>

      <section className="dashboard-grid">
        {metrics.map(({ icon: Icon, label, value }) => (
          <div className="soft-panel p-4" key={label}>
            <div className="flex items-center justify-between">
              <Icon aria-hidden="true" className="text-sky-700" size={20} />
              <ArrowUpRight aria-hidden="true" className="text-emerald-600" size={16} />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Stores</h2>
            <Link className="text-sm font-semibold text-sky-700" href="/dashboard/stores/new">
              Add store
            </Link>
          </div>
          <div className="grid gap-3">
            {overview.stores.map((store) => (
              <Link className="soft-panel block p-4" href={`/dashboard/stores/${store.id}`} key={store.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: store.themeColor }} />
                      <h3 className="font-semibold text-slate-950">{store.name}</h3>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{store.description || store.slug}</p>
                  </div>
                  <span className="status-pill">{store.status}</span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <span className="rounded-[8px] bg-slate-50 p-3">
                    <strong className="block text-slate-950">{store.productCount}</strong>
                    <span className="text-slate-500">products</span>
                  </span>
                  <span className="rounded-[8px] bg-slate-50 p-3">
                    <strong className="block text-slate-950">{store.orderCount}</strong>
                    <span className="text-slate-500">orders</span>
                  </span>
                  <span className="rounded-[8px] bg-slate-50 p-3">
                    <strong className="block text-slate-950">{formatCurrency(store.revenueCents)}</strong>
                    <span className="text-slate-500">sales</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-950">Low stock</h2>
          <div className="soft-panel overflow-hidden">
            {overview.lowStockProducts.length > 0 ? (
              overview.lowStockProducts.map((product) => (
                <div className="flex items-center gap-3 border-b border-slate-100 p-3 last:border-0" key={product.id}>
                  <Image
                    alt={product.name}
                    className="h-14 w-14 rounded-[8px] object-cover"
                    height={112}
                    src={product.imageUrl}
                    width={112}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.inventoryCount} in stock</p>
                  </div>
                  <span className="status-pill">{product.status}</span>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">Inventory looks steady.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
