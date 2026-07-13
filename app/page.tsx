import Link from "next/link";
import { AlertTriangle, Banknote, ChartNoAxesCombined, Clock3, Filter, Gauge, X } from "lucide-react";
import {
  BudgetBarChart,
  BudgetTimelineChart,
  ProfileBudgetChart,
  ProfileMixComparison,
} from "@/components/charts/dashboard-charts";
import { ActionAlerts } from "@/components/dashboard/action-alerts";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ContractStatusTable, type ContractStatusRow } from "@/components/contracts/contract-status-table";
import { ProfileDeviationTable, type ProfileDeviationRow } from "@/components/contracts/profile-deviation-table";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import {
  calculateContractSummary,
  calculateProfileActuals,
  roundOne,
  roundTwo,
} from "@/lib/domain/calculations";
import { buildDashboardAlerts } from "@/lib/domain/dashboard-alerts";
import { formatHours, formatPercent } from "@/lib/utils";

// Realtime dashboard: altijd per request renderen (nooit statisch bij de build,
// zodat de build geen databaseverbinding nodig heeft en data nooit veroudert).
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ProfileInsightEntry = {
  profileCategoryId: string;
  hours: number;
  task?: { name: string };
  employee?: { name: string };
};

type TimelineEntry = { date: Date; hours: number };

function buildBudgetTimeline(
  contract: { startDate: Date; endDate: Date; totalBudgetHours: number },
  entries: TimelineEntry[],
  referenceDate = new Date(),
) {
  const start = new Date(contract.startDate);
  const end = new Date(contract.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }

  const firstMonth = new Date(start.getFullYear(), start.getMonth(), 1);
  const lastMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const totalDuration = Math.max(end.getTime() - start.getTime(), 1);
  const effectiveNow = new Date(Math.min(Math.max(referenceDate.getTime(), start.getTime()), end.getTime()));
  const totalActual = entries.reduce((sum, entry) => sum + entry.hours, 0);
  const elapsedDays = Math.max((effectiveNow.getTime() - start.getTime()) / 86_400_000, 1);
  const dailyRate = totalActual > 0 ? totalActual / elapsedDays : 0;
  const points: Array<{
    label: string;
    gepland: number;
    werkelijk: number | null;
    prognose: number | null;
  }> = [];

  for (let month = new Date(firstMonth), count = 0; month <= lastMonth && count < 60; count += 1) {
    const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);
    const pointDate = new Date(Math.min(monthEnd.getTime(), end.getTime()));
    const plannedShare = Math.min(Math.max((pointDate.getTime() - start.getTime()) / totalDuration, 0), 1);
    const actualAtPoint = entries
      .filter((entry) => entry.date <= pointDate)
      .reduce((sum, entry) => sum + entry.hours, 0);
    const isFuture = pointDate > effectiveNow;
    const projected = isFuture && dailyRate > 0
      ? totalActual + dailyRate * ((pointDate.getTime() - effectiveNow.getTime()) / 86_400_000)
      : null;

    points.push({
      label: new Intl.DateTimeFormat("nl-BE", { month: "short", year: "2-digit" }).format(month),
      gepland: roundOne(contract.totalBudgetHours * plannedShare),
      werkelijk: isFuture ? null : roundOne(actualAtPoint),
      prognose: projected === null ? null : roundOne(projected),
    });
    month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  }

  return points;
}

function topContributors(
  entries: ProfileInsightEntry[],
  totalHours: number,
  getName: (entry: ProfileInsightEntry) => string,
) {
  const grouped = new Map<string, number>();

  for (const entry of entries) {
    const name = getName(entry);
    grouped.set(name, roundOne((grouped.get(name) ?? 0) + entry.hours));
  }

  return Array.from(grouped.entries())
    .map(([name, hours]) => ({
      name,
      hours,
      sharePercentage: totalHours > 0 ? roundTwo((hours / totalHours) * 100) : 0,
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 3);
}

function withProfileDeviationInsights(
  contractId: string,
  rows: ProfileDeviationRow[],
  entries: ProfileInsightEntry[],
): ProfileDeviationRow[] {
  return rows.map((row) => {
    if (!row.isDeviation) {
      return row;
    }

    const profileEntries = entries.filter((entry) => entry.profileCategoryId === row.profileCategoryId);
    const direction = row.deviation > 0 ? "boven" : "onder";
    const absDeviation = Math.abs(row.deviation);

    return {
      ...row,
      insight: {
        summary: `${row.profileName} zit ${formatPercent(absDeviation)} ${direction} de doelmix: werkelijk ${formatPercent(row.actualPercentage)} tegenover doel ${formatPercent(row.targetPercentage)}. De onderstaande bijdragen verklaren waar de uren vooral vandaan komen.`,
        actionHref: `/contracts/${contractId}`,
        topTasks: topContributors(
          profileEntries,
          row.actualHours,
          (entry) => entry.task?.name ?? "Onbekende taak",
        ),
        topEmployees: topContributors(
          profileEntries,
          row.actualHours,
          (entry) => entry.employee?.name ?? "Onbekende medewerker",
        ),
      },
    };
  });
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const selectedContract = typeof params.contract === "string" ? params.contract : "";
  const selectedProfile = typeof params.profile === "string" ? params.profile : "";
  const rawTask = typeof params.task === "string" ? params.task : "";

  // Een query voor alle time entries (met de includes die alle onderdelen nodig
  // hebben); per contract en filter worden daarna de afgeleide waarden berekend.
  const [contracts, profiles, allEntries, contractTasks] = await Promise.all([
    prisma.contract.findMany({
      include: {
        allocationTemplates: { include: { profileCategory: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.profileCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.timeEntry.findMany({
      include: { employee: true, task: true, profileCategory: true },
    }),
    // Het taakfilter toont alleen taken van de gekozen opdrachtbrief.
    selectedContract
      ? prisma.task.findMany({ where: { contractId: selectedContract }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  // Een taak-id dat niet bij de gekozen opdrachtbrief hoort (bv. na wisselen
  // van opdrachtbrief) wordt genegeerd in plaats van alles leeg te filteren.
  const selectedTask = contractTasks.some((task) => task.id === rawTask) ? rawTask : "";

  // Entries gegroepeerd per contract (alle entries, ongefilterd).
  const entriesByContract = new Map<string, typeof allEntries>();
  for (const entry of allEntries) {
    const list = entriesByContract.get(entry.contractId);
    if (list) {
      list.push(entry);
    } else {
      entriesByContract.set(entry.contractId, [entry]);
    }
  }

  const contractRows: ContractStatusRow[] = contracts.map((contract) => {
    // De contracttabel filtert entries op profiel en taak (niet op contractfilter).
    const contractEntries = (entriesByContract.get(contract.id) ?? []).filter((entry) => {
      if (selectedProfile && entry.profileCategoryId !== selectedProfile) {
        return false;
      }

      if (selectedTask && entry.taskId !== selectedTask) {
        return false;
      }

      return true;
    });
    const summary = calculateContractSummary({
      budgetHours: contract.totalBudgetHours,
      entries: contractEntries,
      warningThreshold: contract.warningThreshold,
      criticalThreshold: contract.criticalThreshold,
    });

    return {
      id: contract.id,
      code: contract.code,
      name: contract.name,
      budgetHours: contract.totalBudgetHours,
      totalHours: summary.totalHours,
      remainingHours: summary.remainingHours,
      usagePercentage: summary.usagePercentage,
      status: summary.status,
    };
  });

  const visibleRows = selectedContract
    ? contractRows.filter((row) => row.id === selectedContract)
    : contractRows;
  const totalHours = visibleRows.reduce((sum, row) => sum + row.totalHours, 0);
  const totalBudget = visibleRows.reduce((sum, row) => sum + row.budgetHours, 0);
  const visibleContracts = selectedContract
    ? contracts.filter((contract) => contract.id === selectedContract)
    : contracts;
  // De alerts gebruiken per contract alle entries (ongefilterd), zoals voorheen
  // via de timeEntries-include op het contract.
  const actionAlerts = buildDashboardAlerts(
    visibleContracts.map((contract) => ({
      ...contract,
      timeEntries: entriesByContract.get(contract.id) ?? [],
    })),
    {
      staleAfterDays: 30,
      highTaskShareThreshold: 0.4,
    },
  );
  const alerts = actionAlerts.filter((alert) => alert.severity !== "info");
  const criticalAlertCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningAlertCount = alerts.filter((alert) => alert.severity === "warning").length;
  // Alleen een expliciet gekozen opdrachtbrief: zonder keuze tonen we een
  // duidelijke lege staat in plaats van stilzwijgend de eerste opdrachtbrief
  // (dat wisselde onverwacht van inhoud en oogde inconsistent).
  const selectedContractData = selectedContract
    ? contracts.find((contract) => contract.id === selectedContract)
    : undefined;
  // De afwijkingstabel gebruikt alle entries van het geselecteerde contract, ongefilterd.
  const selectedContractEntries = selectedContractData
    ? entriesByContract.get(selectedContractData.id) ?? []
    : [];
  const timelineData = selectedContractData
    ? buildBudgetTimeline(selectedContractData, selectedContractEntries)
    : [];
  const profileRows: ProfileDeviationRow[] = selectedContractData
    ? withProfileDeviationInsights(
        selectedContractData.id,
        calculateProfileActuals(
          selectedContractEntries,
          selectedContractData.allocationTemplates.map((line) => ({
            profileCategoryId: line.profileCategoryId,
            profileName: line.profileCategory.name,
            targetPercentage: line.targetPercentage,
          })),
        ),
        selectedContractEntries,
      )
    : [];

  // De voorziene profielmix komt uit de verdeelsleutel en het budget van de opdrachtbrief.
  const plannedProfileTotals = new Map<string, { name: string; hours: number }>();
  let plannedProfileBaselineTotal = 0;

  for (const contract of visibleContracts) {
    for (const line of contract.allocationTemplates) {
      const plannedHours = (contract.totalBudgetHours * line.targetPercentage) / 100;
      plannedProfileBaselineTotal += plannedHours;

      if (selectedProfile && line.profileCategoryId !== selectedProfile) {
        continue;
      }

      const current = plannedProfileTotals.get(line.profileCategoryId) ?? {
        name: line.profileCategory.name,
        hours: 0,
      };
      current.hours += plannedHours;
      plannedProfileTotals.set(line.profileCategoryId, current);
    }
  }

  const profileBudgetData = Array.from(plannedProfileTotals.values())
    .map((item) => ({
      name: item.name,
      hours: roundOne(item.hours),
      sharePercentage:
        plannedProfileBaselineTotal > 0 ? roundTwo((item.hours / plannedProfileBaselineTotal) * 100) : 0,
    }))
    .sort((a, b) => b.hours - a.hours);
  const usagePercentage = totalBudget > 0 ? roundTwo((totalHours / totalBudget) * 100) : 0;
  const selectedProfileData = profiles.find((profile) => profile.id === selectedProfile);
  const selectedTaskData = contractTasks.find((task) => task.id === selectedTask);
  const hasFilters = Boolean(selectedContract || selectedProfile || selectedTask);
  const alertTone = criticalAlertCount > 0 ? "critical" : warningAlertCount > 0 ? "warning" : "default";

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Dashboard</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Actueel overzicht van budget, voortgang en aandachtspunten binnen de opdrachtbrieven.
        </p>
      </div>

      <Card className="p-3">
        <form className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[1.4fr_0.8fr_1.4fr_auto_auto]">
          <Field label="Opdrachtbrief">
            <select name="contract" defaultValue={selectedContract} className={inputClass}>
              <option value="">Alle opdrachtbrieven</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profiel">
            <select name="profile" defaultValue={selectedProfile} className={inputClass}>
              <option value="">Alle profielen</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Taak">
            <select
              name="task"
              defaultValue={selectedTask}
              className={inputClass}
              disabled={!selectedContract || contractTasks.length === 0}
            >
              <option value="">
                {selectedContract
                  ? contractTasks.length > 0
                    ? "Alle taken"
                    : "Geen taken"
                  : "Kies eerst een opdrachtbrief"}
              </option>
              {contractTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]">
            <Filter size={15} /> Toepassen
          </button>
          <Link
            href="/"
            aria-disabled={!hasFilters}
            className={`inline-flex h-10 items-center justify-center gap-2 rounded border px-3 text-sm font-semibold ${
              hasFilters
                ? "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                : "pointer-events-none border-slate-200 bg-slate-50 text-slate-400"
            }`}
          >
            <X size={15} /> Wissen
          </Link>
        </form>
        {hasFilters ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
            <span className="font-semibold text-slate-500">Actieve selectie</span>
            {selectedContractData ? <span className="rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-800">{selectedContractData.code}</span> : null}
            {selectedProfileData ? <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{selectedProfileData.name}</span> : null}
            {selectedTaskData ? <span className="max-w-full truncate rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">{selectedTaskData.name}</span> : null}
          </div>
        ) : null}
      </Card>

      <ActionAlerts alerts={actionAlerts} />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Gepresteerde uren" value={formatHours(totalHours)} helper="Binnen de huidige selectie" icon={<Clock3 size={16} />} />
        <MetricCard label="Budgetverbruik" value={formatPercent(usagePercentage)} helper={`${formatHours(totalHours)} van ${formatHours(totalBudget)}`} icon={<Gauge size={16} />} progress={usagePercentage} tone={usagePercentage >= 95 ? "critical" : usagePercentage >= 85 ? "warning" : "default"} />
        <MetricCard label="Resterend budget" value={formatHours(totalBudget - totalHours)} helper="Budget minus geregistreerde uren" icon={<Banknote size={16} />} />
        <MetricCard label="Actiepunten" value={String(alerts.length)} helper={`${criticalAlertCount} kritiek · ${warningAlertCount} waarschuwing${warningAlertCount === 1 ? "" : "en"}`} icon={<AlertTriangle size={16} />} tone={alertTone} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
        <Card>
          <CardHeader
            title={selectedContractData ? "Budgetverloop in de tijd" : "Budget per opdrachtbrief"}
            description={selectedContractData ? `Geplande, werkelijke en geprognosticeerde uren voor ${selectedContractData.code}.` : "Vergelijk het gebruikte en resterende budget in de volledige portefeuille."}
          />
          {selectedContractData ? (
            <BudgetTimelineChart data={timelineData} hasActualData={selectedContractEntries.length > 0} />
          ) : (
            <BudgetBarChart data={visibleRows.map((row) => ({ name: row.code, gebruikt: row.totalHours, resterend: Math.max(row.remainingHours, 0) }))} />
          )}
        </Card>
        <Card id="profielafwijking">
          {selectedContractData ? (
            <>
              <CardHeader title="Profielmix: doel vs. werkelijk" description={`Afwijkingen groter dan 3 procentpunt vallen op voor ${selectedContractData.code}.`} />
              {selectedContractEntries.length > 0 ? (
                <div className="grid gap-4">
                  <ProfileMixComparison data={profileRows.map((row) => ({ name: row.profileName, targetPercentage: row.targetPercentage, actualPercentage: row.actualPercentage, deviation: row.deviation }))} />
                  <details className="rounded border border-slate-200">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-[var(--primary)]">Bekijk detailanalyse</summary>
                    <div className="border-t border-slate-100 p-3"><ProfileDeviationTable rows={profileRows} /></div>
                  </details>
                </div>
              ) : (
                <div className="rounded border border-dashed border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
                  <p className="font-semibold">Nog geen betrouwbare profielmix</p>
                  <p className="mt-1">Registreer eerst uren voor deze opdrachtbrief. Tot dan worden er geen kritieke profielafwijkingen getoond.</p>
                  <Link href="/time-entries" className="mt-3 inline-flex items-center gap-2 font-bold text-[var(--primary)]">Uren registreren <ChartNoAxesCombined size={15} /></Link>
                </div>
              )}
            </>
          ) : (
            <>
              <CardHeader title="Voorziene profielmix" description="Budgeturen per profiel volgens de verdeelsleutels van de opdrachtbrieven." />
              <ProfileBudgetChart data={profileBudgetData} />
            </>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Overzicht opdrachtbrieven" description="Budgetverbruik, status en resterende uren per opdrachtbrief." />
        <ContractStatusTable rows={visibleRows} />
      </Card>
    </div>
  );
}
