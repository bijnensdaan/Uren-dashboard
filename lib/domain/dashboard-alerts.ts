import {
  FULL_DAY_HOURS,
  calculateContractSummary,
  calculateProfileActuals,
  getStatusLabel,
  roundOne,
} from "./calculations";

export type DashboardAlertSeverity = "critical" | "warning" | "info";
export type DashboardAlertCategory = "budget" | "profile" | "stale" | "task";

export type DashboardAlert = {
  id: string;
  severity: DashboardAlertSeverity;
  category: DashboardAlertCategory;
  title: string;
  reason: string;
  actionLabel: string;
  href: string;
  priority: number;
};

type AlertContract = {
  id: string;
  code: string;
  name: string;
  totalBudgetHours: number;
  warningThreshold: number;
  criticalThreshold: number;
  timeEntries: Array<{
    date: Date | string;
    hours: number;
    profileCategoryId: string;
    taskId: string;
    task?: {
      name: string;
    };
  }>;
  allocationTemplates: Array<{
    profileCategoryId: string;
    targetPercentage: number;
    profileCategory?: {
      name: string;
    };
  }>;
};

type DashboardAlertOptions = {
  referenceDate?: Date;
  staleAfterDays?: number;
  highTaskShareThreshold?: number;
  maxAlerts?: number;
};

function daysBetween(later: Date, earlier: Date) {
  return Math.floor((later.getTime() - earlier.getTime()) / (1000 * 60 * 60 * 24));
}

function severityWeight(severity: DashboardAlertSeverity) {
  return {
    critical: 0,
    warning: 1,
    info: 2,
  }[severity];
}

export function buildDashboardAlerts(
  contracts: AlertContract[],
  options: DashboardAlertOptions = {},
) {
  const referenceDate = options.referenceDate ?? new Date();
  const staleAfterDays = options.staleAfterDays ?? 30;
  const highTaskShareThreshold = options.highTaskShareThreshold ?? 0.4;
  const alerts: DashboardAlert[] = [];

  for (const contract of contracts) {
    const summary = calculateContractSummary({
      budgetHours: contract.totalBudgetHours,
      entries: contract.timeEntries,
      warningThreshold: contract.warningThreshold,
      criticalThreshold: contract.criticalThreshold,
    });

    if (summary.status !== "normal") {
      alerts.push({
        id: `budget-${contract.id}`,
        severity: summary.status === "critical" ? "critical" : "warning",
        category: "budget",
        title: `${contract.code}: budget ${getStatusLabel(summary.status).toLowerCase()}`,
        reason: `${summary.usagePercentage}% van ${contract.totalBudgetHours} uur is opgebruikt; resterend ${summary.remainingHours} uur.`,
        actionLabel: "Bekijk contract",
        href: `/contracts/${contract.id}`,
        priority: summary.status === "critical" ? 10 : 30,
      });
    }

    const profileActuals = calculateProfileActuals(
      contract.timeEntries,
      contract.allocationTemplates.map((line) => ({
        profileCategoryId: line.profileCategoryId,
        profileName: line.profileCategory?.name ?? line.profileCategoryId,
        targetPercentage: line.targetPercentage,
      })),
    );

    for (const profile of profileActuals.filter((row) => row.isDeviation)) {
      const absDeviation = Math.abs(profile.deviation);
      alerts.push({
        id: `profile-${contract.id}-${profile.profileCategoryId}`,
        severity: absDeviation >= 10 ? "critical" : "warning",
        category: "profile",
        title: `${contract.code}: profielmix wijkt af`,
        reason: `${profile.profileName} staat op ${profile.actualPercentage}% tegenover doel ${profile.targetPercentage}% (${profile.deviation > 0 ? "+" : ""}${profile.deviation}%).`,
        actionLabel: "Bekijk profielmix",
        href: `/?contract=${contract.id}&profile=${profile.profileCategoryId}#profielafwijking`,
        priority: absDeviation >= 10 ? 20 : 40,
      });
    }

    const latestEntryDate = contract.timeEntries
      .map((entry) => new Date(entry.date))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => b.getTime() - a.getTime())[0];

    if (!latestEntryDate) {
      alerts.push({
        id: `stale-none-${contract.id}`,
        severity: "warning",
        category: "stale",
        title: `${contract.code}: geen uren geregistreerd`,
        reason: "Dit contract heeft nog geen time entries; budgetstatus en profielmix zijn daardoor niet betrouwbaar.",
        actionLabel: "Uren toevoegen",
        href: `/time-entries?contract=${contract.id}`,
        priority: 50,
      });
    } else {
      const daysSinceLatest = daysBetween(referenceDate, latestEntryDate);
      if (daysSinceLatest > staleAfterDays) {
        alerts.push({
          id: `stale-${contract.id}`,
          severity: "warning",
          category: "stale",
          title: `${contract.code}: geen recente uren`,
          reason: `Laatste registratie is ${daysSinceLatest} dagen oud; controleer of prestaties nog volledig worden aangeleverd.`,
          actionLabel: "Controleer uren",
          href: `/time-entries?contract=${contract.id}`,
          priority: 60,
        });
      }
    }

    const totalHours = summary.totalHours;
    const taskHours = new Map<string, { name: string; hours: number }>();
    for (const entry of contract.timeEntries) {
      const current = taskHours.get(entry.taskId) ?? {
        name: entry.task?.name ?? entry.taskId,
        hours: 0,
      };
      current.hours = roundOne(current.hours + entry.hours);
      taskHours.set(entry.taskId, current);
    }

    for (const [taskId, task] of taskHours) {
      const share = totalHours > 0 ? task.hours / totalHours : 0;
      if (task.hours >= FULL_DAY_HOURS && share >= highTaskShareThreshold) {
        alerts.push({
          id: `task-${contract.id}-${taskId}`,
          severity: "info",
          category: "task",
          title: `${contract.code}: taak vraagt veel uren`,
          reason: `${task.name} bevat ${task.hours} uur, goed voor ${Math.round(share * 100)}% van de geregistreerde uren.`,
          actionLabel: "Bekijk uren",
          href: `/time-entries?contract=${contract.id}`,
          priority: 80,
        });
      }
    }
  }

  return alerts
    .sort((a, b) => severityWeight(a.severity) - severityWeight(b.severity) || a.priority - b.priority)
    .slice(0, options.maxAlerts ?? 12);
}
