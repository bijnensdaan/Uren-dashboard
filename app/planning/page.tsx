import {
  CalendarRange,
  CheckCircle2,
  FileDown,
  Lightbulb,
  PencilLine,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  approveProjectPlan,
  savePlanAssignments,
  savePlanPhases,
  suggestProjectPlan,
} from "@/app/planning/actions";
import { DocumentSourcePicker } from "@/components/documents/document-source-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { HelpTip } from "@/components/ui/help-tip";
import { PendingSkeleton, SubmitButton } from "@/components/ui/pending-feedback";
import { SaveButton } from "@/components/planning/save-button";
import { prisma } from "@/lib/db";
import { loadPlanData } from "@/lib/planning-server";
import { type Phase, type PlanGridRow, type WeekBucket, hoursToDays } from "@/lib/domain/planning";
import { formatDate, formatHours } from "@/lib/utils";

type PageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

const nf1 = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 1 });
function round1(value: number) {
  return Math.round(value * 10) / 10;
}
function cell(value: number) {
  return value > 0 ? nf1.format(value) : "";
}

/** Bepaal welke stap actief is (0-gebaseerd: 0, 1, 2). */
function activeStep(planStatus: string | null): number {
  if (!planStatus) return 0;
  if (planStatus === "approved") return 2;
  return 1;
}

type PhaseProfileBreakdown = {
  phase: Phase;
  phaseIndex: number;
  profileRows: Array<{ profileName: string; hours: number; days: number }>;
  totalHours: number;
  totalDays: number;
};

/**
 * Berekent deterministisch hoeveel uren per fase per profiel gepland staan,
 * rechtstreeks uit het week-rooster (PlanGridRow.weeklyHours). Per week bepalen
 * we welke fase het meeste gewicht heeft op basis van de overlap-contributie
 * die de engine ook gebruikt. Zo sluiten de aantallen exact aan op het budget.
 */
function computePhaseBreakdown(
  phases: Phase[],
  weeks: WeekBucket[],
  rows: PlanGridRow[],
): PhaseProfileBreakdown[] {
  if (phases.length === 0 || weeks.length === 0) return [];

  const DAY_MS = 86400000;
  function atMidnight(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function overlapDays(aS: Date, aE: Date, bS: Date, bE: Date) {
    const s = Math.max(aS.getTime(), bS.getTime());
    const e = Math.min(aE.getTime(), bE.getTime());
    if (e < s) return 0;
    return Math.floor((e - s) / DAY_MS) + 1;
  }

  // weekPhaseIndex[w] = index van de dominante fase voor week w (-1 = geen fase)
  const weekPhaseIndex: number[] = weeks.map((week) => {
    let bestPhase = -1;
    let bestContrib = -1;
    for (let p = 0; p < phases.length; p++) {
      const phase = phases[p];
      const pStart = atMidnight(new Date(phase.startDate));
      const pEnd = atMidnight(new Date(phase.endDate));
      if (Number.isNaN(pStart.getTime()) || Number.isNaN(pEnd.getTime()) || pEnd < pStart) continue;
      const phaseDays = overlapDays(pStart, pEnd, pStart, pEnd);
      const weight = Number(phase.weightPercentage);
      if (phaseDays <= 0 || !Number.isFinite(weight) || weight <= 0) continue;
      const overlap = overlapDays(week.weekStart, week.weekEnd, pStart, pEnd);
      if (overlap <= 0) continue;
      const contrib = weight * (overlap / phaseDays);
      if (contrib > bestContrib) {
        bestContrib = contrib;
        bestPhase = p;
      }
    }
    return bestPhase;
  });

  // Bewaar de volgorde van profielen zoals ze in het rooster voorkomen.
  const profileOrder: string[] = [];
  const profilesSeen = new Set<string>();
  for (const row of rows) {
    if (!profilesSeen.has(row.profileName)) {
      profileOrder.push(row.profileName);
      profilesSeen.add(row.profileName);
    }
  }

  // phaseHours[phaseIdx] = Map<profileName, totaalUren>
  const phaseHours: Map<string, number>[] = phases.map(() => new Map());

  for (const row of rows) {
    row.weeklyHours.forEach((hours, w) => {
      const phaseIdx = weekPhaseIndex[w];
      if (phaseIdx < 0) return;
      const map = phaseHours[phaseIdx];
      map.set(row.profileName, (map.get(row.profileName) ?? 0) + hours);
    });
  }

  return phases.map((phase, phaseIndex) => {
    const map = phaseHours[phaseIndex];
    const profileRows = profileOrder
      .map((profileName) => {
        const hours = Math.round((map.get(profileName) ?? 0) * 10) / 10;
        return { profileName, hours, days: hoursToDays(hours) };
      })
      .filter((pr) => pr.hours > 0);
    const totalHours = Math.round(profileRows.reduce((sum, pr) => sum + pr.hours, 0) * 10) / 10;
    return { phase, phaseIndex, profileRows, totalHours, totalDays: hoursToDays(totalHours) };
  });
}

export default async function PlanningPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const planId = typeof params.plan === "string" ? params.plan : "";
  const planError = typeof params.planError === "string" ? params.planError : "";
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);

  const [contracts, recentPlans, allDocuments] = await Promise.all([
    prisma.contract.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.projectPlan.findMany({ include: { contract: true }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.document.findMany({ orderBy: { uploadedAt: "desc" } }),
  ]);

  // Groepeer documenten per contract voor de picker
  const documentsByContract: Record<string, { id: string; fileName: string; mimeType: string; uploadedAt: string }[]> = {};
  for (const doc of allDocuments) {
    if (!documentsByContract[doc.contractId]) documentsByContract[doc.contractId] = [];
    documentsByContract[doc.contractId].push({
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt.toISOString(),
    });
  }

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

  // Bereken per-fase per-profiel uren (deterministisch uit het grid).
  const phaseBreakdown = data
    ? computePhaseBreakdown(data.phases, data.grid.weeks, data.grid.rows)
    : [];

  const budget = data?.plan.totalHours ?? 0;
  const planned = data?.grid.grandTotalHours ?? 0;
  const warnings = data?.grid.capacityWarnings.length ?? 0;
  const step = activeStep(data?.plan.status ?? null);

  return (
    <div className="grid gap-6">
      {/* Paginakop */}
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Planning</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          De planning verdeelt het urenbudget van een contract automatisch over de medewerkers en weken.
          De AI stelt de vorm van het project voor (fasering); de uren en capaciteit worden daarna exact
          berekend op basis van het budget en de verdeelsleutel zonder schattingen.
        </p>
      </div>

      {/* Zo werkt het: 3-stappen strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            num: 1,
            icon: <Sparkles size={16} />,
            title: "Genereer een planning",
            desc: "Kies een contract en laat de AI een eerste opzet maken.",
          },
          {
            num: 2,
            icon: <PencilLine size={16} />,
            title: "Pas aan waar nodig",
            desc: "Bewerk de fases en medewerkers. Sla op om de berekening te vernieuwen.",
          },
          {
            num: 3,
            icon: <CheckCircle2 size={16} />,
            title: "Keur de planning goed",
            desc: "Markeer de planning als definitief zodat iedereen de vastgestelde versie ziet.",
          },
        ].map(({ num, icon, title, desc }) => {
          const isActive = step === num - 1;
          return (
            <div
              key={num}
              className={`flex gap-3 rounded border p-4 ${
                isActive
                  ? "border-[var(--primary)] bg-teal-50"
                  : "border-slate-200 bg-white opacity-60"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  isActive ? "bg-[var(--primary)] text-white" : "bg-slate-200 text-slate-600"
                }`}
              >
                {isActive ? icon : num}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-950">{title}</div>
                <div className="mt-0.5 text-xs text-[var(--muted)]">{desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      {planError ? (
        <Card className="border-red-200 bg-red-50 text-sm text-red-900">{planError}</Card>
      ) : null}

      {/* Plan genereren */}
      <DocumentSourcePicker
        contracts={contracts.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        documentsByContract={documentsByContract}
        action={suggestProjectPlan}
        geminiConfigured={geminiConfigured}
        submitLabel="Fasering genereren"
      />

      {recentPlans.length > 0 ? (
        <Card className="py-3">
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
                  {formatDate(plan.createdAt)} &middot; {plan.status === "approved" ? "Goedgekeurd" : "Concept"}
                </span>
              </a>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Lege staat: geen plan geselecteerd */}
      {!data && !planError ? (
        <div className="flex flex-col items-center gap-3 rounded border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-[var(--primary)]">
            <Lightbulb size={24} />
          </div>
          <h2 className="text-base font-semibold text-slate-950">Nog geen planning geselecteerd</h2>
          <p className="max-w-md text-sm text-[var(--muted)]">
            Een planning verdeelt het urenbudget van een contract week voor week over de betrokken
            medewerkers. Kies hierboven een contract en klik op <strong>Planning genereren</strong> om
            te starten, of open een recente planning via de links hierboven.
          </p>
        </div>
      ) : null}

      {data ? (
        <>
          {/* Samenvattingsband */}
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-950">
                    {data.contract.code} {" -- "} {data.contract.name}
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
                  {formatDate(data.contract.startDate)} {" – "} {formatDate(data.contract.endDate)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`/api/planning/${data.plan.id}/xlsx`}
                  className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                >
                  <FileDown size={16} /> Export (Excel)
                </a>
                <div className="flex flex-col items-end gap-1">
                  <form action={approveProjectPlan}>
                    <input type="hidden" name="planId" value={data.plan.id} />
                    <SubmitButton
                      type="submit"
                      variant={data.plan.status === "approved" ? "secondary" : "primary"}
                      pendingLabel="Goedkeuren..."
                    >
                      <CheckCircle2 size={16} />
                      {data.plan.status === "approved" ? "Opnieuw goedkeuren" : "Plan goedkeuren"}
                    </SubmitButton>
                    <PendingSkeleton
                      title="Planning wordt goedgekeurd"
                      description="De status wordt bijgewerkt en het overzicht wordt ververst."
                      lines={2}
                      className="mt-2"
                    />
                  </form>
                  <p className="text-right text-xs text-[var(--muted)]">
                    Markeert de planning als definitief. Je kunt later opnieuw goedkeuren na wijzigingen.
                  </p>
                </div>
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

          {/* Bewerkbare invoer: fases + toewijzing */}
          <div className="grid gap-5 xl:grid-cols-2">
            {/* Fases */}
            <Card>
              <div className="mb-4">
                <h2 className="flex items-center text-base font-bold text-slate-950">
                  Fasering
                  <HelpTip tip="De fasering verdeelt het project in periodes (bijv. opstart, uitvoering, afronding). Elke fase krijgt een gewicht dat bepaalt hoeveel uren er in die periode gepland worden." />
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Verdeel het project in periodes. Wijzigingen worden pas toegepast nadat je op Bewaren klikt.
                </p>
              </div>
              {data.overallRationale ? (
                <p className="mb-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-[var(--muted)]">
                  {data.overallRationale}
                </p>
              ) : null}
              <form action={savePlanPhases} className="grid gap-3">
                <input type="hidden" name="planId" value={data.plan.id} />
                {data.phases.length === 0 ? (
                  <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm text-[var(--muted)]">
                    Geen fases ingesteld. De uren worden gelijkmatig over alle weken verdeeld. Genereer
                    een nieuw plan om automatisch fases te laten voorstellen.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="text-xs uppercase text-[var(--muted)]">
                          <th className="pb-2 pr-2 font-medium">Fase</th>
                          <th className="pb-2 pr-2 font-medium">Start</th>
                          <th className="pb-2 pr-2 font-medium">Eind</th>
                          <th className="pb-2 font-medium">
                            <span className="flex items-center">
                              Gewicht %
                              <HelpTip tip="Het relatieve gewicht bepaalt welk deel van de uren in deze fase valt. De gewichten worden automatisch herschaald zodat ze samen 100% vormen." />
                            </span>
                          </th>
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
                  <>
                    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                      <p className="text-xs text-[var(--muted)]">
                        Gewichten worden automatisch herschaald naar 100%.
                      </p>
                      <SaveButton label="Fases bewaren" />
                    </div>
                    <PendingSkeleton
                      title="Fasering wordt bewaard"
                      description="De planning wordt opnieuw berekend op basis van de aangepaste fases."
                      lines={3}
                    />
                  </>
                ) : null}
              </form>
            </Card>

            {/* Medewerkers */}
            <Card>
              <CardHeader
                title="Medewerkers"
                description="Wie neemt deel aan dit project, hoeveel uren per week, en met welk aandeel. Wijzigingen worden pas toegepast nadat je op Bewaren klikt."
              />
              <form action={savePlanAssignments} className="grid gap-3">
                <input type="hidden" name="planId" value={data.plan.id} />
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-[var(--muted)]">
                        <th className="pb-2 pr-2 font-medium">Medewerker</th>
                        <th className="pb-2 pr-2 text-center font-medium">
                          <span className="flex items-center justify-center gap-1">
                            Meenemen
                            <HelpTip tip="Vink uit om deze medewerker buiten deze planning te houden. De medewerker blijft in het systeem maar krijgt geen uren toegewezen in dit project." />
                          </span>
                        </th>
                        <th className="pb-2 pr-2 font-medium">
                          <span className="flex items-center">
                            Aandeel
                            <HelpTip tip="Het relatieve aandeel van deze medewerker t.o.v. de andere medewerkers binnen hetzelfde profiel. Aandeel 2 = dubbel zoveel uren als aandeel 1." />
                          </span>
                        </th>
                        <th className="pb-2 font-medium">
                          <span className="flex items-center">
                            Max. u/week
                            <HelpTip tip="Het maximum aantal uren dat deze medewerker per week aan dit project kan besteden. Als het berekende aantal hierboven uitkomt, verschijnt er een waarschuwing." />
                          </span>
                        </th>
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
                              <input
                                type="checkbox"
                                name={`included-${employee.id}`}
                                defaultChecked={assignment?.included ?? true}
                              />
                            </td>
                            <td className="py-2 pr-2">
                              <input
                                name={`weight-${employee.id}`}
                                type="number"
                                step="0.1"
                                defaultValue={assignment?.weight ?? 1}
                                className={`${inputClass} w-20`}
                              />
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
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <p className="text-xs text-[var(--muted)]">
                    Niet-meegenomen medewerkers krijgen geen uren in dit project.
                  </p>
                  <SaveButton label="Toewijzing bewaren" />
                </div>
                <PendingSkeleton
                  title="Toewijzing wordt bewaard"
                  description="De geplande uren worden opnieuw verdeeld over medewerkers en weken."
                  lines={3}
                />
              </form>
            </Card>
          </div>

          {warnings > 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <TriangleAlert size={16} />
                {warnings} capaciteitswaarschuwing(en)
                <HelpTip tip="Overbelasting: in deze weken staan er meer uren gepland dan de medewerker aankan. Verlaag het aandeel, verhoog de capaciteit, of neem extra medewerkers mee." />
              </div>
              <p className="mt-1 text-xs text-amber-900">
                Er zijn meer uren gepland dan sommige medewerkers per week aankunnen. Het volledige
                weekdetail staat in de Excel-export.
              </p>
              <ul className="mt-2 grid gap-1 text-xs text-amber-900 sm:grid-cols-2 lg:grid-cols-3">
                {data.grid.capacityWarnings.slice(0, 12).map((warning, index) => (
                  <li key={index}>
                    {warning.employeeName} &middot; {warning.weekLabel}: {formatHours(warning.hours)} &gt;{" "}
                    {formatHours(warning.capacity)}
                  </li>
                ))}
                {warnings > 12 ? <li>en {warnings - 12} meer</li> : null}
              </ul>
            </Card>
          ) : null}

          {/* Planning per fase: leesbaar overzicht voor niet-technische gebruiker */}
          <Card>
            <CardHeader
              title="Planning per fase"
              description="Hoeveel uren en dagen er per fase ingepland staan, uitgesplitst per profiel. De aantallen volgen rechtstreeks uit het urenbudget en de fasering, zonder schattingen."
            />
            {phaseBreakdown.length === 0 ? (
              <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-[var(--muted)]">
                <p>
                  Er zijn nog geen fases ingesteld. De uren worden op dit moment gelijkmatig over alle weken
                  verdeeld. Upload een opdrachtbrief of genereer een nieuw plan om automatisch fases te laten
                  voorstellen, zodat je hier precies ziet welke werkzaamheden wanneer plaatsvinden.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {data.overallRationale ? (
                  <p className="rounded border border-slate-200 bg-slate-50 p-3 text-sm italic text-[var(--muted)]">
                    {data.overallRationale}
                  </p>
                ) : null}
                {phaseBreakdown.map(({ phase, phaseIndex, profileRows, totalHours, totalDays }) => (
                  <div key={phaseIndex} className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border-b border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-xs font-bold text-white">
                          {phaseIndex + 1}
                        </span>
                        <span className="text-base font-bold text-slate-950">{phase.name}</span>
                        <Badge className="border-[var(--primary)]/20 bg-teal-50 text-teal-800">
                          {phase.weightPercentage}%
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
                        <CalendarRange size={14} />
                        <span>{formatDate(phase.startDate)} {" - "} {formatDate(phase.endDate)}</span>
                      </div>
                    </div>
                    <div className="px-4 py-3">
                      {phase.rationale ? (
                        <p className="mb-3 text-sm text-[var(--muted)]">{phase.rationale}</p>
                      ) : null}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 text-xs uppercase text-[var(--muted)]">
                              <th className="pb-2 pr-4 font-medium">Profiel</th>
                              <th className="pb-2 pr-4 text-right font-medium">Uren</th>
                              <th className="pb-2 text-right font-medium">Dagen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {profileRows.map((pr) => (
                              <tr key={pr.profileName} className="border-b border-slate-50">
                                <td className="py-1.5 pr-4 font-medium text-slate-800">{pr.profileName}</td>
                                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700">
                                  {nf1.format(pr.hours)} u
                                </td>
                                <td className="py-1.5 text-right tabular-nums text-[var(--muted)]">
                                  {nf1.format(pr.days)} d
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-300 font-bold text-slate-950">
                              <td className="pt-2 pr-4">Totaal fase</td>
                              <td className="pt-2 pr-4 text-right tabular-nums">{nf1.format(totalHours)} u</td>
                              <td className="pt-2 text-right tabular-nums text-[var(--muted)]">{nf1.format(totalDays)} d</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-950">
                  <span>Totaal alle fases</span>
                  <span className="tabular-nums">
                    {nf1.format(phaseBreakdown.reduce((s, p) => s + p.totalHours, 0))} u
                    {" · "}
                    {nf1.format(hoursToDays(phaseBreakdown.reduce((s, p) => s + p.totalHours, 0)))} d
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Hoofdoverzicht: maandrooster per medewerker */}
          <Card>
            <CardHeader
              title="Maandplanning per medewerker"
              description="Geplande uren per maand. Het weekdetail zit in de Excel-export."
            />
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-4 rounded-sm border border-red-200 bg-red-100" />
                = minstens een week boven de maximale weekcapaciteit (overbelasting)
              </span>
            </div>
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
      ) : (
        <Card className="border-dashed bg-slate-50/60">
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-[var(--primary)]">
              <Lightbulb size={22} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-950">Nog geen planning geopend</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
                Een planning verdeelt het urenbudget van een contract automatisch over de weken en
                medewerkers, zodat je in een oogopslag ziet wie wanneer hoeveel werkt. Kies hierboven
                een contract en klik op <span className="font-semibold">Fasering genereren</span>, of
                open een recent plan.
              </p>
            </div>
          </div>
        </Card>
      )}
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
              title={row.monthOverload[index] ? "Boven capaciteit in minstens een week" : undefined}
            >
              {value > 0 ? nf.format(value) : ""}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
