import { callGeminiStructured, type GeminiFilePart } from "./gemini";
import type { Phase } from "./planning";

/**
 * Laat Gemini de fasering van een project voorstellen op basis van de opdrachtbrief
 * en de contractperiode. De AI levert enkel de FASES (naam, periode, relatief
 * gewicht, gekoppelde taken) — geen uren of bedragen. In code worden de datums
 * geclampt naar de contractperiode en de gewichten genormaliseerd tot 100.
 */
export type PhaseSuggestionInput = {
  contractCode: string;
  contractName: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;
  knownTasks: string[];
  file?: GeminiFilePart;
  sourceText?: string;
};

const SYSTEM_INSTRUCTION = [
  "Je stelt de fasering van een Belgisch overheidsproject voor op basis van de opdrachtbrief/het contract.",
  "Geef opeenvolgende projectfases (bijv. analyse, implementatie, oplevering/nazorg) met per fase een naam,",
  "een start- en einddatum die VALLEN BINNEN de contractperiode, en een relatief gewicht (belang/intensiteit).",
  "De gewichten mogen samen ongeveer 100 zijn. Koppel waar mogelijk de aangeleverde taken aan een fase.",
  "Verzin geen fases, mijlpalen of datums die niet in het document of contract staan.",
  "Als het document geen expliciete fasering, mijlpalen of periodes vermeldt, geef phases als lege array terug.",
  "Bereken NOOIT uren, dagen of bedragen — geef alleen de fasering en een korte motivatie per fase.",
  "Datums in ISO-formaat (YYYY-MM-DD).",
].join(" ");

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    phases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          startDate: { type: "string", description: "ISO YYYY-MM-DD, binnen de contractperiode." },
          endDate: { type: "string", description: "ISO YYYY-MM-DD, binnen de contractperiode." },
          weightPercentage: { type: "number", description: "Relatief gewicht van de fase." },
          relatedTasks: { type: "array", items: { type: "string" } },
          rationale: { type: "string" },
        },
        required: ["name", "startDate", "endDate", "weightPercentage", "relatedTasks", "rationale"],
        propertyOrdering: ["name", "startDate", "endDate", "weightPercentage", "relatedTasks", "rationale"],
      },
    },
    overallRationale: { type: "string" },
  },
  required: ["phases", "overallRationale"],
  propertyOrdering: ["phases", "overallRationale"],
};

type RawPhases = { phases: Phase[]; overallRationale: string };

function clampDate(value: string, min: string, max: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const minDate = new Date(min);
  const maxDate = new Date(max);
  if (date < minDate) return min;
  if (date > maxDate) return max;
  return value.slice(0, 10);
}

/**
 * Clampt de fase-datums naar de contractperiode, filtert ongeldige fases en
 * normaliseert de gewichten tot een som van 100. De AI-output wordt hier niet
 * blind vertrouwd (zelfde patroon als normalizeSuggestionPercentages).
 */
export function normalizePhases(phases: Phase[], startDate: string, endDate: string): Phase[] {
  const cleaned: Phase[] = [];
  for (const phase of phases) {
    const start = clampDate(phase.startDate, startDate, endDate);
    const end = clampDate(phase.endDate, startDate, endDate);
    if (!start || !end) continue;
    const weight = Number(phase.weightPercentage);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    cleaned.push({
      name: String(phase.name ?? "").trim() || "Fase",
      startDate: start <= end ? start : end,
      endDate: start <= end ? end : start,
      weightPercentage: weight,
      relatedTasks: Array.isArray(phase.relatedTasks)
        ? phase.relatedTasks.map((task) => String(task)).filter(Boolean)
        : [],
      rationale: String(phase.rationale ?? "").trim(),
    });
  }

  const total = cleaned.reduce((sum, phase) => sum + phase.weightPercentage, 0);
  if (total <= 0) return cleaned;
  return cleaned.map((phase) => ({
    ...phase,
    weightPercentage: Math.round((phase.weightPercentage / total) * 1000) / 10,
  }));
}

export async function suggestProjectPhases(
  input: PhaseSuggestionInput,
): Promise<{ model: string; phases: Phase[]; overallRationale: string }> {
  const userPrompt = [
    `Contract: ${input.contractCode} - ${input.contractName}`,
    `Contractperiode: ${input.startDate} t/m ${input.endDate}`,
    "",
    "Bekende taken/deliverables:",
    input.knownTasks.length > 0 ? input.knownTasks.map((task) => `- ${task}`).join("\n") : "(geen)",
    "",
    input.sourceText?.trim()
      ? `Aanvullende beschrijving:\n${input.sourceText.trim()}`
      : "Gebruik het bijgevoegde document (opdrachtbrief) als bron voor de fasering.",
    "",
    "Extraheer alleen expliciet vermelde projectfases, mijlpalen of periodes. Als die ontbreken, geef phases als lege array terug.",
  ].join("\n");

  const { model, data } = await callGeminiStructured<RawPhases>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt,
    responseSchema: RESPONSE_SCHEMA,
    files: input.file ? [input.file] : undefined,
  });

  const phases = normalizePhases(
    Array.isArray(data.phases) ? data.phases : [],
    input.startDate,
    input.endDate,
  );

  return { model, phases, overallRationale: String(data.overallRationale ?? "").trim() };
}
