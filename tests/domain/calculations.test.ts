import { describe, expect, it } from "vitest";
import {
  FULL_DAY_HOURS,
  HALF_DAY_HOURS,
  calculateContractSummary,
  calculateProfileActuals,
  getBudgetStatus,
  getBudgetUsage,
  roundOne,
  roundTwo,
  sumHours,
} from "../../lib/domain/calculations";

describe("constanten", () => {
  it("halve en volledige werkdag in uren", () => {
    expect(HALF_DAY_HOURS).toBe(4);
    expect(FULL_DAY_HOURS).toBe(8);
  });
});

describe("roundOne / roundTwo", () => {
  it("rondt af op één decimaal", () => {
    expect(roundOne(1.24)).toBe(1.2);
    expect(roundOne(1.25)).toBe(1.3);
    expect(roundOne(-1.24)).toBe(-1.2);
    expect(roundOne(7.6)).toBe(7.6);
  });

  it("rondt af op twee decimalen", () => {
    expect(roundTwo(1.234)).toBe(1.23);
    expect(roundTwo(1.236)).toBe(1.24);
    expect(roundTwo(33.333333)).toBe(33.33);
  });
});

describe("getBudgetUsage", () => {
  it("berekent het verbruikspercentage", () => {
    expect(getBudgetUsage(50, 100)).toBe(50);
    expect(getBudgetUsage(1, 3)).toBe(33.33);
    expect(getBudgetUsage(120, 100)).toBe(120);
  });

  it("geeft 0 bij budget 0 of negatief (geen deling door nul)", () => {
    expect(getBudgetUsage(50, 0)).toBe(0);
    expect(getBudgetUsage(50, -10)).toBe(0);
  });
});

describe("getBudgetStatus", () => {
  it("hanteert de standaarddrempels 85/95 (inclusief grenswaarden)", () => {
    expect(getBudgetStatus(84.9)).toBe("normal");
    expect(getBudgetStatus(85)).toBe("warning");
    expect(getBudgetStatus(94.9)).toBe("warning");
    expect(getBudgetStatus(95)).toBe("critical");
    expect(getBudgetStatus(120)).toBe("critical");
  });

  it("respecteert aangepaste drempels", () => {
    expect(getBudgetStatus(60, 50, 70)).toBe("warning");
    expect(getBudgetStatus(70, 50, 70)).toBe("critical");
    expect(getBudgetStatus(49.9, 50, 70)).toBe("normal");
  });
});

describe("sumHours", () => {
  it("sommeert uren en rondt af op één decimaal", () => {
    expect(sumHours([])).toBe(0);
    expect(
      sumHours([
        { hours: 7.6, profileCategoryId: "a" },
        { hours: 0.3, profileCategoryId: "b" },
      ]),
    ).toBe(7.9);
    // Floating-point-ruis (0.1 + 0.2) wordt weggerond.
    expect(
      sumHours([
        { hours: 0.1, profileCategoryId: "a" },
        { hours: 0.2, profileCategoryId: "a" },
      ]),
    ).toBe(0.3);
  });
});

describe("calculateProfileActuals", () => {
  const targets = [
    { profileCategoryId: "junior", targetPercentage: 94, profileName: "Junior" },
    { profileCategoryId: "manager", targetPercentage: 6, profileName: "Manager" },
  ];

  it("markeert een afwijking van exact 3% niet (drempel is strikt groter dan)", () => {
    const rows = calculateProfileActuals(
      [
        { hours: 97, profileCategoryId: "junior" },
        { hours: 3, profileCategoryId: "manager" },
      ],
      targets,
    );

    expect(rows[0].deviation).toBe(3);
    expect(rows[0].isDeviation).toBe(false);
    expect(rows[1].deviation).toBe(-3);
    expect(rows[1].isDeviation).toBe(false);
  });

  it("markeert een afwijking groter dan 3% wel", () => {
    const rows = calculateProfileActuals(
      [
        { hours: 98, profileCategoryId: "junior" },
        { hours: 2, profileCategoryId: "manager" },
      ],
      targets,
    );

    expect(rows[0].actualPercentage).toBe(98);
    expect(rows[0].deviation).toBe(4);
    expect(rows[0].isDeviation).toBe(true);
    expect(rows[1].deviation).toBe(-4);
    expect(rows[1].isDeviation).toBe(true);
  });

  it("geeft 0% werkelijk bij ontbrekende uren", () => {
    const rows = calculateProfileActuals([], targets);
    expect(rows[0].actualHours).toBe(0);
    expect(rows[0].actualPercentage).toBe(0);
    expect(rows[0].deviation).toBe(-94);
    expect(rows[0].isDeviation).toBe(true);
  });

  it("valt terug op profileCategoryId als profielnaam ontbreekt", () => {
    const rows = calculateProfileActuals([], [{ profileCategoryId: "junior", targetPercentage: 100 }]);
    expect(rows[0].profileName).toBe("junior");
  });
});

describe("calculateContractSummary", () => {
  it("berekent totaal, resterend, verbruik en status", () => {
    const summary = calculateContractSummary({
      budgetHours: 100,
      entries: [
        { hours: 90, profileCategoryId: "junior" },
        { hours: 6, profileCategoryId: "manager" },
      ],
    });

    expect(summary.totalHours).toBe(96);
    expect(summary.remainingHours).toBe(4);
    expect(summary.usagePercentage).toBe(96);
    expect(summary.status).toBe("critical");
  });

  it("gebruikt aangepaste drempels", () => {
    const summary = calculateContractSummary({
      budgetHours: 100,
      entries: [{ hours: 60, profileCategoryId: "junior" }],
      warningThreshold: 50,
      criticalThreshold: 70,
    });

    expect(summary.status).toBe("warning");
  });

  it("blijft veilig bij budget 0", () => {
    const summary = calculateContractSummary({
      budgetHours: 0,
      entries: [{ hours: 10, profileCategoryId: "junior" }],
    });

    expect(summary.totalHours).toBe(10);
    expect(summary.remainingHours).toBe(-10);
    expect(summary.usagePercentage).toBe(0);
    expect(summary.status).toBe("normal");
  });
});
