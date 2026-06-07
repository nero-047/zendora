import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import {
  BarChart3,
  Boxes,
  ExternalLink,
  Home,
  LayoutDashboard,
  Plus,
  Store as StoreIcon,
} from "lucide-react";

import type { AppUser } from "@/features/auth/app-user";
import type { Store } from "@/features/commerce/types";
import { isClerkConfigured } from "@/lib/env";

export function DashboardShell({
  children,
  stores,
  user,
}: {
  children: React.ReactNode;
  stores: Store[];
  user: AppUser;
}) {
  return (
    <div className="liquid-bg min-h-screen">
      <aside className="fixed inset-y-3 left-3 z-20 hidden w-72 flex-col rounded-[8px] border border-white/70 bg-white/58 p-3 shadow-[0_24px_80px_rgba(15,65,95,0.14)] backdrop-blur-2xl lg:flex">
        <Link className="flex items-center gap-3 rounded-[8px] px-3 py-3" href="/">
          <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-emerald-600 to-sky-600 text-white shadow-lg shadow-sky-500/20">
            Z
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-950">Zendora</span>
            <span className="block text-xs font-medium text-slate-500">Commerce OS</span>
          </span>
        </Link>

        <nav className="mt-4 grid gap-1">
          <Link
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white/72"
            href="/dashboard"
          >
            <LayoutDashboard aria-hidden="true" size={18} />
            Dashboard
          </Link>
          <Link
            className="flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-white/72"
            href="/dashboard/stores/new"
          >
            <Plus aria-hidden="true" size={18} />
            New store
          </Link>
        </nav>

        <div className="mt-5">
          <p className="px-3 text-xs font-bold uppercase text-slate-400">Stores</p>
          <div className="mt-2 grid gap-1">
            {stores.map((store) => (
              <Link
                className="group rounded-[8px] px-3 py-2.5 hover:bg-white/72"
                href={`/dashboard/stores/${store.id}`}
                key={store.id}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <StoreIcon aria-hidden="true" size={16} />
                  {store.name}
                </span>
                <span className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ background: store.themeColor }} />
                  {store.status}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-auto grid gap-2 rounded-[8px] border border-white/70 bg-white/54 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">{user.name}</p>
              <p className="max-w-44 truncate text-xs text-slate-500">{user.email}</p>
            </div>
            {isClerkConfigured() ? (
              <UserButton />
            ) : (
              <span className="status-pill">Local</span>
            )}
          </div>
        </div>
      </aside>

      <div className="lg:pl-[19rem]">
        <header className="sticky top-0 z-10 border-b border-white/60 bg-white/58 px-4 py-3 backdrop-blur-2xl lg:hidden">
          <div className="flex items-center justify-between">
            <Link className="flex items-center gap-2 font-semibold text-slate-950" href="/">
              <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-gradient-to-br from-emerald-600 to-sky-600 text-white">
                Z
              </span>
              Zendora
            </Link>
            <Link className="icon-button" href="/dashboard/stores/new" title="New store">
              <Plus aria-hidden="true" size={18} />
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <Link className="secondary-button px-3 text-sm" href="/">
                <Home aria-hidden="true" size={16} />
                Home
              </Link>
              <Link className="secondary-button px-3 text-sm" href="/stores/northline-supply">
                <ExternalLink aria-hidden="true" size={16} />
                Sample store
              </Link>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="status-pill">
                <Boxes aria-hidden="true" size={14} />
                {stores.length} stores
              </span>
              <span className="status-pill">
                <BarChart3 aria-hidden="true" size={14} />
                Operations
              </span>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
