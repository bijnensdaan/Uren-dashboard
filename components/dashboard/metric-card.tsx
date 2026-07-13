import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  helper,
  icon,
  progress,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  icon?: React.ReactNode;
  progress?: number;
  tone?: "default" | "warning" | "critical";
}) {
  const toneClasses = {
    default: "border-slate-200 bg-slate-50 text-[var(--primary)]",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    critical: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-[var(--muted)]">{label}</div>
        {icon ? (
          <span className={cn("flex h-8 w-8 items-center justify-center rounded border", toneClasses)}>
            {icon}
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{helper}</div>
      {typeof progress === "number" ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
          <div
            className={cn(
              "h-full rounded-full",
              tone === "critical"
                ? "bg-red-600"
                : tone === "warning"
                  ? "bg-amber-600"
                  : "bg-[var(--primary)]",
            )}
            style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }}
          />
        </div>
      ) : null}
    </Card>
  );
}
