import assert from "node:assert/strict";
import {
  FULL_DAY_HOURS,
  HALF_DAY_HOURS,
  calculateProfileActuals,
  getBudgetStatus,
} from "../lib/domain/calculations";
import { createSimulationProposal } from "../lib/domain/simulation";

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

console.log("domain-tests-ok");
