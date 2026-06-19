import assert from "node:assert/strict";
import {
  FULL_DAY_HOURS,
  HALF_DAY_HOURS,
  calculateProfileActuals,
  getBudgetStatus,
} from "../lib/domain/calculations";
import { createSimulationProposal } from "../lib/domain/simulation";
import { normalizeSuggestionPercentages } from "../lib/domain/allocation-suggestion";
import { inferColumnMapping, parseCsv, validateImportRows } from "../lib/domain/import";
import { validateAllocationPercentages } from "../lib/domain/admin";
import { buildDashboardAlerts } from "../lib/domain/dashboard-alerts";
import { buildPlanGrid, buildWeekGrid, phaseWeightsPerWeek } from "../lib/domain/planning";

assert.equal(HALF_DAY_HOURS, 4);
assert.equal(FULL_DAY_HOURS, 8);

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

// AI-verdeelsleutel: percentages worden gecorrigeerd tot een som van exact 100,
// ook als de AI iets naast 100 teruggeeft. Daarna levert createSimulationProposal
// dezelfde deterministische uren-verdeling als bij de standaardverdeelsleutel.
const normalizedOffBy = normalizeSuggestionPercentages([
  { profileCategoryId: "manager", profileName: "Manager", suggestedPercentage: 5, rationale: "" },
  { profileCategoryId: "senior", profileName: "Senior", suggestedPercentage: 30, rationale: "" },
  { profileCategoryId: "junior", profileName: "Junior", suggestedPercentage: 64, rationale: "" },
]);
assert.equal(
  Math.round(normalizedOffBy.reduce((sum, line) => sum + line.suggestedPercentage, 0) * 100) / 100,
  100,
);

const normalizedScaled = normalizeSuggestionPercentages([
  { profileCategoryId: "manager", profileName: "Manager", suggestedPercentage: 10, rationale: "" },
  { profileCategoryId: "senior", profileName: "Senior", suggestedPercentage: 60, rationale: "" },
  { profileCategoryId: "junior", profileName: "Junior", suggestedPercentage: 130, rationale: "" },
]);
assert.equal(
  Math.round(normalizedScaled.reduce((sum, line) => sum + line.suggestedPercentage, 0) * 100) / 100,
  100,
);

const suggestionProposal = createSimulationProposal(
  380,
  normalizedOffBy.map((line) => ({
    profileCategoryId: line.profileCategoryId,
    profileName: line.profileName,
    targetPercentage: line.suggestedPercentage,
  })),
);
assert.equal(
  Math.round(suggestionProposal.reduce((sum, line) => sum + line.finalHours, 0) * 10) / 10,
  380,
);

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

// Planning-engine: weekraster, fasegewichten, verdeling en capaciteit.
const twoWeeks = buildWeekGrid(new Date("2026-03-02"), new Date("2026-03-15"));
assert.equal(twoWeeks.length, 2);
assert.equal(twoWeeks[0].weekStart.getDay(), 1); // maandag

// Lege fasering => gelijkmatig, sommeert tot 100.
const uniform = phaseWeightsPerWeek([], twoWeeks);
assert.equal(Math.round(uniform.reduce((sum, value) => sum + value, 0)), 100);
assert.equal(uniform[0], 50);

// Fasegewichten sommeren altijd tot 100, ook bij overlappende fases.
const yearWeeks = buildWeekGrid(new Date("2026-01-01"), new Date("2026-12-31"));
const phaseWeights = phaseWeightsPerWeek(
  [
    { name: "Analyse", startDate: "2026-01-01", endDate: "2026-03-31", weightPercentage: 30 },
    { name: "Implementatie", startDate: "2026-04-01", endDate: "2026-09-30", weightPercentage: 50 },
    { name: "Nazorg", startDate: "2026-10-01", endDate: "2026-12-31", weightPercentage: 20 },
  ],
  yearWeeks,
);
assert.ok(Math.abs(phaseWeights.reduce((sum, value) => sum + value, 0) - 100) < 0.001);

// Verdeling reconcilieert met het budget en de verdeelsleutel.
const grid = buildPlanGrid({
  start: new Date("2026-01-01"),
  end: new Date("2026-12-31"),
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
assert.ok(Math.abs(grid.grandTotalHours - 1000) < 0.5);
assert.equal(grid.profileTotals.find((p) => p.profileName === "Junior")?.totalHours, 600);

// Capaciteit: 160 u over 2 weken voor één junior met capaciteit 10 => beide weken overbelast.
const overload = buildPlanGrid({
  start: new Date("2026-03-02"),
  end: new Date("2026-03-15"),
  totalHours: 160,
  allocation: [{ profileCategoryId: "jun", profileName: "Junior", percentage: 100 }],
  phases: [],
  employees: [
    { employeeId: "e3", employeeName: "J1", profileCategoryId: "jun", profileName: "Junior", weeklyCapacityHours: 10, weight: 1 },
  ],
});
assert.equal(overload.capacityWarnings.length, 2);
assert.equal(overload.rows[0].overloadedWeeks.length, 2);

console.log("domain-tests-ok");
