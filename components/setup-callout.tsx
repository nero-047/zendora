import { KeyRound } from "lucide-react";

export function SetupCallout({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="glass-panel mx-auto flex max-w-xl gap-4 p-5 text-left">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700">
        <KeyRound aria-hidden="true" size={20} />
      </div>
      <div>
        <h1 className="text-lg font-semibold text-slate-950">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </div>
  );
}
