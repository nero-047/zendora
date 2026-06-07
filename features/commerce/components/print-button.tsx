"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button className="secondary-button px-4 text-sm" onClick={() => window.print()} type="button">
      <Printer aria-hidden="true" size={16} />
      {label}
    </button>
  );
}
