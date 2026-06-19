import { callGeminiStructured, type GeminiFilePart } from "./gemini";
import {
  normalizeSuggestionPercentages,
  type AllocationSuggestion,
  type AllocationSuggestionLine,
  type ExtractedContractData,
} from "./allocation-suggestion";
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
  file: GeminiFilePart;
};

const SYSTEM_INSTRUCTION = [
  "Je leest een Belgische overheidsofferte of opdrachtbrief en haalt er gestructureerde gegevens uit.",
  "Neem getallen (uren-budget, percentages) letterlijk over uit het document; bereken niets zelf.",
  "Stel een percentageverdeling voor over de aangeleverde profielen op basis van wat het document beschrijft;",
  "gebruik uitsluitend de aangeleverde profielen met hun exacte profileCategoryId, en laat de percentages optellen tot 100.",
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
            suggestedPercentage: { type: "number" },
            rationale: { type: "string" },
          },
          required: ["profileCategoryId", "profileName", "suggestedPercentage", "rationale"],
          propertyOrdering: ["profileCategoryId", "profileName", "suggestedPercentage", "rationale"],
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
  lines: AllocationSuggestionLine[];
};

function cleanText(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export async function extractOfferDetails(
  input: OfferExtractionInput,
): Promise<{ model: string; suggestion: AllocationSuggestion }> {
  const profilesText = input.knownProfiles
    .map((profile) => `- ${profile.profileName} (profileCategoryId: ${profile.profileCategoryId})`)
    .join("\n");

  const userPrompt = [
    `Contract: ${input.contractCode} - ${input.contractName}`,
    "",
    "Beschikbare profielen (gebruik uitsluitend deze, met exact dit profileCategoryId):",
    profilesText,
    "",
    "Lees het bijgevoegde document en vul het schema in: stamdata (titel, referentie, bestek, namen),",
    "het uren-budget als dat vermeld staat, en een percentageverdeling per profiel die optelt tot 100.",
  ].join("\n");

  const { model, data } = await callGeminiStructured<RawExtraction>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    responseSchema: buildResponseSchema(input.knownProfiles),
    files: [input.file],
  });

  const profileById = new Map(
    input.knownProfiles.map((profile) => [profile.profileCategoryId, profile.profileName]),
  );

  const cleanedLines: AllocationSuggestionLine[] = (Array.isArray(data.lines) ? data.lines : [])
    .filter((line) => profileById.has(line.profileCategoryId))
    .map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: profileById.get(line.profileCategoryId) ?? line.profileName,
      suggestedPercentage: Number(line.suggestedPercentage) || 0,
      rationale: line.rationale ?? "",
    }));

  if (cleanedLines.length === 0) {
    throw new Error("De AI kon geen profielverdeling uit het document afleiden.");
  }

  const normalizedLines = normalizeSuggestionPercentages(cleanedLines);
  const rawTotal = Number(data.suggestedTotalHours);
  const suggestedTotalHours =
    Number.isFinite(rawTotal) && rawTotal > 0 ? roundTwo(rawTotal) : null;

  return {
    model,
    suggestion: {
      lines: normalizedLines,
      overallRationale: data.overallRationale ?? "",
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
