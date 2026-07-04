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

export const suggestAllocationFormSchema = z.object({
  contractId: z.string().min(1),
  sourceText: z.string().min(1, "Plak een offerte-, opdrachtbrief- of beschrijvingstekst."),
});

export const acceptAllocationFormSchema = z.object({
  suggestionId: z.string().min(1),
  inputTotalHours: z.coerce.number().positive(),
});
