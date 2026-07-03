import { roundOne } from "./calculations";
import { buildWeekGrid, type WeekBucket } from "./planning";

/**
 * Deterministische voortgangslogica: vergelijkt geplande uren (uit de
 * planning-engine) met werkelijk gepresteerde uren (time entries). Alle
 * cijfers worden hier berekend, nooit door de AI. De weekindeling volgt
 * exact dezelfde weekgrid als de planning (buildWeekGrid), zodat gepland
 * en werkelijk altijd op dezelfde buckets uitgelijnd zijn.
 */

const DAY_MS = 86400000;

function atMidnight(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export type ProgressEntry = { date: Date | string; hours: number };

/**
 * Bucket werkelijke uren op de weekgrid. Entries die (uitzonderlijk) buiten
 * de contractlooptijd vallen worden op de eerste/laatste week geklemd, zodat
 * het totaal aantal gepresteerde uren behouden blijft.
 */
export function bucketActualHoursPerWeek(entries: ProgressEntry[], weeks: WeekBucket[]): number[] {
  const perWeek = weeks.map(() => 0);
  if (weeks.length === 0) return perWeek;
  const gridStart = weeks[0].weekStart.getTime();
  for (const entry of entries) {
    const hours = Number(entry.hours);
    if (!Number.isFinite(hours) || hours === 0) continue;
    const day = atMidnight(new Date(entry.date));
    if (Number.isNaN(day.getTime())) continue;
    // Afronden op hele dagen vangt zomer/wintertijd-verschuivingen op.
    const dayDiff = Math.round((day.getTime() - gridStart) / DAY_MS);
    const index = Math.min(weeks.length - 1, Math.max(0, Math.floor(dayDiff / 7)));
    perWeek[index] += hours;
  }
  return perWeek.map(roundOne);
}

export type BurnupPoint = {
  weekIndex: number;
  label: string;
  weekStart: Date;
  /** Cumulatief werkelijk; null voor weken die nog niet gestart zijn (de lijn stopt bij vandaag). */
  cumulativeActual: number | null;
  /** Cumulatief gepland over de volledige looptijd; null als er geen plan is. */
  cumulativePlanned: number | null;
  /** Het vaste urenbudget van de opdrachtbrief (horizontale referentielijn). */
  budgetHours: number;
};

export type Burnup = {
  points: BurnupPoint[];
  /** Cumulatief werkelijk t/m de huidige week. */
  actualToDate: number;
  /** Cumulatief gepland t/m de huidige week; null zonder plan. */
  plannedToDate: number | null;
  budgetHours: number;
};

/**
 * Bouwt de cumulatieve burn-up-reeks per week over de contractlooptijd:
 * werkelijk (stopt bij vandaag), gepland (volledige lijn, null zonder plan)
 * en het vaste budget. plannedWeekly is de weekverdeling uit de planning-engine
 * (som van alle rijen per week), uitgelijnd op dezelfde weekgrid.
 */
export function buildBurnup(input: {
  start: Date;
  end: Date;
  budgetHours: number;
  entries: ProgressEntry[];
  plannedWeekly?: number[] | null;
  today?: Date;
}): Burnup {
  const weeks = buildWeekGrid(input.start, input.end);
  const today = atMidnight(input.today ?? new Date()).getTime();
  const actualPerWeek = bucketActualHoursPerWeek(input.entries, weeks);
  const hasPlan = Array.isArray(input.plannedWeekly);

  let cumulativeActual = 0;
  let cumulativePlanned = 0;
  let actualToDate = 0;
  let plannedToDate: number | null = hasPlan ? 0 : null;

  const points: BurnupPoint[] = weeks.map((week, index) => {
    cumulativeActual = roundOne(cumulativeActual + actualPerWeek[index]);
    cumulativePlanned = roundOne(cumulativePlanned + (input.plannedWeekly?.[index] ?? 0));
    const started = week.weekStart.getTime() <= today;
    if (started) {
      actualToDate = cumulativeActual;
      if (hasPlan) plannedToDate = cumulativePlanned;
    }
    return {
      weekIndex: index,
      label: week.label,
      weekStart: week.weekStart,
      cumulativeActual: started ? cumulativeActual : null,
      cumulativePlanned: hasPlan ? cumulativePlanned : null,
      budgetHours: input.budgetHours,
    };
  });

  return { points, actualToDate, plannedToDate, budgetHours: input.budgetHours };
}

/**
 * Statusniveau voor gepland vs. werkelijk: relatieve afwijking t.o.v. gepland.
 * Binnen 10% = ok, 10-25% = amber, meer dan 25% = red. Zonder geplande uren is
 * elke prestatie een rode afwijking (er hoorde niets te gebeuren).
 */
export type ProgressLevel = "ok" | "amber" | "red";

export function deviationLevel(plannedHours: number, actualHours: number): ProgressLevel {
  if (plannedHours <= 0) {
    return actualHours <= 0 ? "ok" : "red";
  }
  const deviation = Math.abs(actualHours - plannedHours) / plannedHours;
  if (deviation <= 0.1) return "ok";
  if (deviation <= 0.25) return "amber";
  return "red";
}

export type PlanVsActualRow = {
  monthLabel: string;
  /** Geplande uren van de volledige maand. */
  plannedHours: number;
  /** Geplande uren van de weken die al gestart zijn (eerlijke vergelijking halverwege een maand). */
  plannedToDateHours: number;
  actualHours: number;
  /** Werkelijk minus gepland-tot-nu. */
  deviationHours: number;
  /** "pending" zolang geen enkele week van de maand gestart is. */
  level: ProgressLevel | "pending";
};

export type PlanVsActual = {
  rows: PlanVsActualRow[];
  totalPlannedHours: number;
  totalPlannedToDateHours: number;
  totalActualHours: number;
  totalDeviationHours: number;
  totalLevel: ProgressLevel | "pending";
};

/**
 * Gepland vs. werkelijk per maand (zelfde maandgroepering als de planning-UI:
 * een week hoort bij de maand van zijn maandag). De afwijking en het status-
 * niveau vergelijken werkelijk met de geplande uren van de reeds gestarte
 * weken, zodat een lopende maand niet onterecht rood kleurt.
 */
export function buildPlanVsActual(input: {
  weeks: WeekBucket[];
  plannedWeekly: number[];
  entries: ProgressEntry[];
  today?: Date;
}): PlanVsActual {
  const today = atMidnight(input.today ?? new Date()).getTime();
  const actualPerWeek = bucketActualHoursPerWeek(input.entries, input.weeks);

  const rowByMonth = new Map<string, { planned: number; plannedToDate: number; actual: number; started: boolean }>();
  const monthOrder: string[] = [];

  input.weeks.forEach((week, index) => {
    const planned = input.plannedWeekly[index] ?? 0;
    const started = week.weekStart.getTime() <= today;
    let bucket = rowByMonth.get(week.monthLabel);
    if (!bucket) {
      bucket = { planned: 0, plannedToDate: 0, actual: 0, started: false };
      rowByMonth.set(week.monthLabel, bucket);
      monthOrder.push(week.monthLabel);
    }
    bucket.planned += planned;
    bucket.actual += actualPerWeek[index];
    if (started) {
      bucket.plannedToDate += planned;
      bucket.started = true;
    }
  });

  const rows: PlanVsActualRow[] = monthOrder.map((monthLabel) => {
    const bucket = rowByMonth.get(monthLabel)!;
    const plannedHours = roundOne(bucket.planned);
    const plannedToDateHours = roundOne(bucket.plannedToDate);
    const actualHours = roundOne(bucket.actual);
    return {
      monthLabel,
      plannedHours,
      plannedToDateHours,
      actualHours,
      deviationHours: roundOne(actualHours - plannedToDateHours),
      level: bucket.started ? deviationLevel(plannedToDateHours, actualHours) : "pending",
    };
  });

  const totalPlannedHours = roundOne(rows.reduce((sum, row) => sum + row.plannedHours, 0));
  const totalPlannedToDateHours = roundOne(rows.reduce((sum, row) => sum + row.plannedToDateHours, 0));
  const totalActualHours = roundOne(rows.reduce((sum, row) => sum + row.actualHours, 0));
  const anyStarted = rows.some((row) => row.level !== "pending");

  return {
    rows,
    totalPlannedHours,
    totalPlannedToDateHours,
    totalActualHours,
    totalDeviationHours: roundOne(totalActualHours - totalPlannedToDateHours),
    totalLevel: anyStarted ? deviationLevel(totalPlannedToDateHours, totalActualHours) : "pending",
  };
}
