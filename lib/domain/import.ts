import { z } from "zod";

export const importRowSchema = z.object({
  employee: z.string().min(1),
  date: z.coerce.date(),
  hours: z.coerce.number().positive(),
  task: z.string().min(1),
  contract: z.string().min(1),
  profile: z.string().min(1),
  notes: z.string().optional().default(""),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export function parseCsv(text: string) {
  const rows = text.trim().split(/\r?\n/);
  const [headerLine, ...dataLines] = rows;

  if (!headerLine) {
    return [];
  }

  const headers = headerLine.split(",").map((header) => header.trim());

  return dataLines
    .filter(Boolean)
    .map((line) => {
      const values = line.split(",").map((value) => value.trim());
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    });
}
