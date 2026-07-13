"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
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

export function BudgetTimelineChart({
  data,
  hasActualData,
}: {
  data: Array<{
    label: string;
    gepland: number;
    werkelijk: number | null;
    prognose: number | null;
  }>;
  hasActualData: boolean;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-[var(--muted)]">
        Kies een opdrachtbrief om de voortgang in de tijd te bekijken.
      </div>
    );
  }

  return (
    <div>
      {!hasActualData ? (
        <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Nog geen uren geregistreerd. De geplande budgetlijn is al zichtbaar; werkelijk en prognose verschijnen zodra uren zijn toegevoegd.
        </div>
      ) : null}
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} width={46} />
            <Tooltip formatter={(value) => formatHours(Number(value ?? 0))} />
            <Legend />
            <Line
              type="monotone"
              dataKey="gepland"
              stroke="#94a3b8"
              strokeDasharray="6 4"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="werkelijk"
              stroke="#246b73"
              strokeWidth={3}
              connectNulls={false}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="prognose"
              stroke="#b76e00"
              strokeDasharray="4 4"
              strokeWidth={2}
              connectNulls={false}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ProfileMixComparison({
  data,
}: {
  data: Array<{
    name: string;
    targetPercentage: number;
    actualPercentage: number;
    deviation: number;
  }>;
}) {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-300" /> Doel
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--primary)]" /> Werkelijk
        </span>
      </div>
      {data.map((item) => {
        const isMaterial = Math.abs(item.deviation) > 3;
        return (
          <div key={item.name} className="grid gap-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-950">{item.name}</span>
              <span className={isMaterial ? "font-bold text-amber-700" : "text-slate-600"}>
                {item.deviation > 0 ? "+" : ""}{formatPercent(item.deviation)}
              </span>
            </div>
            <div className="grid gap-1">
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-slate-300" style={{ width: `${Math.max(item.targetPercentage, 1)}%` }} />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${Math.max(item.actualPercentage, item.actualPercentage > 0 ? 1 : 0)}%` }} />
              </div>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Doel {formatPercent(item.targetPercentage)}</span>
              <span>Werkelijk {formatPercent(item.actualPercentage)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
