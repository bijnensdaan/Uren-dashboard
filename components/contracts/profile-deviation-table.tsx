import { Badge } from "@/components/ui/badge";
import { formatHours, formatPercent } from "@/lib/utils";

export type ProfileDeviationRow = {
  profileCategoryId: string;
  profileName: string;
  targetPercentage: number;
  actualHours: number;
  actualPercentage: number;
  deviation: number;
  isDeviation: boolean;
};

export function ProfileDeviationTable({ rows }: { rows: ProfileDeviationRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
            <th className="py-2 pr-4">Profiel</th>
            <th className="py-2 pr-4">Doel</th>
            <th className="py-2 pr-4">Werkelijk</th>
            <th className="py-2 pr-4">Uren</th>
            <th className="py-2">Afwijking</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.profileCategoryId} className="border-b border-slate-100">
              <td className="py-3 pr-4 font-medium">{row.profileName}</td>
              <td className="py-3 pr-4">{formatPercent(row.targetPercentage)}</td>
              <td className="py-3 pr-4">{formatPercent(row.actualPercentage)}</td>
              <td className="py-3 pr-4">{formatHours(row.actualHours)}</td>
              <td className="py-3">
                <Badge
                  className={
                    row.isDeviation
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }
                >
                  {row.deviation > 0 ? "+" : ""}
                  {formatPercent(row.deviation)}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
