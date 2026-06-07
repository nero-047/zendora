import Link from "next/link";
import { Plus, Store } from "lucide-react";

export default function StoresNotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-10">
      <section className="glass-panel max-w-xl p-6 text-center sm:p-8">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-[8px] bg-sky-500/10 text-sky-700">
          <Store aria-hidden="true" size={22} />
        </span>
        <p className="mt-5 text-sm font-semibold text-sky-700">
          Store unavailable
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          Store workspace not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This store may have been removed, renamed, or is not available to the
          current merchant account.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link className="primary-button px-4 text-sm" href="/dashboard">
            <Store aria-hidden="true" size={16} />
            Dashboard
          </Link>
          <Link className="secondary-button px-4 text-sm" href="/dashboard/stores/new">
            <Plus aria-hidden="true" size={16} />
            New store
          </Link>
        </div>
      </section>
    </div>
  );
}
