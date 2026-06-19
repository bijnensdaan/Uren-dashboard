import { Card } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card>
      <div className="text-sm font-medium text-[var(--muted)]">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-[var(--muted)]">{helper}</div>
    </Card>
  );
}
