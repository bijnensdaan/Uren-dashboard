import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getStatusClass, getStatusLabel, type BudgetStatus } from "@/lib/domain/calculations";
import { formatHours, formatPercent } from "@/lib/utils";

export type ContractStatusRow = {
  id: string;
  code: string;
  name: string;
  budgetHours: number;
  totalHours: number;
  remainingHours: number;
  usagePercentage: number;
  status: BudgetStatus;
};

export function ContractStatusTable({ rows }: { rows: ContractStatusRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
            <th className="py-2 pr-4">Contract</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Budget</th>
            <th className="py-2 pr-4">Gepresteerd</th>
            <th className="py-2 pr-4">Resterend</th>
            <th className="py-2">Verbruik</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 align-middle">
              <td className="py-3 pr-4">
                <Link href={`/contracts/${row.id}`} className="font-semibold text-[var(--primary)] hover:underline">
                  {row.code}
                </Link>
                <div className="text-xs text-[var(--muted)]">{row.name}</div>
              </td>
              <td className="py-3 pr-4">
                <Badge className={getStatusClass(row.status)}>{getStatusLabel(row.status)}</Badge>
              </td>
              <td className="py-3 pr-4">{formatHours(row.budgetHours)}</td>
              <td className="py-3 pr-4">{formatHours(row.totalHours)}</td>
              <td className="py-3 pr-4">{formatHours(row.remainingHours)}</td>
              <td className="min-w-44 py-3">
                <div className="mb-1 flex justify-between text-xs">
                  <span>{formatPercent(row.usagePercentage)}</span>
                </div>
                <Progress value={row.usagePercentage} status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
