import { cn } from "@/lib/utils";

export function Progress({
  value,
  status = "normal",
}: {
  value: number;
  status?: "normal" | "warning" | "critical";
}) {
  const width = Math.max(0, Math.min(value, 100));
  return (
    <div className="h-2.5 overflow-hidden rounded bg-slate-100">
      <div
        className={cn(
          "h-full rounded transition-all",
          status === "normal" && "bg-emerald-600",
          status === "warning" && "bg-amber-500",
          status === "critical" && "bg-red-600",
        )}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
