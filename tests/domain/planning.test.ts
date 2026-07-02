import { describe, expect, it } from "vitest";
import {
  applyHolidayWeekWeights,
  buildPlanGrid,
  buildWeekGrid,
  phaseWeightsPerWeek,
} from "../../lib/domain/planning";

describe("buildWeekGrid", () => {
  it("bouwt weekbuckets die op maandag starten", () => {
    const weeks = buildWeekGrid(new Date(2026, 2, 2), new Date(2026, 2, 15));
    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStart.getDay()).toBe(1); // maandag
    expect(weeks[1].weekStart.getDay()).toBe(1);
  });

  it("rekt de grenzen op tot volledige weken (start midweek)", () => {
    const weeks = buildWeekGrid(new Date(2026, 2, 4), new Date(2026, 2, 10));
    // Woensdag 4 maart valt in de week van maandag 2 maart; dinsdag 10 maart
    // valt in de week van maandag 9 maart => twee buckets.
    expect(weeks).toHaveLength(2);
    expect(weeks[0].weekStart).toEqual(new Date(2026, 2, 2));
    expect(weeks[0].weekEnd).toEqual(new Date(2026, 2, 8));
    expect(weeks[1].weekStart).toEqual(new Date(2026, 2, 9));
  });
});

describe("phaseWeightsPerWeek", () => {
  it("verdeelt gelijkmatig zonder fases (som 100)", () => {
    const weeks = buildWeekGrid(new Date(2026, 2, 2), new Date(2026, 2, 15));
    const uniform = phaseWeightsPerWeek([], weeks);
    expect(uniform).toEqual([50, 50]);
  });

  it("geeft weken in zwaardere fases meer gewicht", () => {
    const weeks = buildWeekGrid(new Date(2026, 2, 2), new Date(2026, 2, 15));
    const weights = phaseWeightsPerWeek(
      [
        { name: "Zwaar", startDate: "2026-03-02", endDate: "2026-03-08", weightPercentage: 75 },
        { name: "Licht", startDate: "2026-03-09", endDate: "2026-03-15", weightPercentage: 25 },
      ],
      weeks,
    );
    expect(weights[0]).toBeCloseTo(75, 5);
    expect(weights[1]).toBeCloseTo(25, 5);
  });

  it("sommeert altijd tot 100, ook bij overlappende fases over een heel jaar", () => {
    const yearWeeks = buildWeekGrid(new Date(2026, 0, 1), new Date(2026, 11, 31));
    const weights = phaseWeightsPerWeek(
      [
        { name: "Analyse", startDate: "2026-01-01", endDate: "2026-03-31", weightPercentage: 30 },
        { name: "Implementatie", startDate: "2026-04-01", endDate: "2026-09-30", weightPercentage: 50 },
        { name: "Nazorg", startDate: "2026-10-01", endDate: "2026-12-31", weightPercentage: 20 },
      ],
      yearWeeks,
    );
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 3);
  });

  it("valt terug op gelijkmatig bij ongeldige of gewichtloze fases", () => {
    const weeks = buildWeekGrid(new Date(2026, 2, 2), new Date(2026, 2, 15));
    const weights = phaseWeightsPerWeek(
      [{ name: "Kapot", startDate: "niet-een-datum", endDate: "2026-03-08", weightPercentage: 100 }],
      weeks,
    );
    expect(weights).toEqual([50, 50]);
  });
});

describe("applyHolidayWeekWeights", () => {
  it("geeft een week met een feestdag proportioneel minder gewicht; som blijft 100", () => {
    // Week van 20 juli 2026 bevat de nationale feestdag (dinsdag 21 juli): 4 werkdagen.
    const weeks = buildWeekGrid(new Date(2026, 6, 20), new Date(2026, 7, 2));
    const weights = applyHolidayWeekWeights(phaseWeightsPerWeek([], weeks), weeks);
    expect(weights.reduce((sum, value) => sum + value, 0)).toBeCloseTo(100, 3);
    expect(weights[0]).toBeCloseTo((4 / 9) * 100, 3);
    expect(weights[1]).toBeCloseTo((5 / 9) * 100, 3);
    expect(weights[0]).toBeLessThan(weights[1]);
  });
});

describe("buildPlanGrid (distribute)", () => {
  it("reconcilieert exact met het budget en de verdeelsleutel", () => {
    const grid = buildPlanGrid({
      start: new Date(2026, 0, 1),
      end: new Date(2026, 11, 31),
      totalHours: 1000,
      allocation: [
        { profileCategoryId: "man", profileName: "Manager", percentage: 10 },
        { profileCategoryId: "sen", profileName: "Senior", percentage: 30 },
        { profileCategoryId: "jun", profileName: "Junior", percentage: 60 },
      ],
      phases: [],
      employees: [
        { employeeId: "e1", employeeName: "M1", profileCategoryId: "man", profileName: "Manager", weeklyCapacityHours: 40, weight: 1 },
        { employeeId: "e2", employeeName: "S1", profileCategoryId: "sen", profileName: "Senior", weeklyCapacityHours: 40, weight: 1 },
        { employeeId: "e3", employeeName: "J1", profileCategoryId: "jun", profileName: "Junior", weeklyCapacityHours: 40, weight: 1 },
      ],
    });

    expect(Math.abs(grid.grandTotalHours - 1000)).toBeLessThan(0.5);
    expect(grid.profileTotals.find((line) => line.profileName === "Junior")?.totalHours).toBe(600);
  });

  it("weegt weken met feestdagen minder; het totaal blijft exact behouden", () => {
    // 90 u over de weken van 20 en 27 juli 2026 => 40 u (feestdagweek) + 50 u.
    const grid = buildPlanGrid({
      start: new Date(2026, 6, 20),
      end: new Date(2026, 7, 2),
      totalHours: 90,
      allocation: [{ profileCategoryId: "jun", profileName: "Junior", percentage: 100 }],
      phases: [],
      employees: [
        { employeeId: "e3", employeeName: "J1", profileCategoryId: "jun", profileName: "Junior", weeklyCapacityHours: 60, weight: 1 },
      ],
    });

    expect(grid.rows[0].weeklyHours).toEqual([40, 50]);
    expect(grid.grandTotalHours).toBe(90);
  });

  it("guard: een klein totaal over veel weken levert nooit negatieve buckets op", () => {
    // 0,5 u over 10 weken: per week rondt 5% af op 0,1 => zonder guard zou de
    // laatste bucket negatief moeten compenseren.
    const grid = buildPlanGrid({
      start: new Date(2026, 0, 5),
      end: new Date(2026, 2, 15),
      totalHours: 0.5,
      allocation: [{ profileCategoryId: "jun", profileName: "Junior", percentage: 100 }],
      phases: [],
      employees: [
        { employeeId: "e3", employeeName: "J1", profileCategoryId: "jun", profileName: "Junior", weeklyCapacityHours: 40, weight: 1 },
      ],
    });

    expect(grid.rows[0].weeklyHours.every((value) => value >= 0)).toBe(true);
    expect(grid.grandTotalHours).toBeCloseTo(0.5, 3);
  });

  it("detecteert overbelasting per week (overloadedWeeks en capacityWarnings)", () => {
    // 160 u over 2 weken voor één junior met capaciteit 10 => beide weken overbelast.
    const grid = buildPlanGrid({
      start: new Date(2026, 2, 2),
      end: new Date(2026, 2, 15),
      totalHours: 160,
      allocation: [{ profileCategoryId: "jun", profileName: "Junior", percentage: 100 }],
      phases: [],
      employees: [
        { employeeId: "e3", employeeName: "J1", profileCategoryId: "jun", profileName: "Junior", weeklyCapacityHours: 10, weight: 1 },
      ],
    });

    expect(grid.capacityWarnings).toHaveLength(2);
    expect(grid.rows[0].overloadedWeeks).toEqual([0, 1]);
    expect(grid.capacityWarnings[0].capacity).toBe(10);
    expect(grid.capacityWarnings[0].hours).toBeGreaterThan(10);
  });

  it("meldt geen overbelasting binnen capaciteit", () => {
    const grid = buildPlanGrid({
      start: new Date(2026, 2, 2),
      end: new Date(2026, 2, 15),
      totalHours: 20,
      allocation: [{ profileCategoryId: "jun", profileName: "Junior", percentage: 100 }],
      phases: [],
      employees: [
        { employeeId: "e3", employeeName: "J1", profileCategoryId: "jun", profileName: "Junior", weeklyCapacityHours: 40, weight: 1 },
      ],
    });

    expect(grid.capacityWarnings).toHaveLength(0);
    expect(grid.rows[0].overloadedWeeks).toEqual([]);
  });
});
