/**
 * contract-insights.ts
 *
 * Gecentraliseerd type en extractie-functie voor AI-inzichten op een contract.
 * Combineert offer-extraction (verdeelsleutel + stamdata + tarieven) en
 * planning-suggestion (fasering) in één atomaire aanroep die het resultaat
 * als `ContractInsights` teruggeeft.
 *
 * Gebruik:
 *   import { extractContractInsights, parseContractInsights, type ContractInsights }
 *     from "@/lib/domain/contract-insights";
 */

import {
  extractOfferDetails,
  type OfferAllocationSource,
  type OfferExtractionInput,
  type OfferSuggestedEmployee,
  type OfferSuggestedProfile,
  type OfferSuggestedTask,
} from "./offer-extraction";
import { suggestProjectPhases, type PhaseSuggestionInput } from "./planning-suggestion";
import { roundTwo } from "./calculations";
import type { GeminiFilePart } from "./gemini";

// ---------------------------------------------------------------------------
// Gedeeld type — de contracten-brede "insights" snapshot
// ---------------------------------------------------------------------------

/**
 * ContractInsights is de centrale snapshot die de AI uit een opdrachtbrief
 * of contract extraheert. Hij wordt als JSON opgeslagen op `Contract.aiInsightsJson`
 * en is leesbaar via `parseContractInsights`.
 *
 * Consumers (Simulatie, Planning) lezen dit type direct — pas het niet aan
 * zonder de consumers ook bij te werken.
 */
export type ContractInsights = {
  /** Verdeelsleutel per profiel met optioneel uurtarief. */
  allocation: {
    profileCategoryId: string;
    profileName: string;
    /** Gesuggereerd percentage; genormaliseerd zodat de som exact 100 is. */
    suggestedPercentage: number;
    /** Uurtarief/eenheidsprijs als het document dit vermeldt; anders null. */
    unitPrice: number | null;
    /** Motivatie van de AI voor dit percentage. */
    rationale: string;
  }[];
  /**
   * `complete` is letterlijk gevonden; `inferred` is door Gemini voorgesteld.
   * `partial` en `not_found` vragen manuele controle of invulling.
   */
  allocationStatus: "complete" | "inferred" | "partial" | "not_found";
  allocationSource: OfferAllocationSource | "none";
  allocationNote: string;
  suggestedProfiles: OfferSuggestedProfile[];
  suggestedEmployees: OfferSuggestedEmployee[];
  suggestedTasks: OfferSuggestedTask[];
  /** Totaal voorziene uren als het document dat vermeldt; anders null. */
  suggestedTotalHours: number | null;
  /** Stamdata die de AI uit de opdrachtbrief haalt voor het PV. */
  pv: {
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
  /** Fases voorgesteld door de planning-AI. Leeg als die call faalt. */
  phases: {
    name: string;
    startDate: string;
    endDate: string;
    weightPercentage: number;
    relatedTasks: string[];
    rationale: string;
  }[];
  /** Overkoepelende motivatie van de verdeelsleutel-AI. */
  overallRationale: string;
};

// ---------------------------------------------------------------------------
// Input type voor de gecombineerde extractie
// ---------------------------------------------------------------------------

export type ContractInsightsInput = {
  contractCode: string;
  contractName: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
  knownProfiles: { profileCategoryId: string; profileName: string }[];
  knownTasks: string[];
  /** Inline PDF-data voor Gemini (multimodal). */
  file?: GeminiFilePart;
  /** Platte tekst (voor .docx/.txt). */
  sourceText?: string;
};

// ---------------------------------------------------------------------------
// Extractie — roept offer-extraction + planning-suggestion parallel aan
// ---------------------------------------------------------------------------

/**
 * Haalt gecombineerde AI-inzichten op uit een opdrachtbrief/contract.
 *
 * - offer-extraction levert: verdeelsleutel + uurtarieven + PV-stamdata + totaal uren.
 * - planning-suggestion levert: fases.
 *
 * Beide calls ontvangen hetzelfde bestand/tekst. Als de planning-call faalt
 * (bijv. datums ontbreken of Gemini-fout), wordt een lege fasenlijst gebruikt
 * zodat de verdeelsleutel-inzichten nog steeds worden opgeslagen.
 *
 * De Gemini-modelnaam van de offer-call wordt als leidend model gerapporteerd.
 *
 * @throws als de offer-extraction-call faalt (critiek: geen verdeelsleutel)
 */
export async function extractContractInsights(
  input: ContractInsightsInput,
): Promise<{ model: string; insights: ContractInsights }> {
  const offerInput: OfferExtractionInput = {
    contractCode: input.contractCode,
    contractName: input.contractName,
    knownProfiles: input.knownProfiles,
    file: input.file,
    sourceText: input.sourceText,
  };

  const planningInput: PhaseSuggestionInput = {
    contractCode: input.contractCode,
    contractName: input.contractName,
    startDate: input.startDate,
    endDate: input.endDate,
    knownTasks: input.knownTasks,
    file: input.file,
    sourceText: input.sourceText,
  };

  // Start beide calls tegelijk.
  const [offerResult, planningResult] = await Promise.all([
    extractOfferDetails(offerInput),
    // Wrap de planning-call zodat een fout geen worp geeft.
    suggestProjectPhases(planningInput).catch((err: unknown) => {
      console.warn(
        "[contract-insights] Fasen-suggestie mislukt (wordt genegeerd):",
        err instanceof Error ? err.message : err,
      );
      return { model: "", phases: [], overallRationale: "" } as {
        model: string;
        phases: { name: string; startDate: string; endDate: string; weightPercentage: number; relatedTasks: string[]; rationale: string }[];
        overallRationale: string;
      };
    }),
  ]);

  const {
    model,
    suggestion,
    offerLines,
    allocationSource,
    suggestedProfiles,
    suggestedEmployees,
    suggestedTasks,
  } = offerResult;
  const { phases } = planningResult;

  const allocation: ContractInsights["allocation"] = offerLines
    .filter((line) => line.suggestedPercentage > 0)
    .map((line) => ({
    profileCategoryId: line.profileCategoryId,
    profileName: line.profileName,
    suggestedPercentage: line.suggestedPercentage,
    unitPrice: line.unitPrice ?? null,
    rationale: line.rationale,
  }));
  const allocationTotal = roundTwo(
    allocation.reduce((sum, line) => sum + line.suggestedPercentage, 0),
  );
  const allocationStatus: ContractInsights["allocationStatus"] =
    allocation.length === 0
      ? "not_found"
      : allocationSource === "inferred" && Math.abs(allocationTotal - 100) <= 0.5
        ? "inferred"
      : Math.abs(allocationTotal - 100) <= 0.5
        ? "complete"
        : "partial";
  const allocationNote =
    allocationStatus === "complete"
      ? "Expliciete verdeelsleutel gevonden in het document."
      : allocationStatus === "inferred"
        ? "De verdeelsleutel stond niet letterlijk in het document en is door Gemini voorgesteld."
      : allocationStatus === "partial"
        ? allocationSource === "inferred"
          ? `Gemini stelde een verdeelsleutel voor, maar de percentages tellen op tot ${allocationTotal}%. Controleer dit voorstel voor je het overneemt.`
          : `Er zijn expliciete percentages gevonden, maar ze tellen op tot ${allocationTotal}%. De verdeelsleutel wordt niet automatisch overgenomen.`
        : "Geen expliciete verdeelsleutel gevonden in het document. Vul de verdeelsleutel zelf in.";

  const ec: {
    orderLetterTitle?: string | null;
    orderLetterReference?: string | null;
    specificationCode?: string | null;
    domainManagerName?: string | null;
    domainManagerRole?: string | null;
    domainManagerOrg?: string | null;
    projectLeadNames?: string | null;
    vatPercentage?: number | null;
    totalBudgetAmount?: number | null;
  } = suggestion.extractedContract ?? {}; // typed fallback: {} loses property access otherwise

  const insights: ContractInsights = {
    allocation,
    allocationStatus,
    allocationSource: allocation.length === 0 ? "none" : allocationSource,
    allocationNote,
    suggestedProfiles,
    suggestedEmployees,
    suggestedTasks,
    suggestedTotalHours: suggestion.suggestedTotalHours ?? null,
    pv: {
      orderLetterTitle: ec.orderLetterTitle ?? null,
      orderLetterReference: ec.orderLetterReference ?? null,
      specificationCode: ec.specificationCode ?? null,
      domainManagerName: ec.domainManagerName ?? null,
      domainManagerRole: ec.domainManagerRole ?? null,
      domainManagerOrg: ec.domainManagerOrg ?? null,
      projectLeadNames: ec.projectLeadNames ?? null,
      vatPercentage: ec.vatPercentage ?? null,
      totalBudgetAmount: ec.totalBudgetAmount ?? null,
    },
    phases: phases.map((phase) => ({
      name: phase.name,
      startDate: phase.startDate,
      endDate: phase.endDate,
      weightPercentage: phase.weightPercentage,
      relatedTasks: phase.relatedTasks ?? [],
      rationale: phase.rationale ?? "",
    })),
    overallRationale: suggestion.overallRationale,
  };

  return { model, insights };
}

// ---------------------------------------------------------------------------
// Veilige parser voor opgeslagen JSON
// ---------------------------------------------------------------------------

/**
 * Parseert de opgeslagen `Contract.aiInsightsJson`-waarde naar een
 * `ContractInsights`-object. Geeft `null` terug bij een lege string of
 * ongeldige JSON, zodat consumers dit veilig kunnen controleren.
 *
 * Gebruik dit in Simulatie- en Planning-componenten om de opgeslagen inzichten
 * in te lezen zonder zelf JSON.parse te hoeven afhandelen.
 *
 * @example
 *   const insights = parseContractInsights(contract.aiInsightsJson);
 *   if (insights) { // gebruik insights.allocation, insights.phases, etc. }
 */
export function parseContractInsights(json: string | null | undefined): ContractInsights | null {
  if (!json || json.trim() === "") return null;
  try {
    return JSON.parse(json) as ContractInsights;
  } catch {
    return null;
  }
}
