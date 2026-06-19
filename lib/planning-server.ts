import { prisma } from "@/lib/db";
import { buildPlanGrid, type Phase, type PlanEmployee } from "@/lib/domain/planning";

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
  return { employees: employeeIds.map((employeeId) => ({ employeeId, included: true, weight: 1 })) };
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
  const employees = await prisma.employee.findMany({
    where: { active: true, profileCategoryId: { in: profileIds } },
    include: { profileCategory: true },
    orderBy: { name: "asc" },
  });

  const stored = safeParse<StoredPhases>(plan.phasesJson, { phases: [], overallRationale: "" });
  const assignments = safeParse<{ employees: PlanAssignment[] }>(plan.assignmentsJson, {
    employees: [],
  }).employees;
  const assignmentById = new Map(assignments.map((assignment) => [assignment.employeeId, assignment]));

  const planEmployees: PlanEmployee[] = employees
    .filter((employee) => assignmentById.get(employee.id)?.included ?? true)
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
    grid,
  };
}
