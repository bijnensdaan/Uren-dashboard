"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded border border-[var(--primary)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--primary-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : null}
      {pending ? "Bezig met opslaan..." : label}
    </button>
  );
}
