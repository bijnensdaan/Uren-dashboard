import { prisma } from "@/lib/db";
import { buildPlanGrid, type Phase, type PlanEmployee } from "@/lib/domain/planning";
import { hasPersonTitle, normalizePersonName } from "@/lib/domain/name-normalization";

export type PlanAssignment = {
  employeeId: string;
  included: boolean;
  weight: number;
  capacityOverride?: number | null;
};
export type StoredPhases = { phases: Phase[]; overallRationale: string };

function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function buildDefaultAssignments(employeeIds: string[]) {
  return {
    employees: Array.from(new Set(employeeIds)).map((employeeId) => ({
      employeeId,
      included: true,
      weight: 1,
    })),
  };
}

function uniqueEmployeesByPerson<
  T extends { name: string; weeklyCapacityHours: number },
>(employees: T[]) {
  const byName = new Map<string, T>();
  for (const employee of employees) {
    const key = normalizePersonName(employee.name);
    if (!key) continue;
    const current = byName.get(key);
    if (
      !current ||
      (hasPersonTitle(current.name) && !hasPersonTitle(employee.name)) ||
      (current.weeklyCapacityHours <= 0 && employee.weeklyCapacityHours > 0)
    ) {
      byName.set(key, employee);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name, "nl-BE"));
}

/**
 * Laadt een projectplan en berekent het weekrooster deterministisch via
 * buildPlanGrid (geen AI). Gebruikt door de planningpagina en de Excel-export.
 */
export async function loadPlanData(planId: string) {
  const plan = await prisma.projectPlan.findUnique({
    where: { id: planId },
    include: {
      contract: {
        include: {
          allocationTemplates: {
            include: { profileCategory: true },
            orderBy: { targetPercentage: "asc" },
          },
        },
      },
    },
  });
  if (!plan) return null;

  const allocationProfiles = plan.contract.allocationTemplates.filter(
    (line) => line.targetPercentage > 0,
  );
  const profileIds = allocationProfiles.map((line) => line.profileCategoryId);
  const employees = uniqueEmployeesByPerson(await prisma.employee.findMany({
    where: { active: true, profileCategoryId: { in: profileIds } },
    include: { profileCategory: true },
    orderBy: { name: "asc" },
  }));

  const stored = safeParse<StoredPhases>(plan.phasesJson, { phases: [], overallRationale: "" });
  const assignments = safeParse<{ employees: PlanAssignment[] }>(plan.assignmentsJson, {
    employees: [],
  }).employees;
  const assignmentById = new Map(assignments.map((assignment) => [assignment.employeeId, assignment]));
  const hasExplicitAssignments = assignments.length > 0;

  const planEmployees: PlanEmployee[] = employees
    .filter((employee) =>
      hasExplicitAssignments
        ? assignmentById.get(employee.id)?.included === true
        : true,
    )
    .map((employee) => {
      const assignment = assignmentById.get(employee.id);
      return {
        employeeId: employee.id,
        employeeName: employee.name,
        profileCategoryId: employee.profileCategoryId,
        profileName: employee.profileCategory.name,
        weeklyCapacityHours: assignment?.capacityOverride ?? employee.weeklyCapacityHours,
        weight: assignment?.weight ?? 1,
      };
    });

  const allocation = allocationProfiles.map((line) => ({
    profileCategoryId: line.profileCategoryId,
    profileName: line.profileCategory.name,
    percentage: line.targetPercentage,
  }));

  const grid = buildPlanGrid({
    start: plan.contract.startDate,
    end: plan.contract.endDate,
    totalHours: plan.totalHours,
    allocation,
    phases: stored.phases,
    employees: planEmployees,
  });

  return {
    plan,
    contract: plan.contract,
    phases: stored.phases,
    overallRationale: stored.overallRationale,
    employees,
    assignmentById,
    hasExplicitAssignments,
    grid,
  };
}
