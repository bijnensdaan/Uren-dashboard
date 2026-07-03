"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Burn-up-grafiek: cumulatief werkelijk vs. cumulatief gepland, met het vaste
 * urenbudget als horizontale referentielijn. De data komt volledig uit
 * lib/domain/progress.ts (deterministisch); dit component tekent alleen.
 */
export function BurnupChart({
  data,
  budgetHours,
}: {
  data: Array<{ name: string; werkelijk: number | null; gepland: number | null }>;
  budgetHours: number;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-[var(--muted)]">
        Geen looptijd beschikbaar voor deze opdrachtbrief.
      </div>
    );
  }

  const maxValue = Math.max(
    budgetHours,
    ...data.map((point) => Math.max(point.werkelijk ?? 0, point.gepland ?? 0)),
  );

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} minTickGap={28} />
          <YAxis tick={{ fontSize: 12 }} domain={[0, Math.ceil(maxValue * 1.1)]} allowDecimals={false} />
          <Tooltip />
          <Legend />
          <ReferenceLine
            y={budgetHours}
            stroke="#b91c1c"
            strokeDasharray="6 4"
            label={{ value: "Budget", position: "insideTopRight", fontSize: 12, fill: "#b91c1c" }}
          />
          <Line
            type="monotone"
            dataKey="gepland"
            name="Gepland (cumulatief)"
            stroke="#b76e00"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="werkelijk"
            name="Werkelijk (cumulatief)"
            stroke="#246b73"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
