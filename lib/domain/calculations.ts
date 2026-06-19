export const HALF_DAY_HOURS = 4;
export const FULL_DAY_HOURS = 8;
export const PROFILE_DEVIATION_THRESHOLD = 3;

export type BudgetStatus = "normal" | "warning" | "critical";

export type TimeEntryLike = {
  hours: number;
  profileCategoryId: string;
};

export type ProfileTargetLike = {
  profileCategoryId: string;
  targetPercentage: number;
  profileName?: string;
};

export function roundOne(value: number) {
  return Math.round(value * 10) / 10;
}

export function roundTwo(value: number) {
  return Math.round(value * 100) / 100;
}

export function getBudgetUsage(totalHours: number, budgetHours: number) {
  if (budgetHours <= 0) {
    return 0;
  }

  return roundTwo((totalHours / budgetHours) * 100);
}

export function getBudgetStatus(
  usagePercentage: number,
  warningThreshold = 85,
  criticalThreshold = 95,
): BudgetStatus {
  if (usagePercentage >= criticalThreshold) {
    return "critical";
  }

  if (usagePercentage >= warningThreshold) {
    return "warning";
  }

  return "normal";
}

export function getStatusLabel(status: BudgetStatus) {
  return {
    normal: "Gezond",
    warning: "Waarschuwing",
    critical: "Kritisch",
  }[status];
}

export function getStatusClass(status: BudgetStatus) {
  return {
    normal: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    critical: "border-red-200 bg-red-50 text-red-800",
  }[status];
}

export function sumHours(entries: TimeEntryLike[]) {
  return roundOne(entries.reduce((total, entry) => total + entry.hours, 0));
}

export function calculateProfileActuals(
  entries: TimeEntryLike[],
  targets: ProfileTargetLike[],
) {
  const totalHours = sumHours(entries);
  const hoursByProfile = new Map<string, number>();

  for (const entry of entries) {
    hoursByProfile.set(
      entry.profileCategoryId,
      roundOne((hoursByProfile.get(entry.profileCategoryId) ?? 0) + entry.hours),
    );
  }

  return targets.map((target) => {
    const actualHours = hoursByProfile.get(target.profileCategoryId) ?? 0;
    const actualPercentage = totalHours > 0 ? roundTwo((actualHours / totalHours) * 100) : 0;
    const deviation = roundTwo(actualPercentage - target.targetPercentage);

    return {
      profileCategoryId: target.profileCategoryId,
      profileName: target.profileName ?? target.profileCategoryId,
      targetPercentage: target.targetPercentage,
      actualHours,
      actualPercentage,
      deviation,
      isDeviation: Math.abs(deviation) > PROFILE_DEVIATION_THRESHOLD,
    };
  });
}

export function calculateContractSummary(input: {
  budgetHours: number;
  entries: TimeEntryLike[];
  warningThreshold?: number;
  criticalThreshold?: number;
}) {
  const totalHours = sumHours(input.entries);
  const remainingHours = roundOne(input.budgetHours - totalHours);
  const usagePercentage = getBudgetUsage(totalHours, input.budgetHours);
  const status = getBudgetStatus(
    usagePercentage,
    input.warningThreshold,
    input.criticalThreshold,
  );

  return {
    totalHours,
    remainingHours,
    usagePercentage,
    status,
  };
}
