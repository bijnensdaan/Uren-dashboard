import { describe, expect, it } from "vitest";
import { buildDashboardAlerts } from "../../lib/domain/dashboard-alerts";

describe("buildDashboardAlerts", () => {
  const alerts = buildDashboardAlerts(
    [
      {
        id: "contract-critical",
        code: "C-CRIT",
        name: "Kritiek contract",
        totalBudgetHours: 100,
        warningThreshold: 85,
        criticalThreshold: 95,
        timeEntries: [
          {
            date: new Date("2026-06-01"),
            hours: 96,
            profileCategoryId: "junior",
            taskId: "task-implementation",
            task: { name: "Implementatie" },
          },
        ],
        allocationTemplates: [
          { profileCategoryId: "manager", targetPercentage: 3, profileCategory: { name: "Manager" } },
          { profileCategoryId: "junior", targetPercentage: 66, profileCategory: { name: "Junior" } },
        ],
      },
      {
        id: "contract-stale",
        code: "C-STALE",
        name: "Stil contract",
        totalBudgetHours: 100,
        warningThreshold: 85,
        criticalThreshold: 95,
        timeEntries: [
          {
            date: new Date("2026-01-01"),
            hours: 7.6,
            profileCategoryId: "junior",
            taskId: "task-analysis",
            task: { name: "Analyse" },
          },
        ],
        allocationTemplates: [
          { profileCategoryId: "junior", targetPercentage: 100, profileCategory: { name: "Junior" } },
        ],
      },
    ],
    { referenceDate: new Date("2026-06-19"), staleAfterDays: 30, highTaskShareThreshold: 0.4 },
  );

  it("zet de meest kritieke melding bovenaan", () => {
    expect(alerts[0].severity).toBe("critical");
    expect(
      alerts.findIndex((alert) => alert.severity === "critical") <
        alerts.findIndex((alert) => alert.severity === "warning"),
    ).toBe(true);
  });

  it("dekt alle categorieën: budget, profiel, stilgevallen en taak", () => {
    expect(alerts.some((alert) => alert.category === "budget")).toBe(true);
    expect(alerts.some((alert) => alert.category === "profile")).toBe(true);
    expect(alerts.some((alert) => alert.category === "stale")).toBe(true);
    expect(alerts.some((alert) => alert.category === "task")).toBe(true);
  });
});
