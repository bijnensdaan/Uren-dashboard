import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, UserRound } from "lucide-react";
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
  insight?: {
    summary: string;
    actionHref: string;
    topTasks: Array<{ name: string; hours: number; sharePercentage: number }>;
    topEmployees: Array<{ name: string; hours: number; sharePercentage: number }>;
  };
};

function ContributionList({
  icon,
  title,
  items,
  emptyLabel,
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<{ name: string; hours: number; sharePercentage: number }>;
  emptyLabel: string;
}) {
  return (
    <div className="rounded border border-slate-100 bg-slate-50 p-3">
      <div className="mb-2 flex items-center gap-2 font-semibold text-slate-950">
        {icon}
        {title}
      </div>
      <div className="grid gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item.name} className="flex justify-between gap-3 rounded bg-white px-2 py-1.5">
              <span className="truncate">{item.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-slate-950">
                {formatHours(item.hours)} - {formatPercent(item.sharePercentage)}
              </span>
            </div>
          ))
        ) : (
          <span className="text-[var(--muted)]">{emptyLabel}</span>
        )}
      </div>
    </div>
  );
}

export function ProfileDeviationTable({ rows }: { rows: ProfileDeviationRow[] }) {
  return (
    <div className="overflow-hidden rounded border border-slate-200">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <th className="px-3 py-3">Profiel</th>
              <th className="px-3 py-3 text-right">Doel</th>
              <th className="px-3 py-3 text-right">Werkelijk</th>
              <th className="px-3 py-3 text-right">Uren</th>
              <th className="px-3 py-3 text-right">Afwijking</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.profileCategoryId}>
                <tr className="border-b border-slate-100 bg-white">
                  <td className="px-3 py-3 font-semibold text-slate-950">{row.profileName}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatPercent(row.targetPercentage)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatPercent(row.actualPercentage)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatHours(row.actualHours)}</td>
                  <td className="px-3 py-3 text-right">
                    <Badge
                      className={
                        row.isDeviation
                          ? "min-w-16 justify-center border-red-200 bg-red-50 text-red-800"
                          : "min-w-16 justify-center border-emerald-200 bg-emerald-50 text-emerald-800"
                      }
                    >
                      {row.deviation > 0 ? "+" : ""}
                      {formatPercent(row.deviation)}
                    </Badge>
                  </td>
                </tr>

                {row.isDeviation && row.insight ? (
                  <tr className="border-b border-slate-100">
                    <td colSpan={5} className="bg-slate-50 p-3">
                      <div className="rounded border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="grid gap-4 text-xs text-slate-700 lg:grid-cols-[1.25fr_1fr_1fr]">
                          <div>
                            <div className="mb-2 inline-flex rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                              Analyse
                            </div>
                            <div className="font-semibold text-slate-950">Waarom valt dit op?</div>
                            <p className="mt-1 max-w-prose leading-5">{row.insight.summary}</p>
                            <Link
                              href={row.insight.actionHref}
                              className="mt-3 inline-flex items-center gap-1 font-bold text-[var(--primary)] hover:underline"
                            >
                              Bekijk onderliggende uren
                              <ArrowRight size={13} />
                            </Link>
                          </div>

                          <ContributionList
                            icon={<BriefcaseBusiness size={14} />}
                            title="Grootste taken"
                            items={row.insight.topTasks}
                            emptyLabel="Geen taken gevonden."
                          />

                          <ContributionList
                            icon={<UserRound size={14} />}
                            title="Grootste medewerkers"
                            items={row.insight.topEmployees}
                            emptyLabel="Geen medewerkers gevonden."
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
