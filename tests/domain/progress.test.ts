import { describe, expect, it } from "vitest";
import { buildWeekGrid } from "../../lib/domain/planning";
import {
  bucketActualHoursPerWeek,
  buildBurnup,
  buildPlanVsActual,
  deviationLevel,
} from "../../lib/domain/progress";

describe("bucketActualHoursPerWeek", () => {
  it("bucket entries op de juiste week van de weekgrid", () => {
    const weeks = buildWeekGrid(new Date(2026, 2, 2), new Date(2026, 2, 15));
    const perWeek = bucketActualHoursPerWeek(
      [
        { date: new Date(2026, 2, 3), hours: 2 },
        { date: new Date(2026, 2, 5), hours: 3 },
        { date: new Date(2026, 2, 10), hours: 4 },
      ],
      weeks,
    );
    expect(perWeek).toEqual([5, 4]);
  });

  it("klemt entries buiten de looptijd op de eerste/laatste week (totaal blijft behouden)", () => {
    const weeks = buildWeekGrid(new Date(2026, 2, 2), new Date(2026, 2, 15));
    const perWeek = bucketActualHoursPerWeek(
      [
        { date: new Date(2026, 1, 20), hours: 1.5 }, // voor de start
        { date: new Date(2026, 3, 1), hours: 2.5 }, // na het einde
      ],
      weeks,
    );
    expect(perWeek).toEqual([1.5, 2.5]);
  });
});

describe("buildBurnup", () => {
  const start = new Date(2026, 2, 2);
  const end = new Date(2026, 2, 15);
  const entries = [
    { date: new Date(2026, 2, 3), hours: 2 },
    { date: new Date(2026, 2, 5), hours: 3 },
    { date: new Date(2026, 2, 10), hours: 4 },
  ];

  it("bouwt een cumulatieve reeks die oploopt, met vast budget per punt", () => {
    const burnup = buildBurnup({
      start,
      end,
      budgetHours: 100,
      entries,
      plannedWeekly: [10, 10],
      today: new Date(2026, 2, 20), // na de looptijd: alles gestart
    });
    expect(burnup.points.map((point) => point.cumulativeActual)).toEqual([5, 9]);
    expect(burnup.points.map((point) => point.cumulativePlanned)).toEqual([10, 20]);
    expect(burnup.points.every((point) => point.budgetHours === 100)).toBe(true);
    expect(burnup.actualToDate).toBe(9);
    expect(burnup.plannedToDate).toBe(20);
  });

  it("geeft toekomstweken geen werkelijk-waarde (lijn stopt bij vandaag)", () => {
    const burnup = buildBurnup({
      start,
      end,
      budgetHours: 100,
      entries,
      plannedWeekly: [10, 10],
      today: new Date(2026, 2, 4), // in de eerste week
    });
    expect(burnup.points[0].cumulativeActual).toBe(5);
    expect(burnup.points[1].cumulativeActual).toBeNull();
    // De geplande lijn loopt wel door over de volledige looptijd.
    expect(burnup.points[1].cumulativePlanned).toBe(20);
    expect(burnup.actualToDate).toBe(5);
    expect(burnup.plannedToDate).toBe(10);
  });

  it("zonder plan is de geplande reeks null (en plannedToDate ook)", () => {
    const burnup = buildBurnup({
      start,
      end,
      budgetHours: 100,
      entries,
      plannedWeekly: null,
      today: new Date(2026, 2, 20),
    });
    expect(burnup.points.every((point) => point.cumulativePlanned === null)).toBe(true);
    expect(burnup.plannedToDate).toBeNull();
    expect(burnup.actualToDate).toBe(9);
  });
});

describe("deviationLevel", () => {
  it("binnen 10% = ok, 10-25% = amber, meer dan 25% = red", () => {
    expect(deviationLevel(100, 105)).toBe("ok");
    expect(deviationLevel(100, 90)).toBe("ok"); // exact 10%
    expect(deviationLevel(100, 89)).toBe("amber");
    expect(deviationLevel(100, 125)).toBe("amber"); // exact 25%
    expect(deviationLevel(100, 74)).toBe("red");
    expect(deviationLevel(100, 130)).toBe("red");
  });

  it("zonder geplande uren: geen prestaties = ok, wel prestaties = red", () => {
    expect(deviationLevel(0, 0)).toBe("ok");
    expect(deviationLevel(0, 5)).toBe("red");
  });
});

describe("buildPlanVsActual", () => {
  // Zes weken: 5 met maandag in maart 2026, 1 in april 2026.
  const weeks = buildWeekGrid(new Date(2026, 2, 2), new Date(2026, 3, 12));
  const plannedWeekly = [10, 10, 10, 10, 10, 10];

  it("groepeert per maand op basis van de maandag van de week", () => {
    expect(weeks).toHaveLength(6);
    const result = buildPlanVsActual({
      weeks,
      plannedWeekly,
      entries: [],
      today: new Date(2026, 4, 1),
    });
    expect(result.rows.map((row) => row.monthLabel)).toEqual(["mrt 2026", "apr 2026"]);
    expect(result.rows[0].plannedHours).toBe(50);
    expect(result.rows[1].plannedHours).toBe(10);
    expect(result.totalPlannedHours).toBe(60);
  });

  it("vergelijkt werkelijk met gepland-tot-nu en kleurt binnen 10% als ok", () => {
    const result = buildPlanVsActual({
      weeks,
      plannedWeekly,
      entries: [
        { date: new Date(2026, 2, 4), hours: 10 },
        { date: new Date(2026, 2, 11), hours: 10 },
        { date: new Date(2026, 2, 17), hours: 10 },
      ],
      today: new Date(2026, 2, 18), // week van 16 maart is gestart; 23 en 30 maart nog niet
    });
    const march = result.rows[0];
    expect(march.plannedToDateHours).toBe(30);
    expect(march.actualHours).toBe(30);
    expect(march.deviationHours).toBe(0);
    expect(march.level).toBe("ok");
    expect(result.totalLevel).toBe("ok");
  });

  it("kent amber en red toe volgens de statusniveaus", () => {
    const amber = buildPlanVsActual({
      weeks,
      plannedWeekly,
      entries: [{ date: new Date(2026, 2, 4), hours: 26 }],
      today: new Date(2026, 2, 18), // gepland tot nu: 30 u; 26 u = ~13% afwijking
    });
    expect(amber.rows[0].level).toBe("amber");

    const red = buildPlanVsActual({
      weeks,
      plannedWeekly,
      entries: [{ date: new Date(2026, 2, 4), hours: 20 }],
      today: new Date(2026, 2, 18), // 20 u van 30 u = ~33% afwijking
    });
    expect(red.rows[0].level).toBe("red");
    expect(red.rows[0].deviationHours).toBe(-10);
  });

  it("maanden in de toekomst zijn pending en tellen niet mee in het totaalniveau", () => {
    const result = buildPlanVsActual({
      weeks,
      plannedWeekly,
      entries: [{ date: new Date(2026, 2, 4), hours: 10 }],
      today: new Date(2026, 2, 4), // alleen de eerste week is gestart
    });
    expect(result.rows[1].level).toBe("pending");
    expect(result.totalPlannedToDateHours).toBe(10);
    expect(result.totalActualHours).toBe(10);
    expect(result.totalLevel).toBe("ok");
  });

  it("volledig in de toekomst: alles pending", () => {
    const result = buildPlanVsActual({
      weeks,
      plannedWeekly,
      entries: [],
      today: new Date(2026, 1, 1),
    });
    expect(result.rows.every((row) => row.level === "pending")).toBe(true);
    expect(result.totalLevel).toBe("pending");
  });
});
