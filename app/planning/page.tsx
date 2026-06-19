import { CalendarRange, CheckCircle2, FileDown, Sparkles, TriangleAlert } from "lucide-react";
import {
  approveProjectPlan,
  savePlanAssignments,
  savePlanPhases,
  suggestProjectPlan,
} from "@/app/planning/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import { loadPlanData } from "@/lib/planning-server";
import { formatDate, formatHours } from "@/lib/utils";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const nf1 = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });
function round1(value: number) {
  return Math.round(value * 10) / 10;
}
function cell(value: number) {
  return value > 0 ? nf1.format(value) : "";
}

export default async function PlanningPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const planId = typeof params.plan === "string" ? params.plan : "";
  const planError = typeof params.planError === "string" ? params.planError : "";
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  const [contracts, recentPlans] = await Promise.all([
    prisma.contract.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.projectPlan.findMany({ include: { contract: true }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  const data = planId ? await loadPlanData(planId) : null;

  // Aggregeer het weekrooster naar maanden voor een leesbaar overzicht.
  let months: string[] = [];
  let groups: Array<{
    profileName: string;
    rows: Array<{ name: string; total: number; monthHours: number[]; monthOverload: boolean[] }>;
    monthSubtotals: number[];
    total: number;
  }> = [];
  let grandMonthTotals: number[] = [];

  if (data) {
    const monthOfWeek = data.grid.weeks.map((week) => week.monthLabel);
    months = monthOfWeek.filter((label, index) => monthOfWeek.indexOf(label) === index);
    const monthIndex = new Map(months.map((label, index) => [label, index]));

    const grouped = new Map<string, (typeof groups)[number]>();
    for (const row of data.grid.rows) {
      const monthHours = months.map(() => 0);
      const monthOverload = months.map(() => false);
      row.weeklyHours.forEach((hours, weekIndex) => {
        const mi = monthIndex.get(monthOfWeek[weekIndex])!;
        monthHours[mi] = round1(monthHours[mi] + hours);
        if (row.overloadedWeeks.includes(weekIndex)) monthOverload[mi] = true;
      });
      const group =
        grouped.get(row.profileName) ??
        { profileName: row.profileName, rows: [], monthSubtotals: months.map(() => 0), total: 0 };
      group.rows.push({ name: row.employeeName, total: row.totalHours, monthHours, monthOverload });
      group.monthSubtotals = group.monthSubtotals.map((value, index) => round1(value + monthHours[index]));
      group.total = round1(group.total + row.totalHours);
      grouped.set(row.profileName, group);
    }
    groups = [...grouped.values()];
    grandMonthTotals = months.map((_, index) =>
      round1(groups.reduce((sum, group) => sum + group.monthSubtotals[index], 0)),
    );
  }

  const budget = data?.plan.totalHours ?? 0;
  const planned = data?.grid.grandTotalHours ?? 0;
  const warnings = data?.grid.capacityWarnings.length ?? 0;

  return (
    <div className="grid gap-6">
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
          title="Nieuw plan genereren"
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
          className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr_180px] lg:items-end"
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
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-2 text-xs font-semibold uppercase text-[var(--muted)]">Recente plannen</div>
            <div className="flex flex-wrap gap-2 text-sm">
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
          </div>
        ) : null}
      </Card>

      {data ? (
        <>
          {/* Samenvattingsband */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-950">
                    {data.contract.code} — {data.contract.name}
                  </h2>
                  <Badge
                    className={
                      data.plan.status === "approved"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-800"
                    }
                  >
                    {data.plan.status === "approved" ? "Goedgekeurd" : "Concept"}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-sm text-[var(--muted)]">
                  <CalendarRange size={15} />
                  {formatDate(data.contract.startDate)} – {formatDate(data.contract.endDate)}
                </div>
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
                    {data.plan.status === "approved" ? "Opnieuw goedkeuren" : "Plan goedkeuren"}
                  </Button>
                </form>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Urenbudget" value={formatHours(budget)} />
              <Stat
                label="Totaal gepland"
                value={formatHours(planned)}
                hint={Math.abs(planned - budget) < 0.5 ? "sluit aan op budget" : "afwijking van budget"}
                hintTone={Math.abs(planned - budget) < 0.5 ? "ok" : "warn"}
              />
              <Stat label="Looptijd" value={`${data.grid.weeks.length} weken`} hint={`${months.length} maanden`} />
              <Stat
                label="Capaciteit"
                value={warnings === 0 ? "In orde" : `${warnings} alert(s)`}
                hintTone={warnings === 0 ? "ok" : "warn"}
                hint={warnings === 0 ? "geen overbelasting" : "overbelasting gevonden"}
              />
            </div>
          </Card>

          {/* Bewerkbare invoer: fases + toewijzing naast elkaar */}
          <div className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader title="Fases" description="Vorm van het project. Gewichten worden genormaliseerd tot 100%." />
              {data.overallRationale ? (
                <p className="mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-[var(--muted)]">
                  {data.overallRationale}
                </p>
              ) : null}
              <form action={savePlanPhases} className="grid gap-3">
                <input type="hidden" name="planId" value={data.plan.id} />
                {data.phases.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Geen fases — de uren worden gelijkmatig over de weken verdeeld.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase text-[var(--muted)]">
                          <th className="pb-2 pr-2 font-medium">Fase</th>
                          <th className="pb-2 pr-2 font-medium">Start</th>
                          <th className="pb-2 pr-2 font-medium">Eind</th>
                          <th className="pb-2 font-medium">Gewicht %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.phases.map((phase, index) => (
                          <tr key={index}>
                            <td className="py-1 pr-2">
                              <input name="phaseName" defaultValue={phase.name} className={`${inputClass} w-full`} />
                            </td>
                            <td className="py-1 pr-2">
                              <input name="phaseStart" type="date" defaultValue={phase.startDate} className={`${inputClass} w-36`} />
                            </td>
                            <td className="py-1 pr-2">
                              <input name="phaseEnd" type="date" defaultValue={phase.endDate} className={`${inputClass} w-36`} />
                            </td>
                            <td className="py-1">
                              <input name="phaseWeight" type="number" step="0.1" defaultValue={phase.weightPercentage} className={`${inputClass} w-20`} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {data.phases.length > 0 ? (
                  <div className="flex justify-end">
                    <Button type="submit" variant="secondary">Fases bewaren</Button>
                  </div>
                ) : null}
              </form>
            </Card>

            <Card>
              <CardHeader title="Medewerkers" description="Wie werkt mee, met welk relatief gewicht en welke weekcapaciteit." />
              <form action={savePlanAssignments} className="grid gap-3">
                <input type="hidden" name="planId" value={data.plan.id} />
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-[var(--muted)]">
                        <th className="pb-2 pr-2 font-medium">Medewerker</th>
                        <th className="pb-2 pr-2 text-center font-medium">Mee</th>
                        <th className="pb-2 pr-2 font-medium">Gewicht</th>
                        <th className="pb-2 font-medium">Capaciteit u/week</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.employees.map((employee) => {
                        const assignment = data.assignmentById.get(employee.id);
                        return (
                          <tr key={employee.id} className="border-t border-slate-100">
                            <input type="hidden" name="employeeId" value={employee.id} />
                            <td className="py-2 pr-2">
                              <div className="font-medium">{employee.name}</div>
                              <div className="text-xs text-[var(--muted)]">{employee.profileCategory.name}</div>
                            </td>
                            <td className="py-2 pr-2 text-center">
                              <input type="checkbox" name={`included-${employee.id}`} defaultChecked={assignment?.included ?? true} />
                            </td>
                            <td className="py-2 pr-2">
                              <input name={`weight-${employee.id}`} type="number" step="0.1" defaultValue={assignment?.weight ?? 1} className={`${inputClass} w-20`} />
                            </td>
                            <td className="py-2">
                              <input
                                name={`capacity-${employee.id}`}
                                type="number"
                                step="0.5"
                                defaultValue={assignment?.capacityOverride ?? employee.weeklyCapacityHours}
                                className={`${inputClass} w-24`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary">Toewijzing bewaren</Button>
                </div>
              </form>
            </Card>
          </div>

          {warnings > 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <TriangleAlert size={16} />
                {warnings} capaciteitswaarschuwing(en)
              </div>
              <ul className="mt-2 grid gap-1 text-xs text-amber-900 sm:grid-cols-2 lg:grid-cols-3">
                {data.grid.capacityWarnings.slice(0, 12).map((warning, index) => (
                  <li key={index}>
                    {warning.employeeName} · {warning.weekLabel}: {formatHours(warning.hours)} &gt;{" "}
                    {formatHours(warning.capacity)}
                  </li>
                ))}
                {warnings > 12 ? <li>… en {warnings - 12} meer</li> : null}
              </ul>
            </Card>
          ) : null}

          {/* Hoofdoverzicht: maandrooster per medewerker */}
          <Card>
            <CardHeader
              title="Maandplanning per medewerker"
              description="Geplande uren per maand. Een rood vlak betekent dat er in die maand minstens één week boven de capaciteit gepland staat — het weekdetail zit in de Excel-export."
            />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-xs uppercase text-[var(--muted)]">
                    <th className="sticky left-0 z-10 bg-white py-2 pr-4">Medewerker</th>
                    <th className="py-2 pr-4 text-right">Totaal</th>
                    {months.map((month) => (
                      <th key={month} className="px-3 py-2 text-right font-medium whitespace-nowrap">
                        {month}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <ProfileGroup key={group.profileName} group={group} />
                  ))}
                  <tr className="border-t-2 border-slate-400 bg-slate-50 font-bold">
                    <td className="sticky left-0 z-10 bg-slate-50 py-2 pr-4">Totaal</td>
                    <td className="py-2 pr-4 text-right">{formatHours(planned)}</td>
                    {grandMonthTotals.map((value, index) => (
                      <td key={index} className="px-3 py-2 text-right">{cell(value)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  hintTone,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "ok" | "warn";
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3">
      <div className="text-xs uppercase text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-950">{value}</div>
      {hint ? (
        <div
          className={`mt-0.5 text-xs ${
            hintTone === "warn" ? "text-amber-700" : hintTone === "ok" ? "text-emerald-700" : "text-[var(--muted)]"
          }`}
        >
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ProfileGroup({
  group,
}: {
  group: {
    profileName: string;
    rows: Array<{ name: string; total: number; monthHours: number[]; monthOverload: boolean[] }>;
    monthSubtotals: number[];
    total: number;
  };
}) {
  const nf = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });
  return (
    <>
      <tr className="bg-slate-100/70 text-xs font-semibold uppercase text-slate-600">
        <td className="sticky left-0 z-10 bg-slate-100/70 py-1.5 pr-4">{group.profileName}</td>
        <td className="py-1.5 pr-4 text-right">{nf.format(group.total)} u</td>
        {group.monthSubtotals.map((value, index) => (
          <td key={index} className="px-3 py-1.5 text-right">{value > 0 ? nf.format(value) : ""}</td>
        ))}
      </tr>
      {group.rows.map((row) => (
        <tr key={row.name} className="border-b border-slate-100">
          <td className="sticky left-0 z-10 bg-white py-2 pr-4 pl-3 whitespace-nowrap">{row.name}</td>
          <td className="py-2 pr-4 text-right font-semibold">{nf.format(row.total)} u</td>
          {row.monthHours.map((value, index) => (
            <td
              key={index}
              className={`px-3 py-2 text-right whitespace-nowrap ${
                row.monthOverload[index] ? "bg-red-100 font-semibold text-red-800" : ""
              }`}
              title={row.monthOverload[index] ? "Boven capaciteit in minstens één week" : undefined}
            >
              {value > 0 ? nf.format(value) : ""}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
