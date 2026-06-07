"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, ShoppingBag } from "lucide-react";

export default function StorefrontError({
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
        <span className="status-pill mx-auto w-fit">
          <ShoppingBag aria-hidden="true" size={14} />
          Storefront
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">
          This storefront needs a refresh
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          We could not load the latest catalog or order details. Retry the page
          without exposing internal system details to shoppers.
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
          <Link className="secondary-button px-4 text-sm" href="/">
            Zendora
          </Link>
        </div>
      </section>
    </main>
  );
}
