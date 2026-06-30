import { FULL_DAY_HOURS, roundOne, roundTwo } from "./calculations";

/**
 * Deterministische berekening van de Facturatie-tabel van een proces-verbaal,
 * in de structuur van de bestaande PV's in docs/. Geen AI: alle bedragen,
 * uren en persoondagen worden hier berekend uit de finale uren per profiel,
 * de eenheidsprijzen en het btw-percentage die de gebruiker aanlevert.
 */
export type PvProfileHours = {
  profileCategoryId: string;
  profileName: string;
  finalHours: number;
};

export type PvFacturatieLine = {
  profileCategoryId: string;
  profileName: string;
  unitPrice: number; // eenheidsprijs excl. btw (per uur)
  hours: number; // uren
  days: number; // persoondagen = uren / 7,6
  amountExclVat: number; // prijs
  vatAmount: number; // btw
  amountInclVat: number; // totaal prijs incl. btw
};

export type PvFacturatie = {
  lines: PvFacturatieLine[];
  totals: {
    hours: number;
    days: number;
    amountExclVat: number;
    vatAmount: number;
    amountInclVat: number;
  };
};

/** Persoondagen voor de "Inzet van:"-sectie (uren gedeeld door een voltijdse dag). */
export function hoursToDays(hours: number) {
  return roundOne(hours / FULL_DAY_HOURS);
}

/**
 * Berekent de facturatie exact volgens de methode uit de Excel-bestanden in docs/
 * ("Overzicht bedragen"):
 *   prijs (excl. btw) = uren × eenheidsprijs (per uur)  — op centniveau, NIET op hele euro's
 *   btw               = prijs × btw%
 *   totaal incl. btw  = prijs + btw
 *   totalen           = som van de exacte regelwaarden (daarna pas afgerond)
 * De PV-weergave toont hele euro's zoals het Word-document, maar de onderliggende
 * waarden blijven exact zodat de totalen kloppen.
 */
export function buildPvFacturatie(
  profiles: PvProfileHours[],
  unitPriceByProfile: Record<string, number>,
  vatPercentage: number,
): PvFacturatie {
  const vat = Number.isFinite(vatPercentage) ? vatPercentage : 21;

  const lines: PvFacturatieLine[] = profiles.map((profile) => {
    const unitPrice = Number(unitPriceByProfile[profile.profileCategoryId]) || 0;
    const exclExact = profile.finalHours * unitPrice;
    const vatExact = (exclExact * vat) / 100;

    return {
      profileCategoryId: profile.profileCategoryId,
      profileName: profile.profileName,
      unitPrice,
      hours: roundOne(profile.finalHours),
      days: hoursToDays(profile.finalHours),
      amountExclVat: roundTwo(exclExact),
      vatAmount: roundTwo(vatExact),
      amountInclVat: roundTwo(exclExact + vatExact),
    };
  });

  // Totalen uit de exacte (niet-afgeronde) waarden, net als in de Excel.
  let exactExcl = 0;
  let sumHours = 0;
  let sumDays = 0;
  for (const profile of profiles) {
    const unitPrice = Number(unitPriceByProfile[profile.profileCategoryId]) || 0;
    exactExcl += profile.finalHours * unitPrice;
    sumHours += profile.finalHours;
    sumDays += hoursToDays(profile.finalHours);
  }
  const exactVat = (exactExcl * vat) / 100;

  return {
    lines,
    totals: {
      hours: roundOne(sumHours),
      days: roundOne(sumDays),
      amountExclVat: roundTwo(exactExcl),
      vatAmount: roundTwo(exactVat),
      amountInclVat: roundTwo(exactExcl + exactVat),
    },
  };
}

export type PvData = {
  periodStart: string;
  periodEnd: string;
  vatPercentage: number;
  alreadyInvoiced: number; // reeds gefactureerd (incl. btw)
  totalBudgetAmount: number; // beschikbaar totaalbudget in euro
  specificationCode: string; // bestekcode
  orderLetterTitle: string;
  orderLetterReference: string;
  bestelbon: string; // FEDCOM Bestelbonnummer
  financieleEmail: string; // "Financiële dienst UHasselt: email"
  date: string; // "Datum:" regel
  domainManagerName: string;
  domainManagerRole: string;
  domainManagerOrg: string;
  projectLeadNames: string;
  projectLeadOrg: string;
  unitPriceByProfile: Record<string, number>;
};

export function emptyPvData(): PvData {
  return {
    periodStart: "",
    periodEnd: "",
    vatPercentage: 21,
    alreadyInvoiced: 0,
    totalBudgetAmount: 0,
    specificationCode: "",
    orderLetterTitle: "",
    orderLetterReference: "",
    bestelbon: "",
    financieleEmail: "sarah.elshout@uhasselt.be",
    date: "",
    domainManagerName: "",
    domainManagerRole: "Domeinmanager",
    domainManagerOrg: "FOD Beleid & Ondersteuning\nDG Vereenvoudiging & Digitalisering",
    projectLeadNames: "",
    projectLeadOrg: "FOD Beleid & Ondersteuning\nDG Vereenvoudiging & Digitalisering",
    unitPriceByProfile: {},
  };
}

export function parsePvData(json: string | null | undefined): PvData {
  if (!json) {
    return emptyPvData();
  }
  try {
    return { ...emptyPvData(), ...(JSON.parse(json) as Partial<PvData>) };
  } catch {
    return emptyPvData();
  }
}

export type PvDefaultsInput = {
  contract: {
    vatPercentage: number;
    totalBudgetAmount: number | null;
    specificationCode: string | null;
    orderLetterTitle: string | null;
    orderLetterReference: string | null;
    domainManagerName: string | null;
    domainManagerRole: string | null;
    domainManagerOrg: string | null;
    projectLeadNames: string | null;
    projectLeadOrg: string | null;
  };
  profileRates: Array<{ profileCategoryId: string; unitPrice: number }>;
  periodStart: string;
  periodEnd: string;
  alreadyInvoiced: number;
};

/**
 * Bouwt de PV-gegevens automatisch op uit de stamdata op contractniveau
 * (tarieven, btw, namen, bestek/opdrachtbrief, budget), de periode afgeleid uit
 * de time entries en de reeds gefactureerde som uit de Invoice-historiek.
 * Niets hiervan wordt door AI ingevuld; het zijn deterministische defaults die
 * de gebruiker per PV nog kan overschrijven.
 */
export function buildPvDefaults(input: PvDefaultsInput): PvData {
  const base = emptyPvData();
  const unitPriceByProfile: Record<string, number> = {};
  for (const rate of input.profileRates) {
    unitPriceByProfile[rate.profileCategoryId] = rate.unitPrice;
  }

  return {
    ...base,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    vatPercentage: input.contract.vatPercentage ?? base.vatPercentage,
    alreadyInvoiced: input.alreadyInvoiced,
    totalBudgetAmount: input.contract.totalBudgetAmount ?? 0,
    specificationCode: input.contract.specificationCode ?? "",
    orderLetterTitle: input.contract.orderLetterTitle ?? "",
    orderLetterReference: input.contract.orderLetterReference ?? "",
    domainManagerName: input.contract.domainManagerName ?? "",
    domainManagerRole: input.contract.domainManagerRole || base.domainManagerRole,
    domainManagerOrg: input.contract.domainManagerOrg || base.domainManagerOrg,
    projectLeadNames: input.contract.projectLeadNames ?? "",
    projectLeadOrg: input.contract.projectLeadOrg || base.projectLeadOrg,
    unitPriceByProfile,
  };
}
