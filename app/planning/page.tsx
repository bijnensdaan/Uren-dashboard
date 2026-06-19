import { CalendarRange, CheckCircle2, FileDown, Sparkles, Upload } from "lucide-react";
import {
  approveProjectPlan,
  savePlanAssignments,
  savePlanPhases,
  suggestProjectPlan,
} from "@/app/planning/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import { loadPlanData } from "@/lib/planning-server";
import { formatDate, formatHours } from "@/lib/utils";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export default async function PlanningPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const planId = typeof params.plan === "string" ? params.plan : "";
  const planError = typeof params.planError === "string" ? params.planError : "";
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  const [contracts, recentPlans] = await Promise.all([
    prisma.contract.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.projectPlan.findMany({
      include: { contract: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const data = planId ? await loadPlanData(planId) : null;

  // Maand-rollup van de weekuren voor de samenvatting.
  const monthTotals: Array<{ label: string; hours: number }> = [];
  if (data) {
    const map = new Map<string, number>();
    data.grid.weeks.forEach((week, weekIndex) => {
      const weekSum = data.grid.rows.reduce((sum, row) => sum + row.weeklyHours[weekIndex], 0);
      map.set(week.monthLabel, round1((map.get(week.monthLabel) ?? 0) + weekSum));
    });
    for (const [label, hours] of map) monthTotals.push({ label, hours });
  }

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Planning</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Geautomatiseerde weekplanning per medewerker over de volledige projectduur. Gemini stelt de
          fasering voor; alle uren en capaciteit worden deterministisch berekend.
        </p>
      </div>

      {planError ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-900">{planError}</Card>
      ) : null}

      <Card>
        <CardHeader
          title="Nieuw plan uit contract + opdrachtbrief"
          description="Kies een contract en upload optioneel de opdrachtbrief (PDF/DOCX). Gemini leidt de fasering af; de uren komen uit het budget en de verdeelsleutel."
        />
        {!geminiConfigured ? (
          <p className="mb-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs font-medium text-amber-800">
            Voeg GEMINI_API_KEY toe aan .env om de fasering te laten voorstellen.
          </p>
        ) : null}
        <form
          action={suggestProjectPlan}
          encType="multipart/form-data"
          className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr_170px] lg:items-end"
        >
          <Field label="Contract">
            <select name="contractId" className={inputClass} required>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.code} - {contract.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Opdrachtbrief (optioneel)">
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,text/plain"
              className="h-10 w-full rounded border border-[var(--border)] bg-white px-2 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold"
            />
          </Field>
          <Button type="submit" disabled={!geminiConfigured || contracts.length === 0} className="h-10 w-full">
            <Sparkles size={16} />
            Fasering genereren
          </Button>
        </form>

        {recentPlans.length > 0 ? (
          <div className="mt-5 flex flex-wrap gap-2 text-sm">
            {recentPlans.map((plan) => (
              <a
                key={plan.id}
                href={`/planning?plan=${plan.id}`}
                className={`rounded border px-3 py-2 hover:bg-slate-50 ${
                  plan.id === planId ? "border-[var(--primary)] bg-teal-50" : "border-slate-200 bg-white"
                }`}
              >
                <span className="font-semibold">{plan.contract.code}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">
                  {formatDate(plan.createdAt)} · {plan.status}
                </span>
              </a>
            ))}
          </div>
        ) : null}
      </Card>

      {data ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <span className="font-bold">
                {data.contract.code} - {data.contract.name}
              </span>
              <span className="ml-2 text-[var(--muted)]">
                {formatDate(data.contract.startDate)} – {formatDate(data.contract.endDate)} ·{" "}
                {formatHours(data.plan.totalHours)} budget · {data.grid.weeks.length} weken · status {data.plan.status}
              </span>
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/planning/${data.plan.id}/xlsx`}
                className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
              >
                <FileDown size={16} /> Export (Excel)
              </a>
              <form action={approveProjectPlan}>
                <input type="hidden" name="planId" value={data.plan.id} />
                <Button type="submit" variant={data.plan.status === "approved" ? "secondary" : "primary"}>
                  <CheckCircle2 size={16} />
                  {data.plan.status === "approved" ? "Goedgekeurd" : "Plan goedkeuren"}
                </Button>
              </form>
            </div>
          </div>

          <Card>
            <CardHeader title="Fases" description="Pas naam, periode en gewicht aan. Gewichten worden genormaliseerd tot 100%." />
            {data.overallRationale ? (
              <p className="mb-3 text-sm text-[var(--muted)]">{data.overallRationale}</p>
            ) : null}
            <form action={savePlanPhases} className="grid gap-2">
              <input type="hidden" name="planId" value={data.plan.id} />
              {data.phases.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Geen fases — de uren worden gelijkmatig over de weken verdeeld.</p>
              ) : (
                data.phases.map((phase, index) => (
                  <div key={index} className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-2 md:grid-cols-[1.4fr_0.9fr_0.9fr_0.6fr]">
                    <input name="phaseName" defaultValue={phase.name} className={inputClass} />
                    <input name="phaseStart" type="date" defaultValue={phase.startDate} className={inputClass} />
                    <input name="phaseEnd" type="date" defaultValue={phase.endDate} className={inputClass} />
                    <input name="phaseWeight" type="number" step="0.1" defaultValue={phase.weightPercentage} className={inputClass} />
                  </div>
                ))
              )}
              {data.phases.length > 0 ? (
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary">Fases bewaren</Button>
                </div>
              ) : null}
            </form>
          </Card>

          <Card>
            <CardHeader title="Medewerkertoewijzing" description="Wie werkt mee, met welk relatief gewicht en welke weekcapaciteit." />
            <form action={savePlanAssignments} className="grid gap-2">
              <input type="hidden" name="planId" value={data.plan.id} />
              <div className="grid gap-2">
                {data.employees.map((employee) => {
                  const assignment = data.assignmentById.get(employee.id);
                  return (
                    <div key={employee.id} className="grid items-center gap-2 rounded border border-slate-100 p-2 sm:grid-cols-[1.5fr_auto_120px_140px]">
                      <input type="hidden" name="employeeId" value={employee.id} />
                      <div className="text-sm">
                        <span className="font-medium">{employee.name}</span>
                        <span className="ml-2 text-xs text-[var(--muted)]">{employee.profileCategory.name}</span>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name={`included-${employee.id}`} defaultChecked={assignment?.included ?? true} />
                        Mee
                      </label>
                      <Field label="Gewicht">
                        <input name={`weight-${employee.id}`} type="number" step="0.1" defaultValue={assignment?.weight ?? 1} className={inputClass} />
                      </Field>
                      <Field label="Capaciteit (u/week)">
                        <input
                          name={`capacity-${employee.id}`}
                          type="number"
                          step="0.5"
                          defaultValue={assignment?.capacityOverride ?? employee.weeklyCapacityHours}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button type="submit" variant="secondary">Toewijzing bewaren</Button>
              </div>
            </form>
          </Card>

          {data.grid.capacityWarnings.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <div className="text-sm font-bold text-amber-900">
                {data.grid.capacityWarnings.length} capaciteitswaarschuwing(en)
              </div>
              <ul className="mt-2 grid gap-1 text-xs text-amber-900 sm:grid-cols-2 lg:grid-cols-3">
                {data.grid.capacityWarnings.slice(0, 12).map((warning, index) => (
                  <li key={index}>
                    {warning.employeeName} · {warning.weekLabel}: {formatHours(warning.hours)} &gt; {formatHours(warning.capacity)}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title="Maandoverzicht"
              description={`Totaal geplande uren per maand (weekraster onder). Som = ${formatHours(data.grid.grandTotalHours)}.`}
            />
            <div className="flex flex-wrap gap-2 text-xs">
              {monthTotals.map((month) => (
                <span key={month.label} className="rounded border border-slate-200 bg-white px-2 py-1">
                  {month.label}: <strong>{formatHours(month.hours)}</strong>
                </span>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Weekrooster" description="Geplande uren per medewerker per week. Rode cellen = boven de weekcapaciteit." />
            <div className="overflow-x-auto">
              <table className="text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-300 text-[var(--muted)]">
                    <th className="sticky left-0 z-10 bg-white py-2 pr-3">Medewerker</th>
                    <th className="py-2 pr-3 text-right">Totaal</th>
                    {data.grid.weeks.map((week) => (
                      <th key={week.index} className="px-2 py-2 text-right font-medium whitespace-nowrap">
                        {week.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.grid.rows.map((row) => {
                    const overloaded = new Set(row.overloadedWeeks);
                    return (
                      <tr key={`${row.profileCategoryId}-${row.employeeId}`} className="border-b border-slate-100">
                        <td className="sticky left-0 z-10 bg-white py-2 pr-3 font-medium whitespace-nowrap">
                          {row.employeeName}
                          <span className="ml-2 text-[var(--muted)]">{row.profileName}</span>
                        </td>
                        <td className="py-2 pr-3 text-right font-semibold">{formatHours(row.totalHours)}</td>
                        {row.weeklyHours.map((hours, weekIndex) => (
                          <td
                            key={weekIndex}
                            className={`px-2 py-2 text-right whitespace-nowrap ${
                              overloaded.has(weekIndex) ? "bg-red-100 font-semibold text-red-800" : ""
                            }`}
                          >
                            {hours > 0 ? hours : ""}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
