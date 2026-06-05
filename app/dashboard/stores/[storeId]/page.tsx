import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowUpRight,
  ExternalLink,
  PackagePlus,
  PauseCircle,
  PlayCircle,
  ShoppingBag,
} from "lucide-react";

import { requireAppUser } from "@/features/auth/app-user";
import { getStoreWorkspace } from "@/features/commerce/data";
import {
  pauseStoreAction,
  publishStoreAction,
} from "@/features/commerce/actions";
import { formatCurrency } from "@/lib/utils";

export default async function StorePage({
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

  const { store, products, orders } = workspace;

  return (
    <div className="grid gap-5">
      <div className="glass-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="status-pill mb-3">
              <span className="h-2 w-2 rounded-full" style={{ background: store.themeColor }} />
              {store.status}
            </span>
            <h1 className="text-3xl font-semibold text-slate-950">{store.name}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {store.description || "A focused workspace for products, inventory, and storefront publishing."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="secondary-button px-4 text-sm" href={`/stores/${store.slug}`}>
              <ExternalLink aria-hidden="true" size={17} />
              View
            </Link>
            <Link className="primary-button px-4 text-sm" href={`/dashboard/stores/${store.id}/products/new`}>
              <PackagePlus aria-hidden="true" size={17} />
              Product
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <form action={publishStoreAction.bind(null, store.id)}>
            <button className="secondary-button px-3 text-sm" type="submit">
              <PlayCircle aria-hidden="true" size={16} />
              Publish
            </button>
          </form>
          <form action={pauseStoreAction.bind(null, store.id)}>
            <button className="secondary-button px-3 text-sm" type="submit">
              <PauseCircle aria-hidden="true" size={16} />
              Pause
            </button>
          </form>
        </div>
      </div>

      <section className="dashboard-grid">
        {[
          ["Revenue", formatCurrency(store.revenueCents)],
          ["Orders", String(store.orderCount)],
          ["Inventory", String(store.inventoryCount)],
          ["Products", String(store.productCount)],
        ].map(([label, value]) => (
          <div className="soft-panel p-4" key={label}>
            <p className="text-sm font-semibold text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-950">Products</h2>
            <Link className="text-sm font-semibold text-sky-700" href={`/dashboard/stores/${store.id}/products/new`}>
              Add product
            </Link>
          </div>
          <div className="soft-panel overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase text-slate-400">
              <span>Product</span>
              <span>Stock</span>
              <span>Price</span>
            </div>
            {products.map((product) => (
              <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0" key={product.id}>
                <div className="flex min-w-0 items-center gap-3">
                  <Image
                    alt={product.name}
                    className="h-14 w-14 rounded-[8px] object-cover"
                    height={112}
                    src={product.imageUrl}
                    width={112}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                    <p className="truncate text-xs text-slate-500">{product.status}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-700">{product.inventoryCount}</span>
                <span className="text-sm font-semibold text-slate-950">{formatCurrency(product.priceCents, product.currency)}</span>
              </div>
            ))}
            {products.length === 0 ? (
              <div className="p-5 text-sm text-slate-500">No products yet.</div>
            ) : null}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-950">Recent orders</h2>
          <div className="soft-panel overflow-hidden">
            {orders.length > 0 ? (
              orders.slice(0, 6).map((order) => (
                <div className="flex items-center gap-3 border-b border-slate-100 p-4 last:border-0" key={order.id}>
                  <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-sky-500/10 text-sky-700">
                    <ShoppingBag aria-hidden="true" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-950">{order.customerName}</p>
                    <p className="text-xs text-slate-500">{order.status}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-950">{formatCurrency(order.totalCents, order.currency)}</span>
                </div>
              ))
            ) : (
              <p className="p-4 text-sm text-slate-500">Orders will appear here after checkout.</p>
            )}
          </div>
        </div>
      </section>

      <Link className="secondary-button w-fit px-4 text-sm" href="/dashboard">
        <ArrowUpRight aria-hidden="true" size={16} />
        Back to dashboard
      </Link>
    </div>
  );
}
