"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";

export default function RootError({
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
    <main className="auth-surface flex min-h-screen items-center justify-center px-6">
      <section className="glass-panel max-w-lg p-6 text-center">
        <p className="text-sm font-semibold text-sky-700">Runtime error</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">
          Zendora could not finish loading
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Try again, or return home while the current operation recovers.
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
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
