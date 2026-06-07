"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="liquid-bg flex min-h-screen items-center justify-center px-4 py-10">
      <section className="glass-panel max-w-xl p-6 text-center sm:p-8">
        <p className="text-sm font-semibold text-sky-700">Operations paused</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          The dashboard hit a temporary issue
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Your store data was not changed. Retry the dashboard load or go back to
          the store list.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-slate-400">
            Reference {error.digest}
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button className="primary-button px-4 text-sm" onClick={unstable_retry} type="button">
            <RefreshCw aria-hidden="true" size={16} />
            Retry
          </button>
          <Link className="secondary-button px-4 text-sm" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
