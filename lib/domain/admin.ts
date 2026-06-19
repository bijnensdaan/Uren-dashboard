import { z } from "zod";

export const allocationTolerance = 0.01;

export const profileFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Profielnaam is verplicht"),
  defaultAllocationPercentage: z.coerce.number().min(0).max(100),
  active: z.coerce.boolean().optional(),
});

export const employeeFormSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Medewerkernaam is verplicht"),
  profileCategoryId: z.string().min(1, "Profiel is verplicht"),
  active: z.coerce.boolean().optional(),
});

export const taskFormSchema = z.object({
  id: z.string().optional(),
  contractId: z.string().min(1, "Contract is verplicht"),
  name: z.string().trim().min(1, "Taaknaam is verplicht"),
  active: z.coerce.boolean().optional(),
});

export const contractFormSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1, "Contractcode is verplicht"),
  name: z.string().trim().min(1, "Contractnaam is verplicht"),
  totalBudgetHours: z.coerce.number().positive("Budget moet groter zijn dan 0"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  warningThreshold: z.coerce.number().min(0).max(100).default(85),
  criticalThreshold: z.coerce.number().min(0).max(100).default(95),
  active: z.coerce.boolean().optional(),
});

export type AllocationLineInput = {
  profileCategoryId: string;
  targetPercentage: number;
};

export function validateAllocationPercentages(lines: AllocationLineInput[]) {
  const total = lines.reduce((sum, line) => sum + line.targetPercentage, 0);
  const roundedTotal = Math.round(total * 100) / 100;

  if (Math.abs(roundedTotal - 100) > allocationTolerance) {
    throw new Error(`Verdeelsleutel moet samen 100% zijn. Huidig totaal: ${roundedTotal}%.`);
  }

  for (const line of lines) {
    if (!line.profileCategoryId) {
      throw new Error("Elke verdeelsleutelregel moet een profiel hebben.");
    }

    if (!Number.isFinite(line.targetPercentage) || line.targetPercentage < 0 || line.targetPercentage > 100) {
      throw new Error("Elke verdeelsleutelregel moet een percentage tussen 0 en 100 hebben.");
    }
  }

  return { total: roundedTotal };
}

export function parseTaskNames(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((task) => task.trim())
    .filter(Boolean);
}

export function parseAllocationLines(formData: FormData, profileIds: string[]) {
  return profileIds.map((profileCategoryId) => ({
    profileCategoryId,
    targetPercentage: Number(formData.get(`allocation-${profileCategoryId}`) ?? 0),
  }));
}
