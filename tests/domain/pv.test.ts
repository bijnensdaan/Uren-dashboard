import { describe, expect, it } from "vitest";
import { FULL_DAY_HOURS, HALF_DAY_HOURS } from "../../lib/domain/calculations";
import { buildPvFacturatie, hoursToDays } from "../../lib/domain/pv";
import { hoursToDays as planningHoursToDays } from "../../lib/domain/planning";

describe("PV-persoondagen (opdrachtomschrijving: 3,8 / 7,6 uur)", () => {
  it("verankert de dagconstanten op 3,8 en 7,6 uur", () => {
    expect(HALF_DAY_HOURS).toBe(3.8);
    expect(FULL_DAY_HOURS).toBe(7.6);
  });

  it("rekent persoondagen als uren / 7,6", () => {
    expect(hoursToDays(7.6)).toBe(1);
    expect(hoursToDays(3.8)).toBe(0.5);
    expect(hoursToDays(38)).toBe(5); // 5 volledige dagen
    expect(hoursToDays(76)).toBe(10);
    // Expliciet: NIET de oude aanname van 8 uur per dag.
    expect(hoursToDays(76)).not.toBe(76 / 8);
  });

  it("gebruikt in de planning dezelfde dagdefinitie als in het PV", () => {
    expect(planningHoursToDays(38)).toBe(5);
    expect(planningHoursToDays(3.8)).toBe(0.5);
  });

  it("ondersteunt een contractdag van 8 uur in planning en PV", () => {
    expect(hoursToDays(8, 8)).toBe(1);
    expect(hoursToDays(4, 8)).toBe(0.5);
    expect(planningHoursToDays(12, 8)).toBe(1.5);

    const facturatie = buildPvFacturatie(
      [{ profileCategoryId: "senior", profileName: "Expert/Senior", finalHours: 12 }],
      { senior: 100 },
      21,
      8,
    );
    expect(facturatie.lines[0].days).toBe(1.5);
    expect(facturatie.lines[0].amountExclVat).toBe(1200);
  });

  it("vult de facturatietabel met persoondagen = uren / 7,6", () => {
    const facturatie = buildPvFacturatie(
      [
        { profileCategoryId: "senior", profileName: "Expert/Senior", finalHours: 76 },
        { profileCategoryId: "junior", profileName: "Junior", finalHours: 3.8 },
      ],
      { senior: 100, junior: 50 },
      21,
    );

    expect(facturatie.lines[0].days).toBe(10); // 76 / 7,6
    expect(facturatie.lines[1].days).toBe(0.5); // 3,8 / 7,6
    expect(facturatie.totals.days).toBe(10.5);
    expect(facturatie.totals.hours).toBe(79.8);

    // Bedragen blijven uren × eenheidsprijs (dagen wijzigen de facturatie niet).
    expect(facturatie.lines[0].amountExclVat).toBe(7600);
    expect(facturatie.lines[1].amountExclVat).toBe(190);
    expect(facturatie.totals.amountExclVat).toBe(7790);
  });
});
