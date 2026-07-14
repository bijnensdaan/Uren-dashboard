import { describe, expect, it } from "vitest";
import { FULL_DAY_HOURS, HALF_DAY_HOURS } from "../../lib/domain/calculations";
import { buildPvFacturatie, hoursToDays } from "../../lib/domain/pv";
import { hoursToDays as planningHoursToDays } from "../../lib/domain/planning";

describe("PV-persoondagen (opdrachtomschrijving: 4 / 8 uur)", () => {
  it("verankert de dagconstanten op 4 en 8 uur", () => {
    expect(HALF_DAY_HOURS).toBe(4);
    expect(FULL_DAY_HOURS).toBe(8);
  });

  it("rekent persoondagen als uren / 8", () => {
    expect(hoursToDays(8)).toBe(1);
    expect(hoursToDays(4)).toBe(0.5);
    expect(hoursToDays(40)).toBe(5); // 5 volledige dagen
    expect(hoursToDays(80)).toBe(10);
  });

  it("gebruikt in de planning dezelfde dagdefinitie als in het PV", () => {
    expect(planningHoursToDays(40)).toBe(5);
    expect(planningHoursToDays(4)).toBe(0.5);
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

  it("vult de facturatietabel met persoondagen = uren / 8", () => {
    const facturatie = buildPvFacturatie(
      [
        { profileCategoryId: "senior", profileName: "Expert/Senior", finalHours: 80 },
        { profileCategoryId: "junior", profileName: "Junior", finalHours: 4 },
      ],
      { senior: 100, junior: 50 },
      21,
    );

    expect(facturatie.lines[0].days).toBe(10); // 80 / 8
    expect(facturatie.lines[1].days).toBe(0.5); // 4 / 8
    expect(facturatie.totals.days).toBe(10.5);
    expect(facturatie.totals.hours).toBe(84);

    // Bedragen blijven uren × eenheidsprijs (dagen wijzigen de facturatie niet).
    expect(facturatie.lines[0].amountExclVat).toBe(8000);
    expect(facturatie.lines[1].amountExclVat).toBe(200);
    expect(facturatie.totals.amountExclVat).toBe(8200);
  });
});
