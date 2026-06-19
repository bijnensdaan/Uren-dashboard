"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white"
    >
      <Printer size={16} />
      Print / PDF
    </button>
  );
}
