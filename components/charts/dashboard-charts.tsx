"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatHours, formatPercent } from "@/lib/utils";

const colors = ["#246b73", "#6a7f2b", "#b76e00", "#8b5cf6", "#0f766e"];

export function BudgetBarChart({
  data,
}: {
  data: Array<{ name: string; gebruikt: number; resterend: number }>;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="gebruikt" stackId="a" fill="#246b73" />
          <Bar dataKey="resterend" stackId="a" fill="#c9d7dc" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProfilePieChart({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={2}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProfileBudgetChart({
  data,
}: {
  data: Array<{ name: string; hours: number; sharePercentage: number }>;
}) {
  if (data.length === 0 || data.every((item) => item.hours <= 0)) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-[var(--muted)]">
        Geen verdeelsleutel beschikbaar voor de huidige selectie.
      </div>
    );
  }

  return (
    <div className="grid h-72 content-center gap-3 overflow-y-auto pr-1">
      {data.map((item, index) => (
        <div key={item.name} className="grid gap-1.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold text-slate-950">{item.name}</span>
            <span className="shrink-0 text-xs font-semibold text-slate-600">
              {formatHours(item.hours)} - {formatPercent(item.sharePercentage)}
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full rounded"
              style={{
                width: `${Math.max(item.sharePercentage, item.hours > 0 ? 2 : 0)}%`,
                backgroundColor: colors[index % colors.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
