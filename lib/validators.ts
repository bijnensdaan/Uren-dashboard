import { z } from "zod";

export const timeEntryFormSchema = z.object({
  employeeId: z.string().min(1),
  contractId: z.string().min(1),
  taskId: z.string().min(1),
  profileCategoryId: z.string().optional(),
  date: z.coerce.date(),
  hours: z.coerce.number().positive().max(24),
  notes: z.string().optional(),
});

export const simulationFormSchema = z.object({
  contractId: z.string().min(1),
  inputTotalHours: z.coerce.number().positive(),
});
