import { notFound } from "next/navigation";
import { BudgetBarChart, ProfilePieChart } from "@/components/charts/dashboard-charts";
import { BurnupChart } from "@/components/charts/progress-chart";
import { ProfileDeviationTable } from "@/components/contracts/profile-deviation-table";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { prisma } from "@/lib/db";
import {
  calculateContractSummary,
  calculateProfileActuals,
  getStatusClass,
  getStatusLabel,
} from "@/lib/domain/calculations";
import { buildBurnup } from "@/lib/domain/progress";
import { loadPlanData } from "@/lib/planning-server";
import { formatDate, formatHours, formatPercent } from "@/lib/utils";

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: {
      tasks: { orderBy: { name: "asc" } },
      timeEntries: {
        include: { employee: true, task: true, profileCategory: true },
        orderBy: { date: "desc" },
      },
      allocationTemplates: { include: { profileCategory: true } },
      simulations: { include: { lines: { include: { profileCategory: true } } }, orderBy: { createdAt: "desc" } },
      projectPlans: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!contract) {
    notFound();
  }

  const summary = calculateContractSummary({
    budgetHours: contract.totalBudgetHours,
    entries: contract.timeEntries,
    warningThreshold: contract.warningThreshold,
    criticalThreshold: contract.criticalThreshold,
  });
  const profileRows = calculateProfileActuals(
    contract.timeEntries,
    contract.allocationTemplates.map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      targetPercentage: line.targetPercentage,
    })),
  );
  const taskRows = contract.tasks.map((task) => ({
    name: task.name,
    hours: contract.timeEntries
      .filter((entry) => entry.taskId === task.id)
      .reduce((sum, entry) => sum + entry.hours, 0),
  }));
  const latestSimulation = contract.simulations[0];

  // Kies het plan voor de geplande lijn: het meest recent goedgekeurde plan
  // (op goedkeuringsdatum), anders het meest recente plan (concept/afgewezen).
  const approvedPlans = contract.projectPlans
    .filter((plan) => plan.status === "approved")
    .sort(
      (a, b) =>
        (b.approvedAt ?? b.createdAt).getTime() - (a.approvedAt ?? a.createdAt).getTime(),
    );
  const chosenPlan = approvedPlans[0] ?? contract.projectPlans[0] ?? null;
  const planData = chosenPlan ? await loadPlanData(chosenPlan.id) : null;
  // Geplande uren per week: som van alle medewerker-rijen uit de planning-engine.
  const plannedWeekly = planData
    ? planData.grid.weeks.map((_, weekIndex) =>
        planData.grid.rows.reduce((sum, row) => sum + (row.weeklyHours[weekIndex] ?? 0), 0),
      )
    : null;

  const burnup = buildBurnup({
    start: contract.startDate,
    end: contract.endDate,
    budgetHours: contract.totalBudgetHours,
    entries: contract.timeEntries,
    plannedWeekly,
  });
  const burnupDelta =
    burnup.plannedToDate !== null ? Math.round((burnup.actualToDate - burnup.plannedToDate) * 10) / 10 : null;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-[var(--primary)]">{contract.code}</div>
          <h1 className="text-2xl font-bold text-slate-950">{contract.name}</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatDate(contract.startDate)} tot {formatDate(contract.endDate)}
          </p>
        </div>
        <Badge className={getStatusClass(summary.status)}>{getStatusLabel(summary.status)}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <div className="text-sm text-[var(--muted)]">Budget</div>
          <div className="mt-2 text-2xl font-bold">{formatHours(contract.totalBudgetHours)}</div>
        </Card>
        <Card>
          <div className="text-sm text-[var(--muted)]">Gepresteerd</div>
          <div className="mt-2 text-2xl font-bold">{formatHours(summary.totalHours)}</div>
        </Card>
        <Card>
          <div className="text-sm text-[var(--muted)]">Resterend</div>
          <div className="mt-2 text-2xl font-bold">{formatHours(summary.remainingHours)}</div>
        </Card>
        <Card>
          <div className="text-sm text-[var(--muted)]">Verbruik</div>
          <div className="mt-2 text-2xl font-bold">{formatPercent(summary.usagePercentage)}</div>
          <div className="mt-3">
            <Progress value={summary.usagePercentage} status={summary.status} />
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Voortgang budget"
          description={
            planData
              ? `Cumulatief werkelijk versus gepland (${
                  chosenPlan?.status === "approved" ? "goedgekeurde planning" : "meest recente planning, nog niet goedgekeurd"
                }) en het totale budget.`
              : "Cumulatief werkelijk versus het totale budget. Nog geen planning voor deze opdrachtbrief; genereer er een op de planningpagina voor de geplande lijn."
          }
        />
        <BurnupChart
          data={burnup.points.map((point) => ({
            name: point.label,
            werkelijk: point.cumulativeActual,
            gepland: point.cumulativePlanned,
          }))}
          budgetHours={contract.totalBudgetHours}
        />
        <p className="mt-3 text-sm text-[var(--muted)]">
          Werkelijk {formatHours(burnup.actualToDate)} van {formatHours(contract.totalBudgetHours)} budget
          {burnup.plannedToDate !== null && burnupDelta !== null ? (
            <>
              ; gepland tot nu {formatHours(burnup.plannedToDate)}; verschil{" "}
              <span className={burnupDelta > 0 ? "font-semibold text-amber-700" : "font-semibold text-emerald-700"}>
                {burnupDelta > 0 ? "+" : ""}
                {formatHours(burnupDelta)}
              </span>{" "}
              ({burnupDelta > 0 ? "voor op de planning" : burnupDelta < 0 ? "achter op de planning" : "exact op schema"}).
            </>
          ) : (
            "; geen geplande lijn beschikbaar zonder planning."
          )}
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Taken binnen opdrachtbrief" description="Uren per taak." />
          <BudgetBarChart data={taskRows.map((row) => ({ name: row.name, gebruikt: row.hours, resterend: 0 }))} />
        </Card>
        <Card>
          <CardHeader title="Geplande vs werkelijke profielmix" description="Vergelijking met verdeelsleutel." />
          <ProfileDeviationTable rows={profileRows} />
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Werkelijke profielverdeling" />
          <ProfilePieChart
            data={profileRows.map((row) => ({ name: row.profileName, value: row.actualHours }))}
          />
        </Card>
        <Card>
          <CardHeader title="Laatste simulatie" description="Basis voor geplande versus werkelijke uren." />
          {latestSimulation ? (
            <div className="grid gap-3 text-sm">
              {latestSimulation.lines.map((line) => {
                const actual = profileRows.find((row) => row.profileCategoryId === line.profileCategoryId)?.actualHours ?? 0;
                return (
                  <div key={line.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 pb-2">
                    <span className="font-medium">{line.profileCategory.name}</span>
                    <span>
                      {formatHours(actual)} / {formatHours(line.finalHours)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">Nog geen simulatie voor dit contract.</p>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Time entries" description="Laatste geregistreerde prestaties." />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                <th className="py-2 pr-4">Datum</th>
                <th className="py-2 pr-4">Medewerker</th>
                <th className="py-2 pr-4">Taak</th>
                <th className="py-2 pr-4">Profiel</th>
                <th className="py-2">Uren</th>
              </tr>
            </thead>
            <tbody>
              {contract.timeEntries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4">{formatDate(entry.date)}</td>
                  <td className="py-3 pr-4">{entry.employee.name}</td>
                  <td className="py-3 pr-4">{entry.task.name}</td>
                  <td className="py-3 pr-4">{entry.profileCategory.name}</td>
                  <td className="py-3">{formatHours(entry.hours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
