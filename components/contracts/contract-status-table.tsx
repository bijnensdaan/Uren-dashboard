"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
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

type SortKey = "code" | "status" | "budgetHours" | "totalHours" | "remainingHours" | "usagePercentage";
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection } | null;

const statusRank: Record<BudgetStatus, number> = { normal: 0, warning: 1, critical: 2 };

function compareRows(a: ContractStatusRow, b: ContractStatusRow, key: SortKey) {
  if (key === "code") return a.code.localeCompare(b.code, "nl-BE");
  if (key === "status") return statusRank[a.status] - statusRank[b.status];
  return a[key] - b[key];
}

/** Klikbare kolomkop met richtingindicator; derde klik herstelt de standaardvolgorde. */
function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase hover:text-slate-900 ${active ? "text-slate-900" : ""}`}
        title={`Sorteer op ${label.toLowerCase()}`}
      >
        {label}
        {active ? (
          sort!.direction === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : (
          <ArrowUpDown size={12} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

export function ContractStatusTable({ rows }: { rows: ContractStatusRow[] }) {
  const [sort, setSort] = useState<SortState>(null);

  // Klikcyclus per kolom: oplopend -> aflopend -> standaardvolgorde.
  const handleSort = (key: SortKey) => {
    setSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const result = compareRows(a, b, sort.key);
      return sort.direction === "asc" ? result : -result;
    });
    return copy;
  }, [rows, sort]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
            <SortableHeader label="Contract" sortKey="code" sort={sort} onSort={handleSort} className="py-2 pr-4" />
            <SortableHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} className="py-2 pr-4" />
            <SortableHeader label="Budget" sortKey="budgetHours" sort={sort} onSort={handleSort} className="py-2 pr-4" />
            <SortableHeader label="Gepresteerd" sortKey="totalHours" sort={sort} onSort={handleSort} className="py-2 pr-4" />
            <SortableHeader label="Resterend" sortKey="remainingHours" sort={sort} onSort={handleSort} className="py-2 pr-4" />
            <SortableHeader label="Verbruik" sortKey="usagePercentage" sort={sort} onSort={handleSort} className="py-2" />
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
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
