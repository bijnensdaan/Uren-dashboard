import assert from "node:assert/strict";
import {
  FULL_DAY_HOURS,
  HALF_DAY_HOURS,
  calculateProfileActuals,
  getBudgetStatus,
} from "../lib/domain/calculations";
import { createSimulationProposal } from "../lib/domain/simulation";
import { inferColumnMapping, parseCsv, validateImportRows } from "../lib/domain/import";
import { validateAllocationPercentages } from "../lib/domain/admin";
import { buildDashboardAlerts } from "../lib/domain/dashboard-alerts";

assert.equal(HALF_DAY_HOURS, 3.8);
assert.equal(FULL_DAY_HOURS, 7.6);

assert.equal(getBudgetStatus(84.9), "normal");
assert.equal(getBudgetStatus(85), "warning");
assert.equal(getBudgetStatus(95), "critical");

const profileRows = calculateProfileActuals(
  [
    { hours: 97, profileCategoryId: "junior" },
    { hours: 3, profileCategoryId: "manager" },
  ],
  [
    { profileCategoryId: "junior", targetPercentage: 94, profileName: "Junior" },
    { profileCategoryId: "manager", targetPercentage: 6, profileName: "Manager" },
  ],
);

assert.equal(profileRows[0].deviation, 3);
assert.equal(profileRows[0].isDeviation, false);
assert.equal(profileRows[1].deviation, -3);
assert.equal(profileRows[1].isDeviation, false);

const proposal = createSimulationProposal(101, [
  { profileCategoryId: "manager", profileName: "Manager", targetPercentage: 3 },
  { profileCategoryId: "senior", profileName: "Senior", targetPercentage: 31 },
  { profileCategoryId: "junior", profileName: "Junior", targetPercentage: 66 },
]);
const total = proposal.reduce((sum, line) => sum + line.finalHours, 0);
assert.equal(Math.round(total * 10) / 10, 101);

const parsedImport = parseCsv(
  [
    "medewerker,datum,uren,taak,contract,profiel,opmerkingen",
    "Sara Peeters,2026-06-01,7.6,Analyse,C-2026-001,Expert/Senior,ok",
    "Sara Peeters,2026-06-01,7.6,Analyse,C-2026-001,Expert/Senior,dubbel",
    "Onbekend,2026-06-02,3.8,Analyse,C-2026-001,Expert/Senior,fout",
  ].join("\n"),
);
const mapping = inferColumnMapping(parsedImport.columns);
assert.equal(mapping.employee, "medewerker");
assert.equal(mapping.date, "datum");
assert.equal(mapping.hours, "uren");
const validation = validateImportRows(parsedImport.rows, mapping, {
  employees: [{ id: "employee-1", name: "Sara Peeters", profileCategoryId: "profile-senior" }],
  contracts: [{ id: "contract-1", code: "C-2026-001" }],
  tasks: [{ id: "task-1", name: "Analyse", contractId: "contract-1" }],
  profiles: [{ id: "profile-senior", name: "Expert/Senior" }],
  existingEntries: [],
});
assert.equal(validation.totalRows, 3);
assert.equal(validation.validRows, 1);
assert.equal(validation.invalidRows, 2);
assert.equal(validation.duplicateRows, 1);
assert.equal(validation.rows[2].errors.some((error) => error.includes("Medewerker niet gevonden")), true);

assert.deepEqual(
  validateAllocationPercentages([
    { profileCategoryId: "manager", targetPercentage: 3 },
    { profileCategoryId: "senior", targetPercentage: 31 },
    { profileCategoryId: "junior", targetPercentage: 66 },
  ]),
  { total: 100 },
);
assert.throws(
  () =>
    validateAllocationPercentages([
      { profileCategoryId: "manager", targetPercentage: 3 },
      { profileCategoryId: "senior", targetPercentage: 31 },
      { profileCategoryId: "junior", targetPercentage: 65 },
    ]),
  /100%/,
);

const dashboardAlerts = buildDashboardAlerts(
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
assert.equal(dashboardAlerts[0].severity, "critical");
assert.equal(dashboardAlerts.some((alert) => alert.category === "budget"), true);
assert.equal(dashboardAlerts.some((alert) => alert.category === "profile"), true);
assert.equal(dashboardAlerts.some((alert) => alert.category === "stale"), true);
assert.equal(dashboardAlerts.some((alert) => alert.category === "task"), true);
assert.equal(
  dashboardAlerts.findIndex((alert) => alert.severity === "critical") <
    dashboardAlerts.findIndex((alert) => alert.severity === "warning"),
  true,
);

console.log("domain-tests-ok");
