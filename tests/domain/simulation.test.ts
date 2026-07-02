import { describe, expect, it } from "vitest";
import { createSimulationProposal, normalizePercentages } from "../../lib/domain/simulation";

describe("normalizePercentages", () => {
  it("schaalt percentages met som ongelijk aan 100 naar exact 100", () => {
    const normalized = normalizePercentages([
      { profileCategoryId: "man", profileName: "Manager", targetPercentage: 30 },
      { profileCategoryId: "sen", profileName: "Senior", targetPercentage: 30 },
      { profileCategoryId: "jun", profileName: "Junior", targetPercentage: 60 },
    ]);

    expect(normalized.map((line) => line.targetPercentage)).toEqual([25, 25, 50]);
    expect(normalized.reduce((sum, line) => sum + line.targetPercentage, 0)).toBeCloseTo(100, 6);
  });

  it("laat een som van 99 exact naar 100 normaliseren", () => {
    const normalized = normalizePercentages([
      { profileCategoryId: "man", profileName: "Manager", targetPercentage: 3 },
      { profileCategoryId: "sen", profileName: "Senior", targetPercentage: 31 },
      { profileCategoryId: "jun", profileName: "Junior", targetPercentage: 65 },
    ]);

    expect(normalized.reduce((sum, line) => sum + line.targetPercentage, 0)).toBeCloseTo(100, 6);
  });

  it("geeft alles 0 bij een som van 0 of negatief", () => {
    const normalized = normalizePercentages([
      { profileCategoryId: "man", profileName: "Manager", targetPercentage: 0 },
      { profileCategoryId: "jun", profileName: "Junior", targetPercentage: 0 },
    ]);

    expect(normalized.map((line) => line.targetPercentage)).toEqual([0, 0]);
  });
});

describe("createSimulationProposal", () => {
  it("verdeelt het budget zodat de som exact het totaal is", () => {
    const proposal = createSimulationProposal(101, [
      { profileCategoryId: "manager", profileName: "Manager", targetPercentage: 3 },
      { profileCategoryId: "senior", profileName: "Senior", targetPercentage: 31 },
      { profileCategoryId: "junior", profileName: "Junior", targetPercentage: 66 },
    ]);

    const total = proposal.reduce((sum, line) => sum + line.finalHours, 0);
    expect(Math.round(total * 10) / 10).toBe(101);
  });
});
