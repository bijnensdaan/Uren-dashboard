import { callGeminiStructured, type GeminiFilePart } from "./gemini";
import { type AllocationSuggestion, type ExtractedContractData } from "./allocation-suggestion";

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
import { roundTwo } from "./calculations";

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
  "Extraheer alleen een verdeelsleutel als het document expliciete percentages per profiel of rol vermeldt.",
  "Stel nooit zelf een percentageverdeling voor en leid geen percentages af uit taken, budget, tarieven of ervaring.",
  "Als er geen expliciete verdeelsleutel in het document staat, geef lines als lege array terug.",
  "Gebruik uitsluitend de aangeleverde profielen met hun exacte profileCategoryId.",
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
      projectLeadNames: { type: "string", nullable: true },
      suggestedTotalHours: {
        type: "number",
        nullable: true,
        description: "Totaal aantal voorziene werkuren/uren-budget; letterlijk overnemen of null.",
      },
      overallRationale: { type: "string" },
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
                "Alleen een letterlijk in het document vermeld percentage voor dit profiel. Niet afleiden of schatten.",
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
      "projectLeadNames",
      "suggestedTotalHours",
      "overallRationale",
      "lines",
    ],
    propertyOrdering: [
      "orderLetterTitle",
      "orderLetterReference",
      "specificationCode",
      "domainManagerName",
      "projectLeadNames",
      "suggestedTotalHours",
      "overallRationale",
      "lines",
    ],
  };
}

type RawExtraction = ExtractedContractData & {
  suggestedTotalHours: number | null;
  overallRationale: string;
  lines: OfferAllocationLine[];
};

function cleanText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export async function extractOfferDetails(
  input: OfferExtractionInput,
): Promise<{ model: string; suggestion: AllocationSuggestion; offerLines: OfferAllocationLine[] }> {
  const profilesText = input.knownProfiles
    .map((profile) => `- ${profile.profileName} (profileCategoryId: ${profile.profileCategoryId})`)
    .join("\n");

  const sourceBlock = input.sourceText?.trim()
    ? `Documenttekst:\n${input.sourceText.trim()}`
      : [
        "Lees het bijgevoegde document en vul het schema in: stamdata (titel, referentie, bestek, namen),",
        "het uren-budget als dat vermeld staat, en alleen expliciet vermelde percentages per profiel.",
        "Als het document geen verdeelsleutel noemt, geef lines als lege array terug.",
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

  return {
    model,
    offerLines,
    suggestion: {
      lines: allocationLines.map((line) => ({
        profileCategoryId: line.profileCategoryId,
        profileName: line.profileName,
        suggestedPercentage: line.suggestedPercentage,
        rationale: line.rationale,
      })),
      overallRationale:
        allocationLines.length > 0
          ? data.overallRationale ?? ""
          : "Geen expliciete verdeelsleutel gevonden in het document. Er wordt geen verdeling overgenomen.",
      suggestedTotalHours,
      extractedContract: {
        orderLetterTitle: cleanText(data.orderLetterTitle),
        orderLetterReference: cleanText(data.orderLetterReference),
        specificationCode: cleanText(data.specificationCode),
        domainManagerName: cleanText(data.domainManagerName),
        projectLeadNames: cleanText(data.projectLeadNames),
      },
    },
  };
}
