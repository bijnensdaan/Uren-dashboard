import { describe, expect, it } from "vitest";
import { normalizeSuggestionPercentages } from "../../lib/domain/allocation-suggestion";
import { createSimulationProposal } from "../../lib/domain/simulation";

// AI-verdeelsleutel: percentages worden gecorrigeerd tot een som van exact 100,
// ook als de AI iets naast 100 teruggeeft. Daarna levert createSimulationProposal
// dezelfde deterministische uren-verdeling als bij de standaardverdeelsleutel.
describe("normalizeSuggestionPercentages", () => {
  it("corrigeert een som van 99 naar exact 100", () => {
    const normalized = normalizeSuggestionPercentages([
      { profileCategoryId: "manager", profileName: "Manager", suggestedPercentage: 5, rationale: "" },
      { profileCategoryId: "senior", profileName: "Senior", suggestedPercentage: 30, rationale: "" },
      { profileCategoryId: "junior", profileName: "Junior", suggestedPercentage: 64, rationale: "" },
    ]);

    const total = normalized.reduce((sum, line) => sum + line.suggestedPercentage, 0);
    expect(Math.round(total * 100) / 100).toBe(100);
  });

  it("schaalt een som ver boven 100 terug naar exact 100", () => {
    const normalized = normalizeSuggestionPercentages([
      { profileCategoryId: "manager", profileName: "Manager", suggestedPercentage: 10, rationale: "" },
      { profileCategoryId: "senior", profileName: "Senior", suggestedPercentage: 60, rationale: "" },
      { profileCategoryId: "junior", profileName: "Junior", suggestedPercentage: 130, rationale: "" },
    ]);

    const total = normalized.reduce((sum, line) => sum + line.suggestedPercentage, 0);
    expect(Math.round(total * 100) / 100).toBe(100);
  });

  it("levert daarna een urenverdeling die exact op het budget uitkomt", () => {
    const normalized = normalizeSuggestionPercentages([
      { profileCategoryId: "manager", profileName: "Manager", suggestedPercentage: 5, rationale: "" },
      { profileCategoryId: "senior", profileName: "Senior", suggestedPercentage: 30, rationale: "" },
      { profileCategoryId: "junior", profileName: "Junior", suggestedPercentage: 64, rationale: "" },
    ]);

    const proposal = createSimulationProposal(
      380,
      normalized.map((line) => ({
        profileCategoryId: line.profileCategoryId,
        profileName: line.profileName,
        targetPercentage: line.suggestedPercentage,
      })),
    );

    const total = proposal.reduce((sum, line) => sum + line.finalHours, 0);
    expect(Math.round(total * 10) / 10).toBe(380);
  });
});
