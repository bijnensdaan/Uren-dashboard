import { describe, expect, it } from "vitest";
import { belgianHolidays, easterSunday, isBelgianHoliday, workdaysInWeek } from "../../lib/domain/holidays";

describe("easterSunday", () => {
  it("berekent Pasen voor meerdere jaren (Gauss-algoritme)", () => {
    // Pasen 2024 = 31 maart, 2025 = 20 april, 2026 = 5 april.
    expect(easterSunday(2024)).toEqual(new Date(2024, 2, 31));
    expect(easterSunday(2025)).toEqual(new Date(2025, 3, 20));
    expect(easterSunday(2026)).toEqual(new Date(2026, 3, 5));
  });
});

describe("belgianHolidays", () => {
  it("geeft tien wettelijke feestdagen per jaar", () => {
    expect(belgianHolidays(2025)).toHaveLength(10);
    expect(belgianHolidays(2026)).toHaveLength(10);
  });
});

describe("isBelgianHoliday", () => {
  it("herkent de vaste feestdagen", () => {
    expect(isBelgianHoliday(new Date(2026, 0, 1))).toBe(true); // Nieuwjaar
    expect(isBelgianHoliday(new Date(2026, 4, 1))).toBe(true); // Dag van de Arbeid
    expect(isBelgianHoliday(new Date(2026, 6, 21))).toBe(true); // Nationale feestdag
    expect(isBelgianHoliday(new Date(2026, 7, 15))).toBe(true); // O.L.V. Hemelvaart
    expect(isBelgianHoliday(new Date(2026, 10, 1))).toBe(true); // Allerheiligen
    expect(isBelgianHoliday(new Date(2026, 10, 11))).toBe(true); // Wapenstilstand
    expect(isBelgianHoliday(new Date(2026, 11, 25))).toBe(true); // Kerstmis
  });

  it("herkent de paasgebonden feestdagen van 2026 (Pasen = 5 april)", () => {
    expect(isBelgianHoliday(new Date(2026, 3, 6))).toBe(true); // paasmaandag
    expect(isBelgianHoliday(new Date(2026, 4, 14))).toBe(true); // O.L.H. Hemelvaart
    expect(isBelgianHoliday(new Date(2026, 4, 25))).toBe(true); // pinkstermaandag
  });

  it("herkent de paasgebonden feestdagen van 2025 (Pasen = 20 april)", () => {
    expect(isBelgianHoliday(new Date(2025, 3, 21))).toBe(true); // paasmaandag
    expect(isBelgianHoliday(new Date(2025, 4, 29))).toBe(true); // O.L.H. Hemelvaart
    expect(isBelgianHoliday(new Date(2025, 5, 9))).toBe(true); // pinkstermaandag
  });

  it("markeert gewone dagen niet als feestdag", () => {
    expect(isBelgianHoliday(new Date(2026, 6, 22))).toBe(false);
    // Paaszondag zelf is geen wettelijke feestdag (valt sowieso op zondag).
    expect(isBelgianHoliday(new Date(2026, 3, 5))).toBe(false);
  });
});

describe("workdaysInWeek", () => {
  it("telt 4 werkdagen in een week met een feestdag op een weekdag", () => {
    // 21 juli 2026 is een dinsdag.
    expect(workdaysInWeek(new Date(2026, 6, 20))).toBe(4);
    // Kerstmis 2026 valt op vrijdag.
    expect(workdaysInWeek(new Date(2026, 11, 21))).toBe(4);
  });

  it("telt 5 werkdagen als de feestdag in het weekend valt", () => {
    // 1 november 2026 valt op zondag.
    expect(workdaysInWeek(new Date(2026, 9, 26))).toBe(5);
  });

  it("telt 5 werkdagen in een gewone week", () => {
    expect(workdaysInWeek(new Date(2026, 2, 2))).toBe(5);
  });
});
