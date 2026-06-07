import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-surface flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel max-w-md p-6 text-center">
        <p className="text-sm font-semibold text-sky-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This route is not available in the current Zendora workspace.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link className="primary-button px-4 text-sm" href="/">
            Go home
          </Link>
          <Link className="secondary-button px-4 text-sm" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
