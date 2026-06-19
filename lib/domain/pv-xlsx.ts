import * as XLSX from "xlsx";
import type { PvFacturatie } from "./pv";

/**
 * Deterministische generatie van het uren-/facturatie-Excelbestand in de structuur
 * van de bestanden "Gepresteerde uren … .xlsx" in docs/: een uren-overzicht per
 * medewerker × datum met eindtotalen, plus het tabblad "Overzicht bedragen" met
 * de facturatietabel. Alle cijfers komen uit de domeinlogica, niet uit AI.
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

function buildUrenSheet(input: UrenWorkbookInput): XLSX.WorkSheet {
  const dateKeys = Array.from(new Set(input.timeEntries.map((entry) => dayKey(entry.date)))).sort(
    (a, b) => a - b,
  );
  const employees = Array.from(new Set(input.timeEntries.map((entry) => entry.employeeName))).sort();

  // hours[employee][dateKey]
  const hours = new Map<string, Map<number, number>>();
  for (const entry of input.timeEntries) {
    const key = dayKey(entry.date);
    const row = hours.get(entry.employeeName) ?? new Map<number, number>();
    row.set(key, round1((row.get(key) ?? 0) + entry.hours));
    hours.set(entry.employeeName, row);
  }

  const dateLabels = dateKeys.map((key) => formatDayKey(key));

  const aoa: (string | number | null)[][] = [];
  aoa.push([`Overzicht uren - ${input.contractCode}`]);
  aoa.push([]);
  aoa.push(["NAAM", ...dateLabels, "Eindtotaal"]);

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

  // Euro-notatie op de bedrag-kolommen (prijs, btw, totaal) en de eenheidsprijs.
  const lastRow = aoa.length - 1;
  for (let r = 1; r <= lastRow; r += 1) {
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 1 })); // eenheidsprijs
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 4 })); // prijs
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 5 })); // btw
    setEuro(sheet, XLSX.utils.encode_cell({ r, c: 6 })); // totaal
  }
  setEuro(sheet, "I2");
  setEuro(sheet, "J2");
  setEuro(sheet, "K2");
  return sheet;
}

export function buildUrenWorkbook(input: UrenWorkbookInput): Buffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, buildUrenSheet(input), "Gepresteerde uren");
  XLSX.utils.book_append_sheet(workbook, buildBedragenSheet(input), "Overzicht bedragen");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
