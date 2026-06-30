import * as XLSX from "xlsx";
import type { PvFacturatie } from "./pv";

/**
 * Deterministische generatie van het uren-/facturatie-Excelbestand in de structuur
 * van de bestanden "Gepresteerde uren … .xlsx" in docs/: één tabblad per kalendermaand
 * met uren per medewerker × datum en eindtotalen, plus het tabblad "Overzicht bedragen"
 * met de facturatietabel. Alle cijfers komen uit de domeinlogica, niet uit AI.
 */
export type UrenWorkbookInput = {
  contractCode: string;
  periodStart: string;
  periodEnd: string;
  timeEntries: Array<{ employeeName: string; date: Date; hours: number }>;
  facturatie: PvFacturatie;
  vatPercentage: number;
  alreadyInvoiced: number;
  totalBudgetAmount: number;
};

const NL_MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

function monthKey(date: Date) {
  return date.getFullYear() * 100 + date.getMonth();
}

function monthLabel(key: number) {
  const year = Math.floor(key / 100);
  const month = key % 100;
  return `${NL_MONTHS[month]} ${year}`;
}

function dayKey(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatDayKey(key: number) {
  const date = new Date(key);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function buildMonthSheet(
  contractCode: string,
  monthKey_: number,
  entries: Array<{ employeeName: string; date: Date; hours: number }>,
): XLSX.WorkSheet {
  const dateKeys = Array.from(new Set(entries.map((e) => dayKey(e.date)))).sort((a, b) => a - b);
  const employees = Array.from(new Set(entries.map((e) => e.employeeName))).sort();

  const hours = new Map<string, Map<number, number>>();
  for (const entry of entries) {
    const key = dayKey(entry.date);
    const row = hours.get(entry.employeeName) ?? new Map<number, number>();
    row.set(key, round1((row.get(key) ?? 0) + entry.hours));
    hours.set(entry.employeeName, row);
  }

  const dateLabels = dateKeys.map((key) => formatDayKey(key));

  const aoa: (string | number | null)[][] = [];
  // Lege eerste rij (conform referentie)
  aoa.push([]);
  aoa.push([`Overzicht uren - ${contractCode}`]);
  aoa.push([]);
  aoa.push(["NAAM", "DATUM", ...new Array(Math.max(0, dateLabels.length - 1)).fill(""), "Eindtotaal"]);
  aoa.push(["", ...dateLabels, ""]);

  for (const employee of employees) {
    const row: (string | number | null)[] = [employee];
    let rowTotal = 0;
    for (const key of dateKeys) {
      const value = hours.get(employee)?.get(key);
      if (value && value > 0) {
        row.push(value);
        rowTotal = round1(rowTotal + value);
      } else {
        row.push(null);
      }
    }
    row.push(rowTotal);
    aoa.push(row);
  }

  // Kolomtotalen
  const totalsRow: (string | number | null)[] = [""];
  let grandTotal = 0;
  for (const key of dateKeys) {
    let colTotal = 0;
    for (const employee of employees) {
      colTotal = round1(colTotal + (hours.get(employee)?.get(key) ?? 0));
    }
    totalsRow.push(colTotal > 0 ? colTotal : null);
    grandTotal = round1(grandTotal + colTotal);
  }
  totalsRow.push(grandTotal);
  aoa.push(totalsRow);

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [{ wch: 22 }, ...dateLabels.map(() => ({ wch: 9 })), { wch: 11 }];
  return sheet;
}

function setEuro(sheet: XLSX.WorkSheet, ref: string) {
  if (sheet[ref] && typeof sheet[ref].v === "number") {
    sheet[ref].z = '"€" #,##0.00';
  }
}

function buildBedragenSheet(input: UrenWorkbookInput): XLSX.WorkSheet {
  const f = input.facturatie;
  const totalDays = f.totals.days || 1;
  const nuTeFactureren = f.totals.amountInclVat;
  const nogTeFactureren = input.totalBudgetAmount - input.alreadyInvoiced - nuTeFactureren;

  const aoa: (string | number | null)[][] = [];
  aoa.push([
    "Gegevens",
    "",
    `Te factureren periode ${input.periodStart} – ${input.periodEnd}`,
    "",
    "",
    "",
    "",
    "persoonsdagen %",
    "reeds gefactureerd",
    "nu te factureren",
    "nog te factureren",
  ]);
  aoa.push([
    "profiel",
    "eenheidsprijs (excl. btw)",
    "uren",
    "dagen",
    "prijs",
    "btw",
    "totaal prijs (incl. btw)",
    "",
    input.alreadyInvoiced,
    nuTeFactureren,
    nogTeFactureren,
  ]);

  for (const line of f.lines) {
    aoa.push([
      line.profileName,
      line.unitPrice,
      line.hours,
      line.days,
      line.amountExclVat,
      line.vatAmount,
      line.amountInclVat,
      Math.round((line.days / totalDays) * 1000) / 1000,
    ]);
  }
  aoa.push([
    "Totalen",
    "",
    f.totals.hours,
    f.totals.days,
    f.totals.amountExclVat,
    f.totals.vatAmount,
    f.totals.amountInclVat,
  ]);

  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet["!cols"] = [
    { wch: 14 },
    { wch: 20 },
    { wch: 8 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 20 },
    { wch: 14 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];

  const lastRow = aoa.length - 1;
  for (let r = 1; r <= lastRow; r += 1) {
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 1 }));
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 4 }));
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 5 }));
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 6 }));
  }
  setEuro(sheet, "I2");
  setEuro(sheet, "J2");
  setEuro(sheet, "K2");
  return sheet;
}

export function buildUrenWorkbook(input: UrenWorkbookInput): Buffer {
  const workbook = XLSX.utils.book_new();

  // Groepeer time entries per maand
  const byMonth = new Map<number, Array<{ employeeName: string; date: Date; hours: number }>>();
  for (const entry of input.timeEntries) {
    const key = monthKey(entry.date);
    const group = byMonth.get(key) ?? [];
    group.push(entry);
    byMonth.set(key, group);
  }

  // Eén tabblad per maand, gesorteerd op datum
  const sortedMonths = Array.from(byMonth.keys()).sort((a, b) => a - b);

  if (sortedMonths.length === 0) {
    // Geen time entries: toon één leeg blad met contractcode
    const empty = XLSX.utils.aoa_to_sheet([[`Overzicht uren - ${input.contractCode}`], [], ["Geen gepresteerde uren gevonden."]]);
    XLSX.utils.book_append_sheet(workbook, empty, "Uren");
  } else {
    for (const key of sortedMonths) {
      const entries = byMonth.get(key)!;
      const sheet = buildMonthSheet(input.contractCode, key, entries);
      XLSX.utils.book_append_sheet(workbook, sheet, monthLabel(key));
    }
  }

  XLSX.utils.book_append_sheet(workbook, buildBedragenSheet(input), "Overzicht bedragen");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
