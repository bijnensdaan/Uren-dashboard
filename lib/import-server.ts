import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { parseCsv, type ParsedImportFile, type RawImportRow } from "@/lib/domain/import";

export async function getImportReferenceData() {
  const [employees, contracts, tasks, profiles, existingEntries] = await Promise.all([
    prisma.employee.findMany(),
    prisma.contract.findMany(),
    prisma.task.findMany(),
    prisma.profileCategory.findMany(),
    prisma.timeEntry.findMany({
      select: {
        employeeId: true,
        contractId: true,
        taskId: true,
        profileCategoryId: true,
        date: true,
        hours: true,
      },
    }),
  ]);

  return { employees, contracts, tasks, profiles, existingEntries };
}

function normalizeCell(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return value == null ? "" : String(value).trim();
}

function parseXlsx(buffer: Buffer): ParsedImportFile {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" });
  const columns = Object.keys(sheetRows[0] ?? {});
  const rows: RawImportRow[] = sheetRows.map((row, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(columns.map((column) => [column, normalizeCell(row[column])])),
  }));

  return { columns, rows };
}

export async function parseImportFile(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".xlsx")) {
    return parseXlsx(buffer);
  }

  return parseCsv(buffer.toString("utf8"));
}
