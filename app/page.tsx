import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Database,
  Image as ImageIcon,
  Layers3,
  LockKeyhole,
  Store,
  WandSparkles,
  Workflow,
} from "lucide-react";

const productImages = [
  "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80",
];

const architectureCards = [
  {
    icon: Layers3,
    title: "Merchant workspace",
    copy: "Manage stores, products, collections, checkout, customers, orders, and fulfillment from one place.",
  },
  {
    icon: LockKeyhole,
    title: "Clerk profile sync",
    copy: "Auth routes and a public webhook keep user data mirrored in Supabase.",
  },
  {
    icon: Database,
    title: "Supabase backbone",
    copy: "Postgres schema, service-role Server Functions, and storage-backed product images.",
  },
  {
    icon: Workflow,
    title: "Operations-ready flow",
    copy: "Inventory, discounts, shipping zones, refunds, manual orders, and payment status stay connected.",
  },
];

const proofCards = [
  { icon: Boxes, label: "Multi-store per account" },
  { icon: ImageIcon, label: "Product image storage" },
  { icon: CheckCircle2, label: "Role-gated commerce ops" },
];

export default function Home() {
  return (
    <main className="liquid-bg min-h-screen overflow-hidden">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
        <Link className="flex items-center gap-3" href="/">
          <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-gradient-to-br from-emerald-600 to-sky-600 text-sm font-bold text-white shadow-lg shadow-sky-500/20">
            Z
          </span>
          <span className="font-semibold text-slate-950">Zendora</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link className="secondary-button hidden px-3 text-sm sm:inline-flex" href="/stores/northline-supply">
            <Store aria-hidden="true" size={16} />
            Storefront
          </Link>
          <Link className="primary-button px-3 text-sm" href="/dashboard">
            Dashboard
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid min-h-[82vh] max-w-7xl items-center gap-10 px-4 pb-12 pt-6 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
        <div className="max-w-2xl">
          <span className="status-pill mb-5">
            <WandSparkles aria-hidden="true" size={14} />
            Multi-store commerce platform
          </span>
          <h1 className="text-5xl font-semibold leading-[1.04] text-slate-950 sm:text-6xl lg:text-7xl">
            Zendora
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
            A Shopify-style founder dashboard with Clerk auth, Supabase database and storage,
            multi-store management, product publishing, checkout, orders, and inventory control.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link className="primary-button px-5" href="/dashboard">
              Open dashboard
              <ArrowRight aria-hidden="true" size={18} />
            </Link>
            <Link className="secondary-button px-5" href="/dashboard/stores/new">
              <Store aria-hidden="true" size={18} />
              Create store
            </Link>
          </div>

          <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Stores", "multi-brand"],
              ["Products", "images + stock"],
              ["Auth", "Clerk webhook"],
              ["Storage", "Supabase"],
            ].map(([label, value]) => (
              <div className="soft-panel p-3" key={label}>
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-device p-3 sm:p-4">
          <div className="rounded-[8px] border border-white/70 bg-slate-950 p-2">
            <div className="mb-2 flex items-center gap-1.5 px-1">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="grid gap-2 rounded-[8px] bg-[#f8fbff] p-3 sm:grid-cols-[0.7fr_1.3fr]">
              <div className="hidden rounded-[8px] border border-slate-200 bg-white/80 p-3 sm:block">
                <div className="mb-4 h-8 w-8 rounded-[8px] bg-gradient-to-br from-emerald-600 to-sky-600" />
                <div className="grid gap-2">
                  {["Dashboard", "Stores", "Products", "Orders"].map((item, index) => (
                    <div
                      className={
                        index === 1
                          ? "rounded-[8px] bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                          : "rounded-[8px] px-3 py-2 text-xs font-semibold text-slate-500"
                      }
                      key={item}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Revenue", "$128.6k"],
                    ["Products", "42"],
                    ["Stores", "2"],
                  ].map(([label, value]) => (
                    <div className="rounded-[8px] border border-slate-200 bg-white p-3" key={label}>
                      <p className="text-xs font-semibold text-slate-500">{label}</p>
                      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid gap-3 rounded-[8px] border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-950">Northline Supply</p>
                    <span className="status-pill">active</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {productImages.map((src) => (
                      <Image
                        alt="Zendora product preview"
                        className="product-image"
                        height={675}
                        key={src}
                        sizes="(max-width: 768px) 30vw, 180px"
                        src={src}
                        width={900}
                      />
                    ))}
                  </div>
                  <div className="grid gap-2">
                    <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-orange-400" />
                    <div className="grid grid-cols-4 gap-2">
                      <div className="h-2 rounded-full bg-slate-200" />
                      <div className="h-2 rounded-full bg-slate-200" />
                      <div className="h-2 rounded-full bg-slate-200" />
                      <div className="h-2 rounded-full bg-slate-200" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        {architectureCards.map(({ icon: Icon, title, copy }) => (
          <article className="glass-panel p-5" key={title}>
            <Icon aria-hidden="true" className="text-sky-700" size={22} />
            <h2 className="mt-4 text-base font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{copy}</p>
          </article>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          {proofCards.map(({ icon: Icon, label }) => (
            <div className="soft-panel flex items-center gap-3 p-4" key={label}>
              <Icon aria-hidden="true" className="text-emerald-700" size={20} />
              <span className="font-semibold text-slate-800">{label}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
