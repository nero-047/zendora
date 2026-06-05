import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-surface flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel max-w-md p-6 text-center">
        <p className="text-sm font-semibold text-sky-700">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Page not found</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          This route is not part of the current Zendora MVP surface.
        </p>
        <Link className="primary-button mt-5 px-4" href="/">
          Go home
        </Link>
      </div>
    </main>
  );
}
