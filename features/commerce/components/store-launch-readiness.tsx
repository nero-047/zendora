import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, Rocket } from "lucide-react";

import type { StoreLaunchReadiness } from "@/features/commerce/launch-readiness";

const statusStyles = {
  blocking: {
    icon: CircleAlert,
    text: "text-red-700",
    bg: "bg-red-500/10",
    label: "Blocker",
  },
  passed: {
    icon: CheckCircle2,
    text: "text-emerald-700",
    bg: "bg-emerald-500/10",
    label: "Ready",
  },
  warning: {
    icon: AlertTriangle,
    text: "text-amber-700",
    bg: "bg-amber-500/10",
    label: "Review",
  },
} as const;

export function StoreLaunchReadinessPanel({
  readiness,
}: {
  readiness: StoreLaunchReadiness;
}) {
  return (
    <section className="soft-panel overflow-hidden">
      <div className="grid gap-4 border-b border-slate-100 p-5 md:grid-cols-[1fr_auto] md:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-indigo-500/12 text-indigo-700">
            <Rocket aria-hidden="true" size={21} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Launch readiness
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {readiness.blockingCount > 0
                ? `${readiness.blockingCount} blockers and ${readiness.warningCount} warnings`
                : `${readiness.warningCount} warnings remaining`}
            </p>
          </div>
        </div>
        <div className="min-w-48">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-500">Score</span>
            <span className="text-sm font-semibold text-slate-950">
              {readiness.completionPercent}%
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-950"
              style={{ width: `${readiness.completionPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid divide-y divide-slate-100">
        {readiness.checks.map((check) => {
          const style = statusStyles[check.status];
          const Icon = style.icon;
          const content = (
            <>
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] ${style.bg} ${style.text}`}
              >
                <Icon aria-hidden="true" size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-950">{check.label}</span>
                  <span className="status-pill">{style.label}</span>
                </span>
                <span className="mt-1 block text-sm leading-6 text-slate-500">
                  {check.detail}
                </span>
              </span>
            </>
          );

          return check.href ? (
            <Link
              className="flex items-start gap-3 p-4 transition hover:bg-white/55"
              href={check.href}
              key={check.id}
            >
              {content}
            </Link>
          ) : (
            <div className="flex items-start gap-3 p-4" key={check.id}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
