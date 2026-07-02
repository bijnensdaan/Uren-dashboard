import { describe, expect, it } from "vitest";
import { validateAllocationPercentages } from "../../lib/domain/admin";

describe("validateAllocationPercentages", () => {
  it("accepteert een verdeelsleutel die exact op 100% uitkomt", () => {
    expect(
      validateAllocationPercentages([
        { profileCategoryId: "manager", targetPercentage: 3 },
        { profileCategoryId: "senior", targetPercentage: 31 },
        { profileCategoryId: "junior", targetPercentage: 66 },
      ]),
    ).toEqual({ total: 100 });
  });

  it("weigert een verdeelsleutel die niet op 100% uitkomt", () => {
    expect(() =>
      validateAllocationPercentages([
        { profileCategoryId: "manager", targetPercentage: 3 },
        { profileCategoryId: "senior", targetPercentage: 31 },
        { profileCategoryId: "junior", targetPercentage: 65 },
      ]),
    ).toThrow(/100%/);
  });
});
