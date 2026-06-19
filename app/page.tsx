import { BudgetBarChart, ProfilePieChart } from "@/components/charts/dashboard-charts";
import { ActionAlerts } from "@/components/dashboard/action-alerts";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ContractStatusTable, type ContractStatusRow } from "@/components/contracts/contract-status-table";
import { ProfileDeviationTable } from "@/components/contracts/profile-deviation-table";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import {
  calculateContractSummary,
  calculateProfileActuals,
} from "@/lib/domain/calculations";
import { buildDashboardAlerts } from "@/lib/domain/dashboard-alerts";
import { formatHours } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const selectedContract = typeof params.contract === "string" ? params.contract : "";
  const selectedProfile = typeof params.profile === "string" ? params.profile : "";

  const [contracts, profiles, entries] = await Promise.all([
    prisma.contract.findMany({
      include: {
        timeEntries: { include: { task: true } },
        allocationTemplates: { include: { profileCategory: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.profileCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.timeEntry.findMany({
      where: {
        ...(selectedContract ? { contractId: selectedContract } : {}),
        ...(selectedProfile ? { profileCategoryId: selectedProfile } : {}),
      },
      include: { profileCategory: true, task: true, contract: true },
    }),
  ]);

  const contractRows: ContractStatusRow[] = contracts.map((contract) => {
    const contractEntries = contract.timeEntries.filter((entry) => {
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
  const actionAlerts = buildDashboardAlerts(visibleContracts, {
    staleAfterDays: 30,
    highTaskShareThreshold: 0.4,
  });
  const alerts = actionAlerts.filter((alert) => alert.severity !== "info");
  const selectedContractData = contracts.find((contract) => contract.id === (selectedContract || contracts[0]?.id));
  const profileRows = selectedContractData
    ? calculateProfileActuals(
        selectedContractData.timeEntries,
        selectedContractData.allocationTemplates.map((line) => ({
          profileCategoryId: line.profileCategoryId,
          profileName: line.profileCategory.name,
          targetPercentage: line.targetPercentage,
        })),
      )
    : [];

  const profilePieData = entries.reduce<Array<{ name: string; value: number }>>((acc, entry) => {
    const existing = acc.find((item) => item.name === entry.profileCategory.name);
    if (existing) {
      existing.value += entry.hours;
    } else {
      acc.push({ name: entry.profileCategory.name, value: entry.hours });
    }
    return acc;
  }, []);

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
          <Field label="Contract">
            <select name="contract" defaultValue={selectedContract} className={inputClass}>
              <option value="">Alle contracten</option>
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
        <MetricCard label="Totaal budget" value={formatHours(totalBudget)} helper="Actieve contractbudgetten" />
        <MetricCard label="Resterend" value={formatHours(totalBudget - totalHours)} helper="Budget minus prestaties" />
        <MetricCard label="Waarschuwingen" value={String(alerts.length)} helper="Warning of kritisch" />
      </div>

      <ActionAlerts alerts={actionAlerts} />

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Contractoverzicht" description="Budgetverbruik en resterende uren per contract." />
          <ContractStatusTable rows={visibleRows} />
        </Card>
        <Card>
          <CardHeader title="Profielverdeling" description="Uren per profiel binnen de selectie." />
          <ProfilePieChart data={profilePieData} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Budget per contract" description="Gepresteerde versus resterende uren." />
          <BudgetBarChart
            data={visibleRows.map((row) => ({
              name: row.code,
              gebruikt: row.totalHours,
              resterend: Math.max(row.remainingHours, 0),
            }))}
          />
        </Card>
        <Card>
          <CardHeader
            title="Afwijking profielmix"
            description={`Contract ${selectedContractData?.code ?? ""}; afwijking groter dan 3% valt op.`}
          />
          <ProfileDeviationTable rows={profileRows} />
        </Card>
      </div>
    </div>
  );
}
