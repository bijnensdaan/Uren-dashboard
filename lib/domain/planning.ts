import { FULL_DAY_HOURS, roundOne } from "./calculations";
import { workdaysInWeek } from "./holidays";
import { normalizePercentages } from "./simulation";

/**
 * Deterministische planning-engine. Spreidt het urenbudget van een contract over
 * weken (volledige looptijd) per profiel en per medewerker, op basis van de
 * verdeelsleutel en een fasering. Gemini levert alleen de fases (vorm); ALLE uren,
 * dagen en capaciteitsvlaggen worden hier berekend, nooit door de AI.
 *
 * Belgische feestdagen worden meegenomen in de weekverdeling: elke week telt
 * normaal 5 werkdagen (ma-vr); wettelijke feestdagen die op een weekdag vallen
 * verlagen dat aantal. De fasegewichten per week worden vermenigvuldigd met
 * (werkdagen/5) en daarna hernormaliseerd naar som 100, zodat weken met
 * feestdagen proportioneel minder uren krijgen (een week zonder werkdagen krijgt
 * gewicht 0). Het totale urenbudget blijft daarbij exact behouden.
 */
export type Phase = {
  name: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;
  weightPercentage: number;
  relatedTasks?: string[];
  rationale?: string;
};

export type WeekBucket = {
  index: number;
  weekStart: Date;
  weekEnd: Date;
  label: string;
  monthLabel: string;
};

export type PlanEmployee = {
  employeeId: string;
  employeeName: string;
  profileCategoryId: string;
  profileName: string;
  weeklyCapacityHours: number;
  weight: number;
};

export type PlanGridRow = {
  employeeId: string;
  employeeName: string;
  profileName: string;
  profileCategoryId: string;
  weeklyCapacityHours: number;
  weeklyHours: number[];
  totalHours: number;
  overloadedWeeks: number[];
};

export type PlanGrid = {
  weeks: WeekBucket[];
  rows: PlanGridRow[];
  profileTotals: Array<{ profileName: string; totalHours: number }>;
  capacityWarnings: Array<{ employeeName: string; weekLabel: string; hours: number; capacity: number }>;
  grandTotalHours: number;
};

const DAY_MS = 86400000;

function atMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeek(date: Date) {
  const d = atMidnight(date);
  const offset = (d.getDay() + 6) % 7; // 0 = maandag
  d.setDate(d.getDate() - offset);
  return d;
}

function isoWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
}

function dmShort(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function buildWeekGrid(start: Date, end: Date): WeekBucket[] {
  const weeks: WeekBucket[] = [];
  const endTime = atMidnight(end).getTime();
  let cursor = startOfWeek(start);
  let index = 0;
  while (cursor.getTime() <= endTime && index < 600) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weeks.push({
      index,
      weekStart,
      weekEnd,
      label: `wk ${isoWeek(weekStart)} · ${dmShort(weekStart)}`,
      monthLabel: `${MONTHS[weekStart.getMonth()]} ${weekStart.getFullYear()}`,
    });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
    index += 1;
  }
  return weeks;
}

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / DAY_MS) + 1;
}

/**
 * Gewicht per week (sommeert tot 100). Elke fase verdeelt zijn gewicht evenredig
 * over de weken die ze overlapt; weken in zwaardere fases krijgen meer. Zonder
 * (geldige) fases wordt gelijkmatig over alle weken verdeeld.
 */
export function phaseWeightsPerWeek(phases: Phase[], weeks: WeekBucket[]): number[] {
  if (weeks.length === 0) return [];

  const raw = weeks.map((week) => {
    let value = 0;
    for (const phase of phases) {
      const pStart = atMidnight(new Date(phase.startDate));
      const pEnd = atMidnight(new Date(phase.endDate));
      if (Number.isNaN(pStart.getTime()) || Number.isNaN(pEnd.getTime()) || pEnd < pStart) continue;
      const phaseDays = overlapDays(pStart, pEnd, pStart, pEnd);
      const weight = Number(phase.weightPercentage);
      if (phaseDays <= 0 || !Number.isFinite(weight) || weight <= 0) continue;
      const overlap = overlapDays(week.weekStart, week.weekEnd, pStart, pEnd);
      if (overlap > 0) value += weight * (overlap / phaseDays);
    }
    return value;
  });

  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return weeks.map(() => 100 / weeks.length);
  }
  return raw.map((value) => (value / total) * 100);
}

/**
 * Weegt de weekgewichten met het aantal werkdagen per week (ma-vr, minus
 * Belgische feestdagen): gewicht × (werkdagen/5), daarna hernormaliseren naar
 * som 100. Een week zonder werkdagen krijgt zo gewicht 0. Als er (theoretisch)
 * geen enkele werkdag overblijft, worden de originele gewichten teruggegeven.
 */
export function applyHolidayWeekWeights(weights: number[], weeks: WeekBucket[]): number[] {
  const adjusted = weights.map((weight, index) => weight * (workdaysInWeek(weeks[index].weekStart) / 5));
  const total = adjusted.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return weights;
  return adjusted.map((value) => (value / total) * 100);
}

/**
 * Verdeelt een totaal over buckets volgens gewichten% met laatste-bucket-correctie.
 * Guard: geen enkele bucket mag negatief worden. Als de correctie de laatste
 * bucket onder nul zou duwen, wordt het tekort van achter naar voor teruggehaald
 * uit eerdere buckets met waarde > 0, zodat de som exact het totaal blijft.
 */
function distribute(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  let running = 0;
  const result = weights.map((weight, index) => {
    const isLast = index === weights.length - 1;
    const value = isLast ? roundOne(total - running) : roundOne((total * weight) / 100);
    running = roundOne(running + value);
    return value;
  });
  const correction = roundOne(total - result.reduce((sum, value) => sum + value, 0));
  if (correction !== 0) {
    result[result.length - 1] = roundOne(result[result.length - 1] + correction);
  }
  // Guard tegen negatieve buckets: haal het tekort terug uit eerdere buckets.
  for (let index = result.length - 1; index >= 0; index--) {
    if (result[index] >= 0) continue;
    let deficit = roundOne(-result[index]);
    result[index] = 0;
    for (let source = index - 1; source >= 0 && deficit > 0; source--) {
      if (result[source] <= 0) continue;
      const take = Math.min(result[source], deficit);
      result[source] = roundOne(result[source] - take);
      deficit = roundOne(deficit - take);
    }
  }
  return result;
}

export function hoursToDays(hours: number) {
  return roundOne(hours / FULL_DAY_HOURS);
}

export function buildPlanGrid(input: {
  start: Date;
  end: Date;
  totalHours: number;
  allocation: Array<{ profileCategoryId: string; profileName: string; percentage: number }>;
  phases: Phase[];
  employees: PlanEmployee[];
}): PlanGrid {
  const weeks = buildWeekGrid(input.start, input.end);
  // Fasegewichten, gecorrigeerd voor Belgische feestdagen (minder werkdagen = minder uren).
  const weekWeights = applyHolidayWeekWeights(phaseWeightsPerWeek(input.phases, weeks), weeks);

  const allocation = normalizePercentages(
    input.allocation.map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileName,
      targetPercentage: line.percentage,
    })),
  );

  // Uren per profiel per week.
  const profileWeekHours = new Map<string, number[]>();
  for (const line of allocation) {
    const profileTotal = roundOne((input.totalHours * line.targetPercentage) / 100);
    profileWeekHours.set(line.profileCategoryId, distribute(profileTotal, weekWeights));
  }

  const rows: PlanGridRow[] = [];
  const capacityWarnings: PlanGrid["capacityWarnings"] = [];

  for (const line of allocation) {
    const weekHours = profileWeekHours.get(line.profileCategoryId) ?? weeks.map(() => 0);
    const profileEmployees = input.employees.filter(
      (employee) => employee.profileCategoryId === line.profileCategoryId,
    );

    if (profileEmployees.length === 0) {
      rows.push({
        employeeId: "",
        employeeName: "(niet toegewezen)",
        profileName: line.profileName,
        profileCategoryId: line.profileCategoryId,
        weeklyCapacityHours: 0,
        weeklyHours: weekHours,
        totalHours: roundOne(weekHours.reduce((sum, value) => sum + value, 0)),
        overloadedWeeks: [],
      });
      continue;
    }

    const weightSum = profileEmployees.reduce((sum, employee) => sum + (employee.weight || 0), 0);
    const shares = profileEmployees.map((employee) =>
      weightSum > 0 ? ((employee.weight || 0) / weightSum) * 100 : 100 / profileEmployees.length,
    );

    // Per week de profieluren over de medewerkers verdelen.
    const perEmployeeWeek = profileEmployees.map(() => [] as number[]);
    weeks.forEach((_, weekIndex) => {
      const split = distribute(weekHours[weekIndex], shares);
      split.forEach((value, employeeIndex) => {
        perEmployeeWeek[employeeIndex].push(value);
      });
    });

    profileEmployees.forEach((employee, employeeIndex) => {
      const employeeWeeks = perEmployeeWeek[employeeIndex];
      const overloadedWeeks: number[] = [];
      employeeWeeks.forEach((value, weekIndex) => {
        if (employee.weeklyCapacityHours > 0 && value > employee.weeklyCapacityHours + 0.001) {
          overloadedWeeks.push(weekIndex);
          capacityWarnings.push({
            employeeName: employee.employeeName,
            weekLabel: weeks[weekIndex].label,
            hours: value,
            capacity: employee.weeklyCapacityHours,
          });
        }
      });
      rows.push({
        employeeId: employee.employeeId,
        employeeName: employee.employeeName,
        profileName: employee.profileName,
        profileCategoryId: employee.profileCategoryId,
        weeklyCapacityHours: employee.weeklyCapacityHours,
        weeklyHours: employeeWeeks,
        totalHours: roundOne(employeeWeeks.reduce((sum, value) => sum + value, 0)),
        overloadedWeeks,
      });
    });
  }

  const profileTotals = allocation.map((line) => ({
    profileName: line.profileName,
    totalHours: roundOne(
      (profileWeekHours.get(line.profileCategoryId) ?? []).reduce((sum, value) => sum + value, 0),
    ),
  }));

  return {
    weeks,
    rows,
    profileTotals,
    capacityWarnings,
    grandTotalHours: roundOne(rows.reduce((sum, row) => sum + row.totalHours, 0)),
  };
}
