import { BudgetBarChart, ProfileBudgetChart } from "@/components/charts/dashboard-charts";
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

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type ProfileInsightEntry = {
  profileCategoryId: string;
  hours: number;
  task?: { name: string };
  employee?: { name: string };
};

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

  // Een query voor alle time entries (met de includes die alle onderdelen nodig
  // hebben); per contract en filter worden daarna de afgeleide waarden berekend.
  const [contracts, profiles, allEntries] = await Promise.all([
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
  ]);

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
    // De contracttabel filtert entries alleen op profiel (niet op contractfilter).
    const contractEntries = (entriesByContract.get(contract.id) ?? []).filter((entry) => {
      if (selectedProfile && entry.profileCategoryId !== selectedProfile) {
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
  const selectedContractData = contracts.find((contract) => contract.id === (selectedContract || contracts[0]?.id));
  // De afwijkingstabel gebruikt alle entries van het geselecteerde contract, ongefilterd.
  const selectedContractEntries = selectedContractData
    ? entriesByContract.get(selectedContractData.id) ?? []
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
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Dashboard Home</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Realtime overzicht van contractbudgetten, profielmix en geregistreerde uren.
          </p>
        </div>
        <form className="flex flex-wrap items-end gap-3 rounded border border-[var(--border)] bg-white p-3">
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
          <button className="h-10 rounded bg-[var(--primary)] px-3 text-sm font-semibold text-white">Filter</button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Gepresteerde uren" value={formatHours(totalHours)} helper="Binnen huidige selectie" />
        <MetricCard label="Totaal budget" value={formatHours(totalBudget)} helper="Actieve budgetten" />
        <MetricCard label="Resterend" value={formatHours(totalBudget - totalHours)} helper="Budget minus prestaties" />
        <MetricCard label="Waarschuwingen" value={String(alerts.length)} helper="Warning of kritisch" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Overzicht opdrachtbrieven" description="Budgetverbruik en resterende uren per opdrachtbrief." />
          <ContractStatusTable rows={visibleRows} />
        </Card>
        <Card>
          <CardHeader
            title="Voorziene profielmix"
            description="Budgeturen per profiel volgens de verdeelsleutel van de opdrachtbrief."
          />
          <ProfileBudgetChart data={profileBudgetData} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Budget per opdrachtbrief" description="Gepresteerde versus resterende uren." />
          <BudgetBarChart
            data={visibleRows.map((row) => ({
              name: row.code,
              gebruikt: row.totalHours,
              resterend: Math.max(row.remainingHours, 0),
            }))}
          />
        </Card>
        <div id="profielafwijking">
          <Card>
          <CardHeader
            title="Afwijking profielmix"
            description={`Opdrachtbrief ${selectedContractData?.code ?? ""}; afwijking groter dan 3% valt op.`}
          />
          <ProfileDeviationTable rows={profileRows} />
          </Card>
        </div>
      </div>

      <ActionAlerts alerts={actionAlerts} />
    </div>
  );
}
