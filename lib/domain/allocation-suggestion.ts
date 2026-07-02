import { z } from "zod";
import { callGeminiStructured, parseGeminiData } from "./gemini";
import { roundTwo } from "./calculations";
import { normalizePercentages, type AllocationInput } from "./simulation";

export type AllocationSuggestionInput = {
  contractCode: string;
  contractName: string;
  sourceText: string; // vrije tekst: opgeplakte offerte/opdrachtbrief of beschrijving
  knownProfiles: Array<{ profileCategoryId: string; profileName: string }>;
  comparableContracts?: Array<{
    contractCode: string;
    allocations: Array<{ profileName: string; targetPercentage: number }>;
  }>;
};

export type AllocationSuggestionLine = {
  profileCategoryId: string;
  profileName: string;
  suggestedPercentage: number;
  rationale: string;
};

export type ExtractedContractData = {
  orderLetterTitle: string | null;
  orderLetterReference: string | null;
  specificationCode: string | null;
  domainManagerName: string | null;
  domainManagerRole: string | null;
  domainManagerOrg: string | null;
  projectLeadNames: string | null;
  vatPercentage: number | null;
  totalBudgetAmount: number | null;
};

export type AllocationSuggestion = {
  lines: AllocationSuggestionLine[];
  overallRationale: string;
  // Totaal aantal voorziene werkuren als dat letterlijk uit de tekst blijkt,
  // anders null. Dit wordt overgenomen uit de tekst, niet berekend.
  suggestedTotalHours: number | null;
  // Alleen ingevuld bij een geüploade offerte/opdrachtbrief: stamdata die de AI
  // uit het document haalde en die de gebruiker in het contract kan overnemen.
  extractedContract?: ExtractedContractData | null;
};

const SUMMATION_TOLERANCE = 0.5;

/**
 * Corrigeert de door de AI voorgestelde percentages zodat ze exact op 100 sommeren.
 * Vertrouwt de AI-output niet blind: hergebruikt de normalisatielogica van
 * `normalizePercentages` (lib/domain/simulation.ts) en compenseert de laatste
 * regel voor afrondingsruis, net zoals `createSimulationProposal` doet voor uren.
 */
export function normalizeSuggestionPercentages(
  lines: AllocationSuggestionLine[],
): AllocationSuggestionLine[] {
  if (lines.length === 0) {
    return lines;
  }

  const allocationInputs: AllocationInput[] = lines.map((line) => ({
    profileCategoryId: line.profileCategoryId,
    profileName: line.profileName,
    targetPercentage: Number.isFinite(line.suggestedPercentage)
      ? Math.max(0, line.suggestedPercentage)
      : 0,
  }));

  const normalized = normalizePercentages(allocationInputs).map((line, index) => ({
    ...lines[index],
    suggestedPercentage: roundTwo(line.targetPercentage),
  }));

  // Compenseer de afrondingsruis op de laatste regel zodat de som exact 100 is.
  const total = normalized.reduce((sum, line) => sum + line.suggestedPercentage, 0);
  const correction = roundTwo(100 - total);
  if (Math.abs(correction) > 0 && Math.abs(correction) <= SUMMATION_TOLERANCE + 0.001) {
    const last = normalized[normalized.length - 1];
    last.suggestedPercentage = roundTwo(last.suggestedPercentage + correction);
  } else if (Math.abs(correction) > SUMMATION_TOLERANCE) {
    // Buiten tolerantie: forceer alsnog naar 100 op de laatste regel, maar dit
    // duidt op een onverwacht AI-resultaat dat de UI als bewerkbaar toont.
    const last = normalized[normalized.length - 1];
    last.suggestedPercentage = roundTwo(last.suggestedPercentage + correction);
  }

  return normalized;
}

const SYSTEM_INSTRUCTION = [
  "Je bent een assistent die een verdeelsleutel voorstelt voor een Belgisch overheidscontract.",
  "Je stelt een percentageverdeling voor over de aangeleverde profielen (bijv. manager, expert/senior, junior)",
  "op basis van de aangeleverde offerte- of opdrachtbrieftekst en vergelijkbare contracten.",
  "Je berekent NOOIT zelf uren, dagen, bedragen of budgetten — alleen percentages per profiel.",
  "Gebruik uitsluitend de profielen die in de input staan, met hun exacte profileCategoryId.",
  "De voorgestelde percentages moeten samen optellen tot 100.",
  "Geef per profiel een korte, zakelijke motivatie (rationale) in het Nederlands en een overkoepelende motivatie.",
  "Als de tekst expliciet een totaal aantal voorziene werkuren of een uren-budget vermeldt, neem dat getal letterlijk over in suggestedTotalHours (geen berekening, geen omrekening van dagen of bedragen). Vermeldt de tekst geen aantal uren, geef dan null.",
].join(" ");

function buildResponseSchema(knownProfiles: AllocationSuggestionInput["knownProfiles"]) {
  const allowedIds = knownProfiles.map((profile) => profile.profileCategoryId);

  return {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            profileCategoryId: {
              type: "string",
              enum: allowedIds.length > 0 ? allowedIds : undefined,
              description: "Het exacte profileCategoryId uit de aangeleverde lijst.",
            },
            profileName: { type: "string" },
            suggestedPercentage: {
              type: "number",
              description: "Percentage voor dit profiel; alle percentages samen tellen op tot 100.",
            },
            rationale: {
              type: "string",
              description: "Korte motivatie in het Nederlands voor dit percentage.",
            },
          },
          required: ["profileCategoryId", "profileName", "suggestedPercentage", "rationale"],
          propertyOrdering: ["profileCategoryId", "profileName", "suggestedPercentage", "rationale"],
        },
      },
      overallRationale: {
        type: "string",
        description: "Overkoepelende motivatie voor de voorgestelde verdeling.",
      },
      suggestedTotalHours: {
        type: "number",
        nullable: true,
        description:
          "Totaal aantal voorziene werkuren als de tekst dat expliciet vermeldt; letterlijk overnemen, niet berekenen. Null als de tekst geen aantal uren noemt.",
      },
    },
    required: ["lines", "overallRationale", "suggestedTotalHours"],
    propertyOrdering: ["lines", "overallRationale", "suggestedTotalHours"],
  };
}

function buildUserPrompt(input: AllocationSuggestionInput) {
  const profilesText = input.knownProfiles
    .map((profile) => `- ${profile.profileName} (profileCategoryId: ${profile.profileCategoryId})`)
    .join("\n");

  const comparablesText =
    input.comparableContracts && input.comparableContracts.length > 0
      ? input.comparableContracts
          .map((contract) => {
            const lines = contract.allocations
              .map((line) => `  - ${line.profileName}: ${line.targetPercentage}%`)
              .join("\n");
            return `Contract ${contract.contractCode}:\n${lines}`;
          })
          .join("\n")
      : "Geen vergelijkbare contracten beschikbaar.";

  return [
    `Contract: ${input.contractCode} - ${input.contractName}`,
    "",
    "Beschikbare profielen (gebruik uitsluitend deze, met exact dit profileCategoryId):",
    profilesText,
    "",
    "Vergelijkbare actieve contracten en hun bestaande verdeelsleutels (als precedent):",
    comparablesText,
    "",
    "Offerte-/opdrachtbrieftekst of beschrijving:",
    input.sourceText.trim() || "(geen tekst aangeleverd)",
    "",
    "Stel een percentageverdeling voor die optelt tot 100, met motivatie per profiel.",
    "Als de tekst een totaal aantal voorziene werkuren of een uren-budget noemt, neem dat over in suggestedTotalHours; anders null.",
  ].join("\n");
}

// Zod-schema voor de Gemini-response. Tolerant per veld (zoals de oude
// handmatige coercion): onbruikbare regels worden hieronder weggefilterd,
// alleen een structureel onbruikbare response laat de validatie falen.
const RAW_SUGGESTION_ZOD = z.object({
  lines: z
    .array(
      z.object({
        profileCategoryId: z.string().catch(""),
        profileName: z.string().catch(""),
        suggestedPercentage: z.coerce.number().catch(0),
        rationale: z.string().catch(""),
      }),
    )
    .catch([]),
  overallRationale: z.string().catch(""),
  suggestedTotalHours: z.coerce.number().nullable().catch(null),
});

/**
 * Roept de Gemini API aan voor een voorstel van de verdeelsleutel via de
 * gedeelde call-vorm (REST `generateContent` met `responseSchema` voor
 * gegarandeerde gestructureerde output). Timeout en retries zitten in
 * `callGeminiStructured` (lib/domain/gemini.ts).
 */
export async function suggestAllocationPercentages(
  input: AllocationSuggestionInput,
): Promise<{ model: string; suggestion: AllocationSuggestion }> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY ontbreekt. Voeg deze toe aan je lokale environment om een AI-verdeelsleutel te genereren.",
    );
  }

  const { model, data } = await callGeminiStructured<unknown>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt: buildUserPrompt(input),
    responseSchema: buildResponseSchema(input.knownProfiles),
  });

  const parsed = parseGeminiData(RAW_SUGGESTION_ZOD, data);

  if (parsed.lines.length === 0) {
    throw new Error("Gemini-voorstel bevatte geen profielregels.");
  }

  // Behoud alleen regels voor bekende profielen en vul de profielnaam zeker aan.
  const profileById = new Map(
    input.knownProfiles.map((profile) => [profile.profileCategoryId, profile.profileName]),
  );

  const cleanedLines: AllocationSuggestionLine[] = parsed.lines
    .filter((line) => profileById.has(line.profileCategoryId))
    .map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: profileById.get(line.profileCategoryId) ?? line.profileName,
      suggestedPercentage: line.suggestedPercentage || 0,
      rationale: line.rationale,
    }));

  if (cleanedLines.length === 0) {
    throw new Error("Gemini-voorstel verwees niet naar bekende profielen.");
  }

  // Niet blind vertrouwen: corrigeer de percentages naar een som van 100.
  const normalizedLines = normalizeSuggestionPercentages(cleanedLines);

  // Totaal uren alleen overnemen als het een zinvol positief getal is.
  const suggestedTotalHours =
    parsed.suggestedTotalHours !== null &&
    Number.isFinite(parsed.suggestedTotalHours) &&
    parsed.suggestedTotalHours > 0
      ? roundTwo(parsed.suggestedTotalHours)
      : null;

  return {
    model,
    suggestion: {
      lines: normalizedLines,
      overallRationale: parsed.overallRationale,
      suggestedTotalHours,
    },
  };
}
