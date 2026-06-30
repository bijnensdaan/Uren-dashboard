import { callGeminiStructured, type GeminiFilePart } from "./gemini";
import { type AllocationSuggestion, type ExtractedContractData } from "./allocation-suggestion";
import { roundTwo } from "./calculations";
import { normalizePersonName } from "./name-normalization";

/**
 * Uitgebreide verdeelsleutelregel met optioneel uurtarief, zoals Gemini dit uit
 * de opdrachtbrief kan lezen. Het unitPrice-veld is null wanneer het document
 * geen expliciet tarief per profiel vermeldt.
 */
export type OfferAllocationLine = {
  profileCategoryId: string;
  profileName: string;
  suggestedPercentage: number;
  /** Uurtarief/eenheidsprijs per profiel als het document dit vermeldt; anders null. */
  unitPrice: number | null;
  rationale: string;
};

export type OfferAllocationSource = "explicit" | "inferred";

export type OfferSuggestedProfile = {
  name: string;
  defaultAllocationPercentage: number | null;
  source: OfferAllocationSource;
  rationale: string;
};

export type OfferSuggestedEmployee = {
  name: string;
  profileName: string;
  weeklyCapacityHours: number | null;
  source: OfferAllocationSource;
  rationale: string;
};

export type OfferSuggestedTask = {
  name: string;
  source: OfferAllocationSource;
  rationale: string;
};

/**
 * Haalt uit een geüploade offerte/opdrachtbrief (PDF of platte tekst) gestructureerd
 * de gegevens die de verdeelsleutel en de PV-stamdata voorvullen. Gemini leest het
 * document rechtstreeks (multimodal); er wordt geen cijfer berekend — getallen worden
 * letterlijk uit het document overgenomen en de percentages worden daarna in code
 * naar een som van 100 gecorrigeerd.
 */
export type OfferExtractionInput = {
  contractCode: string;
  contractName: string;
  knownProfiles: Array<{ profileCategoryId: string; profileName: string }>;
  /** Stuur een file mee voor PDF (inline data naar Gemini). */
  file?: GeminiFilePart;
  /** Gebruik platte tekst als bron (voor .docx en .txt uploads). */
  sourceText?: string;
};

const SYSTEM_INSTRUCTION = [
  "Je leest een Belgische overheidsofferte of opdrachtbrief en haalt er gestructureerde gegevens uit.",
  "Neem getallen (uren-budget, percentages) letterlijk over uit het document; bereken niets zelf.",
  "Als het document expliciete percentages per profiel of rol vermeldt, neem die letterlijk over en zet allocationSource op explicit.",
  "Als het document geen expliciete verdeelsleutel bevat, stel dan zelf een redelijke percentageverdeling voor over de aangeleverde profielen en zet allocationSource op inferred.",
  "Bij allocationSource inferred moet overallRationale duidelijk zeggen dat de verdeelsleutel niet letterlijk in het document stond en door AI is voorgesteld.",
  "Laat de percentages in lines samen optellen tot 100.",
  "Haal ook profielen/rollen uit het document. Als rollen niet letterlijk als profiel staan, mag je profielen voorstellen op basis van de opdrachtinhoud en markeer source als inferred.",
  "Haal teamleden/werknemers alleen over als hun persoonsnaam letterlijk in het document staat en ze deel uitmaken van het projectteam/de opdrachtnemer/het uitvoerende personeel.",
  "Als het document secties bevat zoals 'Projectteam', 'Personeel', 'Team opdrachtnemer' of gelijkaardig, gebruik uitsluitend die secties voor suggestedEmployees.",
  "Sluit opdrachtgever, stakeholders, contactpersonen, sponsors, validatiepersonen, leden van externe teams en ondertekenaars uit suggestedEmployees, ook als hun naam letterlijk in het document staat.",
  "Voorbeelden van uit te sluiten rollen: opdrachtgever, FOD BOSA-contactpersoon, domein manager/sponsor, AI4Belgium-teamlid, rector, ondertekenaar.",
  "Verzin geen persoonsnamen en maak geen placeholders.",
  "Als er geen letterlijke persoonsnamen staan, geef suggestedEmployees als lege array terug.",
  "Haal ook taken/werkpakketten/activiteiten uit het document. Als taken niet letterlijk als lijst staan, mag je taken voorstellen op basis van de opdrachtinhoud en markeer source als inferred.",
  "Gebruik in lines uitsluitend de aangeleverde profielen met hun exacte profileCategoryId. Nieuwe rollen/profielen zet je in suggestedProfiles.",
  "Voor tekstvelden (opdrachtbrief-titel, referentie, bestekcode, namen): geef de waarde uit het document, of null als ze er niet in staat.",
  "Verzin geen namen, bedragen of referenties die niet in het document voorkomen.",
].join(" ");

function buildResponseSchema(knownProfiles: OfferExtractionInput["knownProfiles"]) {
  const allowedIds = knownProfiles.map((profile) => profile.profileCategoryId);
  return {
    type: "object",
    properties: {
      orderLetterTitle: { type: "string", nullable: true },
      orderLetterReference: { type: "string", nullable: true },
      specificationCode: { type: "string", nullable: true, description: "Bestekcode." },
      domainManagerName: { type: "string", nullable: true },
      domainManagerRole: { type: "string", nullable: true, description: "Functietitel van de domeinmanager (bv. Domainmanager, Sponsor); null als niet vermeld." },
      domainManagerOrg: { type: "string", nullable: true, description: "Organisatie of afdeling van de domeinmanager; null als niet vermeld." },
      projectLeadNames: { type: "string", nullable: true },
      vatPercentage: { type: "number", nullable: true, description: "Btw-percentage (bv. 21); null als niet vermeld." },
      totalBudgetAmount: { type: "number", nullable: true, description: "Totaalbudget in EUR exclusief btw; null als niet vermeld." },
      suggestedTotalHours: {
        type: "number",
        nullable: true,
        description: "Totaal aantal voorziene werkuren/uren-budget; letterlijk overnemen of null.",
      },
      overallRationale: { type: "string" },
      allocationSource: {
        type: "string",
        enum: ["explicit", "inferred"],
        description:
          "explicit als de percentages letterlijk in het document staan; inferred als Gemini de verdeelsleutel zelf heeft voorgesteld.",
      },
      suggestedProfiles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            defaultAllocationPercentage: {
              type: "number",
              nullable: true,
              description:
                "Standaardpercentage voor dit profiel als het logisch uit document of voorstel volgt; anders null.",
            },
            source: { type: "string", enum: ["explicit", "inferred"] },
            rationale: { type: "string" },
          },
          required: ["name", "defaultAllocationPercentage", "source", "rationale"],
          propertyOrdering: ["name", "defaultAllocationPercentage", "source", "rationale"],
        },
      },
      suggestedEmployees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description:
                "Alleen een letterlijke persoonsnaam uit het document. Geen placeholders of afgeleide namen.",
            },
            profileName: { type: "string" },
            weeklyCapacityHours: {
              type: "number",
              nullable: true,
              description: "Weekcapaciteit als vermeld of logisch voorgesteld; anders null.",
            },
            source: { type: "string", enum: ["explicit", "inferred"] },
            rationale: { type: "string" },
          },
          required: ["name", "profileName", "weeklyCapacityHours", "source", "rationale"],
          propertyOrdering: ["name", "profileName", "weeklyCapacityHours", "source", "rationale"],
        },
      },
      suggestedTasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            source: { type: "string", enum: ["explicit", "inferred"] },
            rationale: { type: "string" },
          },
          required: ["name", "source", "rationale"],
          propertyOrdering: ["name", "source", "rationale"],
        },
      },
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            profileCategoryId: {
              type: "string",
              enum: allowedIds.length > 0 ? allowedIds : undefined,
            },
            profileName: { type: "string" },
            suggestedPercentage: {
              type: "number",
              description:
                "Percentage voor dit profiel. Letterlijk overnemen bij allocationSource explicit; zelf voorstellen bij allocationSource inferred.",
            },
            unitPrice: {
              type: "number",
              nullable: true,
              description:
                "Uurtarief of eenheidsprijs voor dit profiel als het document dit expliciet vermeldt; anders null. Nooit berekenen — letterlijk overnemen.",
            },
            rationale: { type: "string" },
          },
          required: ["profileCategoryId", "profileName", "suggestedPercentage", "unitPrice", "rationale"],
          propertyOrdering: ["profileCategoryId", "profileName", "suggestedPercentage", "unitPrice", "rationale"],
        },
      },
    },
    required: [
      "orderLetterTitle",
      "orderLetterReference",
      "specificationCode",
      "domainManagerName",
      "domainManagerRole",
      "domainManagerOrg",
      "projectLeadNames",
      "vatPercentage",
      "totalBudgetAmount",
      "suggestedTotalHours",
      "overallRationale",
      "allocationSource",
      "suggestedProfiles",
      "suggestedEmployees",
      "suggestedTasks",
      "lines",
    ],
    propertyOrdering: [
      "orderLetterTitle",
      "orderLetterReference",
      "specificationCode",
      "domainManagerName",
      "domainManagerRole",
      "domainManagerOrg",
      "projectLeadNames",
      "vatPercentage",
      "totalBudgetAmount",
      "suggestedTotalHours",
      "overallRationale",
      "allocationSource",
      "suggestedProfiles",
      "suggestedEmployees",
      "suggestedTasks",
      "lines",
    ],
  };
}

type RawExtraction = ExtractedContractData & {
  suggestedTotalHours: number | null;
  overallRationale: string;
  allocationSource: OfferAllocationSource;
  suggestedProfiles: OfferSuggestedProfile[];
  suggestedEmployees: OfferSuggestedEmployee[];
  suggestedTasks: OfferSuggestedTask[];
  lines: OfferAllocationLine[];
};

function cleanText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

function cleanSource(value: unknown): OfferAllocationSource {
  return value === "explicit" ? "explicit" : "inferred";
}

export async function extractOfferDetails(
  input: OfferExtractionInput,
): Promise<{
  model: string;
  suggestion: AllocationSuggestion;
  offerLines: OfferAllocationLine[];
  allocationSource: OfferAllocationSource;
  suggestedProfiles: OfferSuggestedProfile[];
  suggestedEmployees: OfferSuggestedEmployee[];
  suggestedTasks: OfferSuggestedTask[];
}> {
  const profilesText = input.knownProfiles
    .map((profile) => `- ${profile.profileName} (profileCategoryId: ${profile.profileCategoryId})`)
    .join("\n");

  const sourceBlock = input.sourceText?.trim()
    ? `Documenttekst:\n${input.sourceText.trim()}`
      : [
        "Lees het bijgevoegde document en vul het schema in: stamdata (titel, referentie, bestek, namen),",
        "het uren-budget als dat vermeld staat, en een verdeelsleutel.",
        "Als het document geen expliciete verdeelsleutel noemt, stel zelf een verdeling voor en markeer allocationSource als inferred.",
      ].join(" ");

  const userPrompt = [
    `Contract: ${input.contractCode} - ${input.contractName}`,
    "",
    "Beschikbare profielen (gebruik uitsluitend deze, met exact dit profileCategoryId):",
    profilesText,
    "",
    sourceBlock,
  ].join("\n");

  const { model, data } = await callGeminiStructured<RawExtraction>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    responseSchema: buildResponseSchema(input.knownProfiles),
    files: input.file ? [input.file] : undefined,
  });

  const profileById = new Map(
    input.knownProfiles.map((profile) => [profile.profileCategoryId, profile.profileName]),
  );

  const offerLines: OfferAllocationLine[] = (Array.isArray(data.lines) ? data.lines : [])
    .filter((line) => profileById.has(line.profileCategoryId))
    .map((line) => {
      const rawPrice = Number(line.unitPrice);
      const rawPercentage = Number(line.suggestedPercentage);
      return {
        profileCategoryId: line.profileCategoryId,
        profileName: profileById.get(line.profileCategoryId) ?? line.profileName,
        suggestedPercentage: Number.isFinite(rawPercentage) && rawPercentage > 0 ? roundTwo(rawPercentage) : 0,
        unitPrice: Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : null,
        rationale: line.rationale ?? "",
      };
    })
    .filter((line) => line.suggestedPercentage > 0 || line.unitPrice !== null);

  const allocationLines = offerLines.filter((line) => line.suggestedPercentage > 0);
  const rawTotal = Number(data.suggestedTotalHours);
  const suggestedTotalHours =
    Number.isFinite(rawTotal) && rawTotal > 0 ? roundTwo(rawTotal) : null;
  const allocationSource: OfferAllocationSource =
    data.allocationSource === "explicit" ? "explicit" : "inferred";
  const suggestedProfiles: OfferSuggestedProfile[] = (Array.isArray(data.suggestedProfiles)
    ? data.suggestedProfiles
    : [])
    .map((profile) => {
      const rawPercentage = Number(profile.defaultAllocationPercentage);
      return {
        name: String(profile.name ?? "").trim(),
        defaultAllocationPercentage:
          Number.isFinite(rawPercentage) && rawPercentage >= 0 && rawPercentage <= 100
            ? roundTwo(rawPercentage)
            : null,
        source: cleanSource(profile.source),
        rationale: String(profile.rationale ?? "").trim(),
      };
    })
    .filter((profile) => profile.name.length > 0);
  const suggestedEmployees: OfferSuggestedEmployee[] = (Array.isArray(data.suggestedEmployees)
    ? data.suggestedEmployees
    : [])
    .map((employee) => {
      const rawCapacity = Number(employee.weeklyCapacityHours);
      return {
        name: String(employee.name ?? "").trim(),
        profileName: String(employee.profileName ?? "").trim(),
        weeklyCapacityHours:
          Number.isFinite(rawCapacity) && rawCapacity >= 0 && rawCapacity <= 80
            ? roundTwo(rawCapacity)
            : null,
        source: "explicit" as const,
        rationale: String(employee.rationale ?? "").trim(),
      };
    })
    .filter((employee) => employee.name.length > 0 && employee.profileName.length > 0)
    .filter((employee, index, employees) => {
      const key = normalizePersonName(employee.name);
      return employees.findIndex((candidate) => normalizePersonName(candidate.name) === key) === index;
    });
  const suggestedTasks: OfferSuggestedTask[] = (Array.isArray(data.suggestedTasks)
    ? data.suggestedTasks
    : [])
    .map((task) => ({
      name: String(task.name ?? "").trim(),
      source: cleanSource(task.source),
      rationale: String(task.rationale ?? "").trim(),
    }))
    .filter((task) => task.name.length > 0);
  const overallRationale =
    allocationSource === "inferred"
      ? [
          "De verdeelsleutel stond niet letterlijk in het document en is door Gemini voorgesteld.",
          data.overallRationale ?? "",
        ]
          .filter(Boolean)
          .join(" ")
      : data.overallRationale ?? "";

  return {
    model,
    offerLines,
    allocationSource,
    suggestedProfiles,
    suggestedEmployees,
    suggestedTasks,
    suggestion: {
      lines: allocationLines.map((line) => ({
        profileCategoryId: line.profileCategoryId,
        profileName: line.profileName,
        suggestedPercentage: line.suggestedPercentage,
        rationale: line.rationale,
      })),
      overallRationale,
      suggestedTotalHours,
      extractedContract: {
        orderLetterTitle: cleanText(data.orderLetterTitle),
        orderLetterReference: cleanText(data.orderLetterReference),
        specificationCode: cleanText(data.specificationCode),
        domainManagerName: cleanText(data.domainManagerName),
        domainManagerRole: cleanText(data.domainManagerRole),
        domainManagerOrg: cleanText(data.domainManagerOrg),
        projectLeadNames: cleanText(data.projectLeadNames),
        vatPercentage: (() => { const n = Number(data.vatPercentage); return Number.isFinite(n) && n > 0 && n <= 100 ? n : null; })(),
        totalBudgetAmount: (() => { const n = Number(data.totalBudgetAmount); return Number.isFinite(n) && n > 0 ? n : null; })(),
      },
    },
  };
}
