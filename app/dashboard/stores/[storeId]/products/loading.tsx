export default function ProductsLoading() {
  return (
    <div className="grid gap-5">
      <div className="h-10 w-36 animate-pulse rounded-[8px] bg-slate-200" />
      <section className="glass-panel p-5 sm:p-6">
        <div className="h-4 w-24 animate-pulse rounded-[8px] bg-slate-200" />
        <div className="mt-4 h-8 w-64 max-w-full animate-pulse rounded-[8px] bg-slate-200" />
        <div className="mt-3 h-4 w-full max-w-xl animate-pulse rounded-[8px] bg-slate-200" />
      </section>
      <section className="dashboard-grid">
        {["products", "active", "low-stock", "inventory", "value"].map((item) => (
          <div className="soft-panel p-4" key={item}>
            <div className="h-5 w-5 animate-pulse rounded-[8px] bg-slate-200" />
            <div className="mt-4 h-4 w-24 animate-pulse rounded-[8px] bg-slate-200" />
            <div className="mt-2 h-7 w-20 animate-pulse rounded-[8px] bg-slate-200" />
          </div>
        ))}
      </section>
      <section className="soft-panel overflow-hidden">
        {[1, 2, 3, 4].map((item) => (
          <div className="border-b border-slate-100 p-4 last:border-0" key={item}>
            <div className="h-4 w-52 animate-pulse rounded-[8px] bg-slate-200" />
            <div className="mt-3 h-3 w-72 max-w-full animate-pulse rounded-[8px] bg-slate-100" />
          </div>
        ))}
      </section>
    </div>
  );
}
