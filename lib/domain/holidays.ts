/**
 * Belgische wettelijke feestdagen, puur en deterministisch berekend (geen externe
 * bron of AI). Vaste feestdagen: 1 januari, 1 mei, 21 juli, 15 augustus,
 * 1 november, 11 november en 25 december. Paasgebonden feestdagen: paasmaandag
 * (Pasen + 1), O.L.H. Hemelvaart (Pasen + 39) en pinkstermaandag (Pasen + 50),
 * met Pasen berekend via het Gauss/Anonymous Gregorian-algoritme.
 * Gebruikt door de planning-engine om weken met feestdagen minder uren te geven.
 */

/** Paaszondag van een jaar (Anonymous Gregorian / Gauss-algoritme), lokale datum. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = maart, 4 = april
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Alle Belgische wettelijke feestdagen van een jaar (lokale datums op middernacht). */
export function belgianHolidays(year: number): Date[] {
  const easter = easterSunday(year);
  return [
    new Date(year, 0, 1), // Nieuwjaar
    addDays(easter, 1), // Paasmaandag
    new Date(year, 4, 1), // Dag van de Arbeid
    addDays(easter, 39), // O.L.H. Hemelvaart
    addDays(easter, 50), // Pinkstermaandag
    new Date(year, 6, 21), // Nationale feestdag
    new Date(year, 7, 15), // O.L.V. Hemelvaart
    new Date(year, 10, 1), // Allerheiligen
    new Date(year, 10, 11), // Wapenstilstand
    new Date(year, 11, 25), // Kerstmis
  ];
}

// Cache per jaar zodat de weekverdeling niet telkens opnieuw Pasen berekent.
const holidayCache = new Map<number, Set<number>>();

function holidayTimestamps(year: number): Set<number> {
  let cached = holidayCache.get(year);
  if (!cached) {
    cached = new Set(belgianHolidays(year).map((date) => date.getTime()));
    holidayCache.set(year, cached);
  }
  return cached;
}

/** Is deze (lokale) datum een Belgische wettelijke feestdag? */
export function isBelgianHoliday(date: Date): boolean {
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return holidayTimestamps(midnight.getFullYear()).has(midnight.getTime());
}

/**
 * Aantal werkdagen (ma-vr, exclusief feestdagen) in de week die op weekStart
 * begint. Verwacht een maandag (zoals de weekbuckets van de planning-engine);
 * telt de vijf dagen vanaf weekStart. Resultaat: 0 t/m 5.
 */
export function workdaysInWeek(weekStart: Date): number {
  let workdays = 0;
  for (let offset = 0; offset < 5; offset++) {
    const day = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + offset);
    if (!isBelgianHoliday(day)) workdays += 1;
  }
  return workdays;
}
