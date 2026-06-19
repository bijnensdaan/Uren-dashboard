import { cn } from "@/lib/utils";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("grid gap-1 text-sm font-medium text-slate-700", className)}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-10 rounded border border-[var(--border)] bg-white px-3 text-sm text-slate-950 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-teal-100";
