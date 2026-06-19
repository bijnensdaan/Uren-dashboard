import { z } from "zod";

export const importFields = ["employee", "date", "hours", "task", "contract", "profile", "notes"] as const;

export type ImportField = (typeof importFields)[number];
export type ColumnMapping = Partial<Record<ImportField, string>>;

export type RawImportRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type ParsedImportFile = {
  columns: string[];
  rows: RawImportRow[];
};

export type ImportReferenceData = {
  employees: Array<{ id: string; name: string; profileCategoryId: string }>;
  contracts: Array<{ id: string; code: string }>;
  tasks: Array<{ id: string; name: string; contractId: string }>;
  profiles: Array<{ id: string; name: string }>;
  existingEntries: Array<{
    employeeId: string;
    contractId: string;
    taskId: string;
    profileCategoryId: string;
    date: Date | string;
    hours: number;
  }>;
};

export type ValidatedImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  values: Record<ImportField, string>;
  normalized?: {
    employeeId: string;
    employeeName: string;
    contractId: string;
    contractCode: string;
    taskId: string;
    taskName: string;
    profileCategoryId: string;
    profileName: string;
    date: string;
    hours: number;
    notes: string;
  };
  status: "valid" | "invalid";
  errors: string[];
};

export type ImportValidationResult = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  rows: ValidatedImportRow[];
};

export const importRowSchema = z.object({
  employee: z.string().min(1, "Medewerker ontbreekt"),
  date: z.string().min(1, "Datum ontbreekt"),
  hours: z.string().min(1, "Uren ontbreken"),
  task: z.string().min(1, "Taak ontbreekt"),
  contract: z.string().min(1, "Contract ontbreekt"),
  profile: z.string().min(1, "Profiel ontbreekt"),
  notes: z.string().optional().default(""),
});

const headerAliases: Record<ImportField, string[]> = {
  employee: ["employee", "medewerker", "naam", "werknemer", "consultant"],
  date: ["date", "datum", "prestatiedatum", "dag"],
  hours: ["hours", "uren", "aantal uren", "gepresteerde uren", "tijd"],
  task: ["task", "taak", "activiteit", "opdracht"],
  contract: ["contract", "contractcode", "contract code", "project", "dossier"],
  profile: ["profile", "profiel", "profilecategory", "profielcategorie", "categorie"],
  notes: ["notes", "notities", "opmerking", "opmerkingen", "omschrijving"],
};

export function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

export function parseCsv(text: string): ParsedImportFile {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const [headerLine, ...dataLines] = lines;

  if (!headerLine) {
    return { columns: [], rows: [] };
  }

  const columns = parseCsvLine(headerLine);
  const rows = dataLines.map((line, index) => {
    const values = parseCsvLine(line);
    return {
      rowNumber: index + 2,
      values: Object.fromEntries(columns.map((column, columnIndex) => [column, values[columnIndex] ?? ""])),
    };
  });

  return { columns, rows };
}

export function inferColumnMapping(columns: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const normalizedColumns = columns.map((column) => ({
    original: column,
    normalized: normalizeText(column),
  }));

  for (const field of importFields) {
    const match = normalizedColumns.find((column) =>
      headerAliases[field].some((alias) => column.normalized === normalizeText(alias)),
    );
    if (match) {
      mapping[field] = match.original;
    }
  }

  return mapping;
}

function getMappedValues(row: RawImportRow, mapping: ColumnMapping): Record<ImportField, string> {
  return Object.fromEntries(
    importFields.map((field) => [field, mapping[field] ? row.values[mapping[field]!] ?? "" : ""]),
  ) as Record<ImportField, string>;
}

function parseImportDate(value: string) {
  const trimmed = value.trim();
  const dutchDate = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);

  if (dutchDate) {
    const [, day, month, year] = dutchDate;
    return new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00.000Z`);
  }

  return new Date(trimmed);
}

export function toDateKey(value: Date | string) {
  return new Date(value).toISOString().slice(0, 10);
}

function entryKey(input: {
  employeeId: string;
  contractId: string;
  taskId: string;
  profileCategoryId: string;
  date: Date | string;
  hours: number;
}) {
  return [
    input.employeeId,
    input.contractId,
    input.taskId,
    input.profileCategoryId,
    toDateKey(input.date),
    input.hours.toFixed(2),
  ].join("|");
}

export function validateImportRows(
  rows: RawImportRow[],
  mapping: ColumnMapping,
  referenceData: ImportReferenceData,
): ImportValidationResult {
  const employeeMap = new Map(referenceData.employees.map((item) => [normalizeText(item.name), item]));
  const contractMap = new Map(referenceData.contracts.map((item) => [normalizeText(item.code), item]));
  const profileMap = new Map(referenceData.profiles.map((item) => [normalizeText(item.name), item]));
  const taskMap = new Map(referenceData.tasks.map((item) => [`${item.contractId}:${normalizeText(item.name)}`, item]));
  const existingKeys = new Set(referenceData.existingEntries.map(entryKey));
  const seenKeys = new Set<string>();
  let duplicateRows = 0;

  const validatedRows = rows.map((row) => {
    const values = getMappedValues(row, mapping);
    const schemaResult = importRowSchema.safeParse(values);
    const errors = schemaResult.success
      ? []
      : schemaResult.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`);

    const employee = employeeMap.get(normalizeText(values.employee));
    const contract = contractMap.get(normalizeText(values.contract));
    const profile = profileMap.get(normalizeText(values.profile));
    const task = contract ? taskMap.get(`${contract.id}:${normalizeText(values.task)}`) : undefined;
    const parsedDate = parseImportDate(values.date);
    const hours = Number(String(values.hours).replace(",", "."));

    if (!employee && values.employee) errors.push(`Medewerker niet gevonden: ${values.employee}`);
    if (!contract && values.contract) errors.push(`Contract niet gevonden: ${values.contract}`);
    if (!profile && values.profile) errors.push(`Profiel niet gevonden: ${values.profile}`);
    if (contract && !task && values.task) errors.push(`Taak '${values.task}' hoort niet bij contract ${values.contract}`);
    if (employee && profile && employee.profileCategoryId !== profile.id) {
      errors.push(`Profiel ${values.profile} komt niet overeen met medewerker ${values.employee}`);
    }
    if (Number.isNaN(parsedDate.getTime())) errors.push(`Ongeldige datum: ${values.date}`);
    if (!Number.isFinite(hours) || hours <= 0) errors.push(`Ongeldig aantal uren: ${values.hours}`);

    if (employee && contract && profile && task && !Number.isNaN(parsedDate.getTime()) && Number.isFinite(hours)) {
      const key = entryKey({
        employeeId: employee.id,
        contractId: contract.id,
        taskId: task.id,
        profileCategoryId: profile.id,
        date: parsedDate,
        hours,
      });

      if (existingKeys.has(key)) {
        errors.push("Duplicaat van bestaande time entry");
        duplicateRows += 1;
      } else if (seenKeys.has(key)) {
        errors.push("Duplicaat binnen importbestand");
        duplicateRows += 1;
      }
      seenKeys.add(key);

      return {
        rowNumber: row.rowNumber,
        raw: row.values,
        values,
        normalized: {
          employeeId: employee.id,
          employeeName: employee.name,
          contractId: contract.id,
          contractCode: contract.code,
          taskId: task.id,
          taskName: task.name,
          profileCategoryId: profile.id,
          profileName: profile.name,
          date: toDateKey(parsedDate),
          hours,
          notes: values.notes,
        },
        status: errors.length > 0 ? "invalid" : "valid",
        errors,
      } satisfies ValidatedImportRow;
    }

    return {
      rowNumber: row.rowNumber,
      raw: row.values,
      values,
      status: "invalid",
      errors,
    } satisfies ValidatedImportRow;
  });

  return {
    totalRows: validatedRows.length,
    validRows: validatedRows.filter((row) => row.status === "valid").length,
    invalidRows: validatedRows.filter((row) => row.status === "invalid").length,
    duplicateRows,
    rows: validatedRows,
  };
}
