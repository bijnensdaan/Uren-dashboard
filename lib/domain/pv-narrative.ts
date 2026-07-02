import { z } from "zod";
import { callGeminiStructured, parseGeminiData } from "./gemini";

/**
 * AI-tekst voor een proces-verbaal van oplevering, via Gemini.
 * De AI levert ALLEEN de tekstuele velden ("Ter realisatie van"-bullets en de
 * twee vaste alinea's) in de stijl van de bestaande PV's. Cijfers, bedragen,
 * uren en dagen komen nooit uit de AI maar uit de domeinlogica (lib/domain/pv.ts).
 */
export type PvNarrative = {
  deliverablesBullets: string[];
  orderLetterSentence: string;
  transmissionSentence: string;
};

export type PvNarrativeInput = {
  contractCode: string;
  contractName: string;
  periodStart: string;
  periodEnd: string;
  orderLetterTitle: string;
  orderLetterReference: string;
  specificationCode: string;
  // Profielinzet (ter info/consistentie — niet om over te typen).
  effort: Array<{ profileName: string; days: number; hours: number }>;
  // Vrije tekst die de gebruiker aanlevert: taaknamen / notities / deliverables.
  taskNotes: string;
};

// Eén geanonimiseerd stijlvoorbeeld uit een bestaande PV (geen bedragen),
// zodat de AI de toon en het formaat van de "Ter realisatie van"-lijst aanhoudt.
const STYLE_EXAMPLE = [
  "Rapport van de projecten (vereenvoudiging retributiesysteem, digitalisering erkenningen, repetitieve sociale verplichtingen);",
  "Rapport “Kwalitatieve analyse van het ontwerp-KB betreffende de toegang tot het UBO-register”;",
  "Nota Life event overlijden – administratieve en juridische stappen;",
  "Digitale live rapportering van projecten: opvolging projectstatus en resultaten van metingen;",
  "Kwaliteitscontrole en dagelijks beheer (overlegvergaderingen en analytische ondersteuning).",
].join("\n");

const SYSTEM_INSTRUCTION = [
  "Je herschrijft uitsluitend de tekstuele velden voor een Nederlandstalig proces-verbaal van oplevering,",
  "in de stijl van het aangeleverde voorbeeld (zakelijk, opsommend, Belgisch overheidsregister).",
  "Je gebruikt GEEN cijfers, bedragen, uren, dagen of percentages, behalve letterlijk overgenomen uit de aangeleverde gegevens.",
  "Je verzint GEEN deliverables die niet herleidbaar zijn tot de aangeleverde taken/notities.",
  "deliverablesBullets is de lijst onder 'Ter realisatie van:' — elk item een korte, op zichzelf staande zin/zinsnede.",
  "orderLetterSentence volgt exact het patroon: 'Alle opdrachten zijn uitgevoerd volgens de bepalingen van de opdrachtbrief \"<titel>\" <referentie> en in overeenstemming met de bepalingen van het bestek <bestekcode> en de UHasselt offerte.'",
  "transmissionSentence volgt exact het patroon: 'De gepresteerde uren ter uitvoering van de bovenstaande opdrachten voor de periode <start> – <einde> werden overgemaakt aan de DAV/FOD BOSA projectleider.'",
].join(" ");

const RESPONSE_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    deliverablesBullets: {
      type: "array",
      items: { type: "string" },
      description: "Lijst onder 'Ter realisatie van:'. Alleen items herleidbaar tot de aangeleverde taken/notities.",
    },
    orderLetterSentence: { type: "string" },
    transmissionSentence: { type: "string" },
  },
  required: ["deliverablesBullets", "orderLetterSentence", "transmissionSentence"],
  propertyOrdering: ["deliverablesBullets", "orderLetterSentence", "transmissionSentence"],
};

function buildPrompt(input: PvNarrativeInput) {
  const effort = input.effort
    .map((line) => `- ${line.profileName}: ${line.days} persoondagen (${line.hours} uren)`)
    .join("\n");

  return [
    `Contract: ${input.contractCode} - ${input.contractName}`,
    `Periode: ${input.periodStart || "?"} – ${input.periodEnd || "?"}`,
    `Opdrachtbrief-titel: ${input.orderLetterTitle || "(onbekend)"}`,
    `Opdrachtbrief-referentie: ${input.orderLetterReference || "(geen)"}`,
    `Bestekcode: ${input.specificationCode || "(onbekend)"}`,
    "",
    "Profielinzet (alleen ter info, niet overtypen):",
    effort || "(geen)",
    "",
    "Aangeleverde taken / notities / deliverables (basis voor 'Ter realisatie van:'):",
    input.taskNotes.trim() || "(geen specifieke taken aangeleverd)",
    "",
    "Stijlvoorbeeld voor 'Ter realisatie van:' (toon en formaat overnemen, inhoud niet kopiëren):",
    STYLE_EXAMPLE,
  ].join("\n");
}

// Zod-schema voor de Gemini-response: tolerant waar de oude handmatige
// coercion dat ook was (niet-strings vallen terug op lege waarden).
const PV_NARRATIVE_ZOD = z.object({
  deliverablesBullets: z.array(z.string().catch("")).catch([]),
  orderLetterSentence: z.string().catch(""),
  transmissionSentence: z.string().catch(""),
});

const KEYWORD_RE = /[a-zà-ÿ0-9]{4,}/gi;

/**
 * Markeert bullets die niet herleidbaar zijn tot de aangeleverde notities
 * (geen enkel gedeeld trefwoord). De UI toont deze met een "controleer dit"-vlag
 * in plaats van ze stilzwijgend te accepteren.
 */
export function flagUnsupportedBullets(bullets: string[], taskNotes: string) {
  const noteWords = new Set(
    (taskNotes.toLowerCase().match(KEYWORD_RE) ?? []).map((word) => word),
  );
  if (noteWords.size === 0) {
    return bullets.map(() => false);
  }
  return bullets.map((bullet) => {
    const words = bullet.toLowerCase().match(KEYWORD_RE) ?? [];
    const hasOverlap = words.some((word) => noteWords.has(word));
    return !hasOverlap;
  });
}

export async function generatePvNarrative(input: PvNarrativeInput) {
  const { model, data } = await callGeminiStructured<unknown>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt: buildPrompt(input),
    responseSchema: RESPONSE_SCHEMA,
  });

  const parsed = parseGeminiData(PV_NARRATIVE_ZOD, data);

  const deliverablesBullets = parsed.deliverablesBullets
    .map((bullet) => bullet.trim())
    .filter(Boolean);

  return {
    model,
    narrative: {
      deliverablesBullets,
      orderLetterSentence: parsed.orderLetterSentence.trim(),
      transmissionSentence: parsed.transmissionSentence.trim(),
    } satisfies PvNarrative,
  };
}
