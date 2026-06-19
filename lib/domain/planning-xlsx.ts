import * as XLSX from "xlsx";
import type { Phase, PlanGrid } from "./planning";

/**
 * Genereert de weekplanning als Excel: tabblad "Planning" (medewerker × week-kolommen
 * met geplande uren) en tabblad "Fases". Alle waarden komen uit de deterministische
 * PlanGrid; geen AI-cijfers.
 */
export function buildPlanningWorkbook(input: {
  contractCode: string;
  grid: PlanGrid;
  phases: Phase[];
}): Buffer {
  const { grid } = input;

  const planAoa: (string | number | null)[][] = [];
  planAoa.push([`Planning - ${input.contractCode}`]);
  planAoa.push([]);
  planAoa.push(["Medewerker", "Profiel", "Totaal (u)", ...grid.weeks.map((week) => week.label)]);

  for (const row of grid.rows) {
    planAoa.push([
      row.employeeName,
      row.profileName,
      row.totalHours,
      ...row.weeklyHours.map((hours) => (hours > 0 ? hours : null)),
    ]);
  }

  const weekTotals = grid.weeks.map((_, weekIndex) => {
    const sum = grid.rows.reduce((total, row) => total + row.weeklyHours[weekIndex], 0);
    return Math.round(sum * 10) / 10;
  });
  planAoa.push(["Totalen", "", grid.grandTotalHours, ...weekTotals.map((value) => (value > 0 ? value : null))]);

  const planSheet = XLSX.utils.aoa_to_sheet(planAoa);
  planSheet["!cols"] = [
    { wch: 22 },
    { wch: 16 },
    { wch: 10 },
    ...grid.weeks.map(() => ({ wch: 9 })),
  ];

  const phasesAoa: (string | number)[][] = [["Fase", "Start", "Eind", "Gewicht %"]];
  for (const phase of input.phases) {
    phasesAoa.push([phase.name, phase.startDate, phase.endDate, phase.weightPercentage]);
  }
  const phasesSheet = XLSX.utils.aoa_to_sheet(phasesAoa);
  phasesSheet["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, planSheet, "Planning");
  XLSX.utils.book_append_sheet(workbook, phasesSheet, "Fases");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
