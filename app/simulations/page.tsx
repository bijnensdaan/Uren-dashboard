import {
  AlertCircle,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  FileCheck,
  FlaskConical,
  History,
  ListChecks,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { parseContractInsights } from "@/lib/domain/contract-insights";
import {
  acceptAllocationSuggestion,
  applyExtractedContractData,
  createSimulation,
  extractAllocationFromFile,
  suggestAllocation,
  updateSimulationAndGenerateReport,
} from "@/app/actions";
import { DocumentSourcePicker } from "@/components/documents/document-source-picker";
import { AiExtractionHistory } from "@/components/simulations/ai-extraction-history";
import { StandardSimulationForm } from "@/components/simulations/standard-simulation-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingNotice, SubmitButton } from "@/components/ui/pending-feedback";
import { prisma } from "@/lib/db";
import type { AllocationSuggestion } from "@/lib/domain/allocation-suggestion";
import { formatDate, formatHours, formatPercent } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function parseSuggestion(suggestedJson: string): AllocationSuggestion | null {
  try {
    return JSON.parse(suggestedJson) as AllocationSuggestion;
  } catch {
    return null;
  }
}

function PageStat({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string;
  helper: string;
  icon: LucideIcon;
}) {
  return (
    <div className="rounded border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-[var(--muted)]">{label}</p>
          <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-teal-100 bg-teal-50 text-[var(--primary)]">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">{helper}</p>
    </div>
  );
}

function StepHeading({
  step,
  title,
  description,
  icon: Icon,
  badge,
}: {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  badge?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[var(--primary)] text-sm font-bold text-white">
          {step}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Icon size={18} className="text-[var(--primary)]" />
            <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">{description}</p>
        </div>
      </div>
      {badge ? (
        <Badge className="border-teal-200 bg-teal-50 text-teal-800">{badge}</Badge>
      ) : null}
    </div>
  );
}

function SuggestionReviewCard({
  suggestion,
  suggestionRecord,
  suggestionTotal,
}: {
  suggestion: AllocationSuggestion;
  suggestionRecord: { id: string; model: string; acceptedAt: Date | null } | null;
  suggestionTotal: number;
}) {
  return (
    <Card>
      <CardHeader
        title="Gemini-voorstel controleren"
        description="Controleer de gevonden PV-velden en open de verdeelsleutel om percentages of totaaluren aan te passen."
        action={<Badge className="border-teal-200 bg-teal-50 text-teal-800">Gemini</Badge>}
      />

      <div className="mb-4 grid gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-950">Gemini-samenvatting</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {suggestion.overallRationale ?? "Geen algemene toelichting beschikbaar voor dit voorstel."}
          </p>
        </div>
        <div className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">Model</span>
            <span>{suggestionRecord?.model ?? "-"}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-semibold">Som percentages</span>
            <span className={suggestionTotal === 100 ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>
              {formatPercent(suggestionTotal)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-semibold">Status</span>
            <span>{suggestionRecord?.acceptedAt ? "Gebruikt" : "Te controleren"}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {suggestion.extractedContract ? (
          <div className="rounded border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-950">PV-velden</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Tekstvelden uit de opdrachtbrief. Uren en bedragen worden hier niet overgenomen.
                </p>
              </div>
              <form action={applyExtractedContractData}>
                <input type="hidden" name="suggestionId" value={suggestionRecord?.id ?? ""} />
                <SubmitButton type="submit" variant="secondary" pendingLabel="Overnemen...">
                  <FileCheck size={16} />
                  Overnemen
                </SubmitButton>
                <PendingNotice text="PV-velden worden overgenomen..." />
              </form>
            </div>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Titel</dt>
                <dd className="mt-0.5 text-slate-950">{suggestion.extractedContract.orderLetterTitle ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Referentie</dt>
                <dd className="mt-0.5 text-slate-950">{suggestion.extractedContract.orderLetterReference ?? "-"}</dd>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Bestekcode</dt>
                  <dd className="mt-0.5 text-slate-950">{suggestion.extractedContract.specificationCode ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Domeinbeheerder</dt>
                  <dd className="mt-0.5 text-slate-950">{suggestion.extractedContract.domainManagerName ?? "-"}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-[var(--muted)]">Projectleiding</dt>
                <dd className="mt-0.5 text-slate-950">{suggestion.extractedContract.projectLeadNames ?? "-"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm text-[var(--muted)]">
            Geen PV-velden gevonden in dit Gemini-voorstel.
          </div>
        )}

        <details className="rounded border border-slate-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-bold text-slate-950">Verdeelsleutel</span>
                <span className="mt-0.5 block text-xs text-[var(--muted)]">
                  Open om percentages en totaaluren te controleren of aan te passen.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Badge
                  className={
                    suggestionTotal === 100
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }
                >
                  {formatPercent(suggestionTotal)}
                </Badge>
                <ChevronDown size={16} className="text-[var(--muted)]" />
              </span>
            </span>
          </summary>
          <div className="border-t border-slate-100 p-4">
            <form action={acceptAllocationSuggestion} className="grid gap-4">
              <input type="hidden" name="suggestionId" value={suggestionRecord?.id ?? ""} />
              <div className="grid gap-2">
                {suggestion.lines.map((line) => (
                  <div
                    key={line.profileCategoryId}
                    className="rounded border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-950">{line.profileName}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <input
                          name={`pct-${line.profileCategoryId}`}
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          defaultValue={line.suggestedPercentage}
                          className={`${inputClass} w-20`}
                        />
                        <span className="text-sm text-[var(--muted)]">%</span>
                      </div>
                    </div>
                    {line.rationale ? (
                      <p className="mt-1.5 text-xs leading-5 text-[var(--muted)]">{line.rationale}</p>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[var(--border)] pt-4">
                <Field label="Totaal voorziene uren" className="w-full sm:w-60">
                  <input
                    name="inputTotalHours"
                    type="number"
                    step="0.1"
                    defaultValue={suggestion.suggestedTotalHours ?? 380}
                    className={inputClass}
                    required
                  />
                  <span className="text-xs font-normal text-[var(--muted)]">
                    {suggestion.suggestedTotalHours != null
                      ? "Overgenomen uit de tekst. Pas aan als de extractie niet klopt."
                      : "Geen uren in de tekst gevonden. Vul het totaal zelf in."}
                  </span>
                </Field>
                <SubmitButton type="submit" pendingLabel="Verfijnd voorstel maken...">
                  <FlaskConical size={16} />
                  Verfijnd voorstel maken
                </SubmitButton>
              </div>
              <PendingNotice text="Verfijnd voorstel wordt gemaakt..." />
            </form>
          </div>
        </details>
      </div>
    </Card>
  );
}

export default async function SimulationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const selectedId = typeof params.selected === "string" ? params.selected : "";
  const suggestionId = typeof params.suggestion === "string" ? params.suggestion : "";
  const suggestionSource = typeof params.source === "string" ? params.source : "";
  const suggestError = typeof params.suggestError === "string" ? params.suggestError : "";
  const extractedApplied = params.applied === "1";

  const [contracts, simulations, extractionRecords, allDocuments] = await Promise.all([
    prisma.contract.findMany({ where: { active: true }, orderBy: { code: "asc" } }),
    prisma.simulation.findMany({
      include: {
        contract: true,
        lines: { include: { profileCategory: true }, orderBy: { targetPercentage: "asc" } },
        deliveryReport: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.allocationSuggestion.findMany({
      include: { contract: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.document.findMany({ orderBy: { uploadedAt: "desc" } }),
  ]);

  // Groepeer documenten per contract voor de picker
  const documentsByContract: Record<string, { id: string; fileName: string; mimeType: string; uploadedAt: string }[]> = {};
  for (const doc of allDocuments) {
    if (!documentsByContract[doc.contractId]) documentsByContract[doc.contractId] = [];
    documentsByContract[doc.contractId].push({
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      uploadedAt: doc.uploadedAt.toISOString(),
    });
  }

  const suggestionRecord = suggestionId
    ? await prisma.allocationSuggestion.findUnique({ where: { id: suggestionId } })
    : null;
  const suggestion: AllocationSuggestion | null = suggestionRecord
    ? (JSON.parse(suggestionRecord.suggestedJson) as AllocationSuggestion)
    : null;
  const suggestionTotal = suggestion
    ? Math.round(suggestion.lines.reduce((sum, line) => sum + line.suggestedPercentage, 0) * 100) / 100
    : 0;

  const selected = simulations.find((simulation) => simulation.id === selectedId) ?? simulations[0];
  const actuals = selected
    ? await prisma.timeEntry.groupBy({
        by: ["profileCategoryId"],
        where: { contractId: selected.contractId },
        _sum: { hours: true },
      })
    : [];
  const aiContracts = contracts.map((contract) => ({
    id: contract.id,
    code: contract.code,
    name: contract.name,
  }));

  // Contracten waarvoor AI-inzichten zijn opgeslagen (draft of applied)
  const contractsWithInsights = contracts.filter(
    (c) => (c.aiInsightsStatus === "draft" || c.aiInsightsStatus === "applied") &&
      parseContractInsights(c.aiInsightsJson) !== null,
  );
  const appliedInsightCodes = contracts
    .filter((c) => c.aiInsightsStatus === "applied")
    .map((c) => c.code);
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const extractionHistory = extractionRecords
    .map((record) => {
      const s = parseSuggestion(record.suggestedJson);
      if (!s) return null;
      return {
        id: record.id,
        contractCode: record.contract.code,
        contractName: record.contract.name,
        sourceText: record.sourceText,
        model: record.model,
        createdAt: record.createdAt,
        acceptedAt: record.acceptedAt,
        suggestion: s,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const selectedActualTotal = actuals.reduce((sum, item) => sum + (item._sum.hours ?? 0), 0);
  const selectedFinalTotal = selected
    ? selected.lines.reduce((sum, line) => sum + line.finalHours, 0)
    : 0;
  const selectedProposedTotal = selected
    ? selected.lines.reduce((sum, line) => sum + line.proposedHours, 0)
    : 0;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Simulaties en PV-voorbereiding</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            Maak een urenvoorstel, controleer de verdeling en genereer daarna de PV vanuit een helder stappenoverzicht.
          </p>
        </div>
        {selected?.deliveryReport ? (
          <a
            href={`/reports/${selected.deliveryReport.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded border border-[var(--border)] bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
          >
            <FileCheck size={16} />
            PV openen
          </a>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PageStat
          label="Actieve opdrachtbrieven"
          value={String(contracts.length)}
          helper="Beschikbaar voor nieuwe simulaties"
          icon={ClipboardCheck}
        />
        <PageStat
          label="Simulaties"
          value={String(simulations.length)}
          helper="Nieuwste simulatie staat standaard open"
          icon={FlaskConical}
        />
        <PageStat
          label="Gemini-voorstellen"
          value={String(extractionHistory.length)}
          helper="Laatste Gemini-extracties uit opdrachtbrieven"
          icon={Sparkles}
        />
        <PageStat
          label="Geselecteerd"
          value={selected ? selected.contract.code : "-"}
          helper={selected ? `${formatHours(selectedProposedTotal)} voorgesteld` : "Nog geen simulatie gekozen"}
          icon={ListChecks}
        />
      </div>

      {suggestError ? (
        <div className="flex items-start gap-3 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <span className="font-semibold">Er ging iets mis: </span>
            {suggestError}
          </div>
        </div>
      ) : null}
      {extractedApplied ? (
        <div className="flex items-start gap-3 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>
            PV-stamdata is overgenomen vanuit de opdrachtbrief. Controleer de velden bij de PV voordat je definitief oplevert.
          </span>
        </div>
      ) : null}
      {suggestion && suggestionSource ? (
        <div className="flex items-start gap-3 rounded border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" />
          <div>
            <div className="font-bold">
              {suggestionSource === "file" ? "Bestand succesvol uitgelezen" : "Tekst succesvol verwerkt"}
            </div>
            <p className="mt-0.5">
              {suggestionSource === "file"
                ? "Het Gemini-voorstel en de simulatie staan klaar. Controleer rechts de PV-velden en verdeelsleutel."
                : "Het Gemini-voorstel staat klaar. Controleer rechts de voorgestelde verdeelsleutel."}
            </p>
          </div>
        </div>
      ) : null}

      <section>
        <StepHeading
          step={1}
          title="Maak of kies een urenvoorstel"
          description="Start bij voorkeur met een opdrachtbrief, of maak snel een standaardsimulatie vanuit de vaste verdeling."
          icon={FlaskConical}
        />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,320px)]">
          <div className="grid content-start gap-4">
            <DocumentSourcePicker
              contracts={aiContracts}
              documentsByContract={documentsByContract}
              action={extractAllocationFromFile}
              geminiConfigured={geminiConfigured}
              submitLabel="Document uitlezen"
            />

            <details className="rounded border border-[var(--border)] bg-white shadow-sm">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2">
                    <Sparkles size={14} className="text-slate-400" />
                    Tekst uit opdrachtbrief plakken
                  </span>
                  <span className="text-xs font-medium text-[var(--muted)]">Alternatief voor upload</span>
                </span>
              </summary>
              <div className="border-t border-slate-100 p-4">
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Gebruik dit alleen als je geen PDF of DOCX hebt, maar wel relevante tekst uit de offerte of opdrachtbrief.
                </p>
                <form action={suggestAllocation} className="grid gap-3">
                  <Field label="Opdrachtbrief">
                    <select name="contractId" className={inputClass} defaultValue={suggestionRecord?.contractId} required>
                      {contracts.map((contract) => (
                        <option key={contract.id} value={contract.id}>
                          {contract.code} - {contract.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tekst uit offerte of opdrachtbrief">
                    <textarea
                      name="sourceText"
                      rows={4}
                      required
                      className={`${inputClass} h-auto py-2`}
                      placeholder="Plak hier alleen de relevante passages..."
                      defaultValue={suggestionRecord?.sourceText ?? ""}
                    />
                  </Field>
                  <div className="flex flex-wrap items-center gap-2">
                    <SubmitButton type="submit" pendingLabel="Gemini-voorstel maken...">
                      <Sparkles size={16} />
                      Gemini-voorstel maken
                    </SubmitButton>
                    <PendingNotice text="Gemini analyseert de tekst..." />
                  </div>
                </form>
              </div>
            </details>

            <div className="mt-2">
              <StepHeading
                step={2}
                title="Controleer het resultaat"
                description="Vergelijk voorgestelde, werkelijke en finale uren per profiel voordat je de PV genereert."
                icon={FileCheck}
              />

              <Card>
                {selected ? (
                  <form action={updateSimulationAndGenerateReport} className="grid gap-5">
                    <input type="hidden" name="simulationId" value={selected.id} />

                    <div className="grid gap-4 2xl:grid-cols-[1fr_360px]">
                      <div className="rounded border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-bold text-slate-950">
                              {selected.contract.code} - {selected.contract.name}
                            </div>
                            <div className="mt-1 text-sm text-[var(--muted)]">
                              Bron:{" "}
                              <span className="font-medium text-slate-800">
                                {selected.sourceType === "ai_suggestion"
                                  ? "Gemini-voorstel"
                                  : selected.sourceType === "period_pv"
                                    ? "Deel-PV"
                                    : "Standaardtemplate"}
                              </span>
                            </div>
                          </div>
                          <Badge className="border-slate-200 bg-white text-slate-700">{selected.status}</Badge>
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded border border-slate-200 bg-white p-3">
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Voorzien</p>
                          <p className="mt-1 font-bold text-slate-950">{formatHours(selected.inputTotalHours)}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-3">
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Werkelijk</p>
                          <p className="mt-1 font-bold text-slate-950">{formatHours(selectedActualTotal)}</p>
                        </div>
                        <div className="rounded border border-slate-200 bg-white p-3">
                          <p className="text-xs font-semibold uppercase text-[var(--muted)]">Finale uren</p>
                          <p className="mt-1 font-bold text-slate-950">{formatHours(selectedFinalTotal)}</p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="bg-slate-50">
                          <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                            <th className="px-4 py-3">Profiel</th>
                            <th className="px-4 py-3">Verdeelsleutel</th>
                            <th className="px-4 py-3">Berekend voorstel</th>
                            <th className="px-4 py-3">Werkelijk</th>
                            <th className="px-4 py-3">Finale uren</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.lines.map((line) => {
                            const actual =
                              actuals.find((item) => item.profileCategoryId === line.profileCategoryId)?._sum.hours ?? 0;
                            return (
                              <tr key={line.id} className="border-b border-slate-100 last:border-b-0">
                                <td className="px-4 py-3 font-medium text-slate-950">{line.profileCategory.name}</td>
                                <td className="px-4 py-3">{formatPercent(line.targetPercentage)}</td>
                                <td className="px-4 py-3 font-semibold text-slate-900">{formatHours(line.proposedHours)}</td>
                                <td className="px-4 py-3">{formatHours(actual)}</td>
                                <td className="px-4 py-3">
                                  <input
                                    name={`line-${line.id}`}
                                    type="number"
                                    step="0.1"
                                    defaultValue={line.finalHours}
                                    className={`${inputClass} w-28`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3">
                        <div className="text-sm font-bold text-slate-950">PV-periode</div>
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Laat beide datums leeg om een PV voor de volledige opdrachtbrief te genereren. Vul een periode in om alleen de geregistreerde uren binnen die periode te factureren.
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Start periode">
                          <input name="periodStart" type="date" className={inputClass} />
                        </Field>
                        <Field label="Einde periode">
                          <input name="periodEnd" type="date" className={inputClass} />
                        </Field>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                      <p className="text-xs text-[var(--muted)]">
                        Pas de finale uren aan als ze afwijken van het voorstel. Daarna kun je de PV genereren of openen.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selected.deliveryReport ? (
                          <a
                            href={`/reports/${selected.deliveryReport.id}`}
                            className="inline-flex items-center justify-center rounded border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                          >
                            PV openen
                          </a>
                        ) : null}
                        <SubmitButton type="submit" pendingLabel="PV genereren...">
                          <FileCheck size={16} />
                          Finale uren bevestigen en PV genereren
                        </SubmitButton>
                      </div>
                    </div>
                    <PendingNotice text="PV wordt opgebouwd..." />
                  </form>
                ) : (
                  <div className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-[var(--muted)]">
                    Maak eerst een simulatie via stap 1 om het urenvoorstel hier te zien.
                  </div>
                )}
              </Card>
            </div>
          </div>

          <aside className="grid min-w-0 content-start gap-4">
            <Card className="min-w-0">
              <CardHeader
                title="Standaardsimulatie"
                description="Gebruik de vaste verdeling van de opdrachtbrief wanneer documentanalyse niet nodig is."
              />
              {contractsWithInsights.length > 0 ? (
                <div className="mb-3 flex items-start gap-2 rounded border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
                  <Sparkles size={14} className="mt-0.5 shrink-0 text-teal-600" />
                  <div>
                    <span className="font-semibold">AI-waarden beschikbaar.</span>{" "}
                    {appliedInsightCodes.length > 0 ? (
                      <>
                        Voor{" "}
                        <span className="font-semibold">{appliedInsightCodes.join(", ")}</span>{" "}
                        zijn de AI-verdeelsleutel en het totaal uren al overgenomen via Beheer →{" "}
                        <em>Uitlezen met AI</em> en staan ze al in de standaardtemplate. De simulatie
                        hieronder gebruikt die waarden automatisch.
                      </>
                    ) : (
                      <>
                        Er zijn AI-inzichten beschikbaar voor{" "}
                        <span className="font-semibold">
                          {contractsWithInsights.map((c) => c.code).join(", ")}
                        </span>
                        , maar ze zijn nog niet overgenomen. Ga naar Beheer → <em>Uitlezen met AI</em>{" "}
                        en klik op <em>Overnemen</em> om de verdeelsleutel en het totaal uren in de
                        standaardtemplate op te slaan.
                      </>
                    )}
                  </div>
                </div>
              ) : null}
              <StandardSimulationForm
                contracts={contracts.map((contract) => ({
                  id: contract.id,
                  code: contract.code,
                  name: contract.name,
                  totalBudgetHours: contract.totalBudgetHours,
                  aiInsightsStatus: contract.aiInsightsStatus,
                }))}
                action={createSimulation}
              />
            </Card>

            {suggestion ? (
              <div id="ai-voorstel-controleren">
                <SuggestionReviewCard
                  suggestion={suggestion}
                  suggestionRecord={suggestionRecord}
                  suggestionTotal={suggestionTotal}
                />
              </div>
            ) : null}

            <Card className="overflow-hidden p-0">
              <details>
                <summary className="cursor-pointer list-none p-4 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <span className="flex items-center gap-2 text-base font-bold text-slate-950">
                        <History size={18} className="text-[var(--muted)]" />
                        Gemaakte simulaties
                      </span>
                      <span className="mt-1 block text-sm text-[var(--muted)]">
                        Open om een eerdere simulatie te selecteren.
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Badge className="border-slate-200 bg-slate-50 text-slate-700">{simulations.length}</Badge>
                      <ChevronDown size={18} className="text-[var(--muted)]" />
                    </span>
                  </span>
                </summary>
                <div className="border-t border-slate-100 p-4">
                  <div className="grid max-h-[420px] gap-2 overflow-y-auto pr-1 text-sm">
                    {simulations.length === 0 ? (
                      <p className="rounded border border-slate-200 bg-slate-50 p-3 text-xs text-[var(--muted)]">
                        Nog geen simulaties gemaakt.
                      </p>
                    ) : (
                      simulations.map((simulation) => {
                        const isSelected = selected?.id === simulation.id;
                        return (
                          <a
                            key={simulation.id}
                            href={`/simulations?selected=${simulation.id}${suggestionId ? `&suggestion=${suggestionId}` : ""}`}
                            className={`rounded border p-3 transition ${
                              isSelected
                                ? "border-teal-300 bg-teal-50"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-slate-950">
                                  {simulation.contract.code} - {simulation.contract.name}
                                </div>
                                <div className="mt-1 text-xs text-[var(--muted)]">
                                  {formatDate(simulation.createdAt)} &middot; {formatHours(simulation.inputTotalHours)}
                                </div>
                              </div>
                              <Badge
                                className={
                                  simulation.sourceType === "ai_suggestion"
                                    ? "shrink-0 border-teal-200 bg-white text-teal-800"
                                    : "shrink-0 border-slate-200 bg-white text-slate-700"
                                }
                              >
                                {simulation.sourceType === "ai_suggestion" ? "Gemini" : "Standaard"}
                              </Badge>
                            </div>
                            <div className="mt-2 text-xs font-medium text-slate-700">{simulation.status}</div>
                          </a>
                        );
                      })
                    )}
                  </div>
                </div>
              </details>
            </Card>

            <AiExtractionHistory items={extractionHistory} />
          </aside>
        </div>
      </section>

    </div>
  );
}
