import { Badge } from "@/components/ui/badge";

/**
 * Gedeelde presentatie-helpers voor de beheersecties (components/admin/*).
 * Allemaal server-side: geen "use client".
 */

export function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** Convert bytes to a human-readable size string in nl-BE style (e.g. "12 KB", "1,3 MB"). */
export function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString("nl-BE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} MB`;
}

/** Derive a short type label from a MIME type. */
export function mimeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "Word";
  if (mimeType === "text/plain") return "Tekst";
  return "Bestand";
}

export function statusBadge(active: boolean) {
  return (
    <Badge
      className={
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }
    >
      {active ? "Actief" : "Inactief"}
    </Badge>
  );
}

/** Small tooltip helper — rendered as a hoverable (?) */
export function Tip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 cursor-help rounded-full border border-slate-300 px-1 text-xs text-slate-400 select-none"
      aria-label={text}
    >
      ?
    </span>
  );
}

/**
 * Like Field but accepts ReactNode for the label so we can embed <Tip>.
 * Renders identically to Field (same Tailwind classes).
 */
export function LabeledField({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Inklapbare sub-sectie binnen een contract-accordion */
export function SubCard({
  title,
  helper,
  children,
  defaultOpen = false,
}: {
  title: React.ReactNode;
  helper: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded border border-slate-200 bg-slate-50"
    >
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 rounded px-4 py-3 hover:bg-slate-100 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center text-sm font-bold text-slate-800">
          {title}
        </span>
        <span className="text-xs text-[var(--muted)] transition group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="border-t border-slate-200 p-4">
        <p className="mb-3 text-xs text-[var(--muted)]">{helper}</p>
        {children}
      </div>
    </details>
  );
}
