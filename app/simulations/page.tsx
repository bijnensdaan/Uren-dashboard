import { AlertCircle, CheckCircle2, FileCheck, FlaskConical, Sparkles } from "lucide-react";
import {
  acceptAllocationSuggestion,
  applyExtractedContractData,
  createSimulation,
  suggestAllocation,
  updateSimulationAndGenerateReport,
} from "@/app/actions";
import { AiDocumentUploadCard } from "@/components/simulations/ai-document-upload-card";
import { AiExtractionHistory } from "@/components/simulations/ai-extraction-history";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
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

export default async function SimulationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const selectedId = typeof params.selected === "string" ? params.selected : "";
  const suggestionId = typeof params.suggestion === "string" ? params.suggestion : "";
  const suggestError = typeof params.suggestError === "string" ? params.suggestError : "";
  const extractedApplied = params.applied === "1";

  const [contracts, simulations, extractionRecords] = await Promise.all([
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
  ]);

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

  return (
    <div className="grid gap-8">
      {/* Paginatitel */}
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Simulaties en PV-voorbereiding</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Volg de drie stappen hieronder om een urenvoorstel te maken en de PV voor te bereiden.
        </p>
      </div>

      {/* Meldingen */}
      {suggestError ? (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <span className="font-semibold">Er ging iets mis: </span>
            {suggestError}
          </div>
        </div>
      ) : null}
      {extractedApplied ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>PV-stamdata is overgenomen naar het contract. Controleer de velden bij de PV voordat je definitief oplevert.</span>
        </div>
      ) : null}

      {/* STAP 1 */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">
            1
          </span>
          <h2 className="text-lg font-bold text-slate-950">Maak een urenvoorstel</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Route A */}
          <div className="grid gap-4">
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-2">
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-teal-700" />
                <span className="text-xs font-bold uppercase text-teal-800">Route A &mdash; met AI</span>
              </div>
              <p className="mt-0.5 text-xs text-teal-900">
                Upload een offerte of opdrachtbrief. Gemini maakt direct een concept urenvoorstel en stelt PV-stamdata voor.
              </p>
            </div>
            <AiDocumentUploadCard contracts={aiContracts} geminiConfigured={geminiConfigured} />
            <AiExtractionHistory items={extractionHistory} />

            {/* Route A2: tekst plakken */}
            <details>
              <summary className="cursor-pointer list-none rounded border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  <Sparkles size={14} className="text-slate-400" />
                  Of plak tekst uit de opdrachtbrief (Route A2)
                </span>
              </summary>
              <div className="mt-2 rounded border border-slate-200 bg-white p-4">
                <p className="mb-3 text-xs text-[var(--muted)]">
                  Gebruik dit alleen als je geen PDF of DOCX hebt, maar wel relevante tekst uit de offerte of opdrachtbrief.
                </p>
                <form action={suggestAllocation} className="grid gap-3">
                  <Field label="Contract">
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
                  <Button type="submit">
                    <Sparkles size={16} />
                    AI-voorstel maken
                  </Button>
                </form>
              </div>
            </details>
          </div>

          {/* Route B */}
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
              <div className="flex items-center gap-2">
                <FlaskConical size={15} className="text-slate-600" />
                <span className="text-xs font-bold uppercase text-slate-600">Route B &mdash; zonder AI</span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Gebruik de vaste contractverdeling wanneer er geen inhoudelijke herverdeling nodig is.
              </p>
            </div>
            <Card>
              <CardHeader
                title="Standaardsimulatie uit contracttemplate"
                description="Geen AI. De vaste verdeelsleutel van het contract wordt gebruikt."
              />
              <form action={createSimulation} className="grid gap-3">
                <Field label="Contract">
                  <select name="contractId" className={inputClass} required>
                    {contracts.map((contract) => (
                      <option key={contract.id} value={contract.id}>
                        {contract.code} - {contract.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Totaal voorziene uren">
                  <input name="inputTotalHours" type="number" step="0.1" className={inputClass} defaultValue={380} required />
                </Field>
                <Button type="submit">
                  <FlaskConical size={16} />
                  Standaardvoorstel maken
                </Button>
              </form>

              <div className="mt-6 border-t border-[var(--border)] pt-4">
                <h3 className="text-sm font-bold text-slate-950">Gemaakte simulaties</h3>
                <div className="mt-2 grid gap-2 text-sm">
                  {simulations.length === 0 ? (
                    <p className="text-xs text-[var(--muted)]">Nog geen simulaties gemaakt.</p>
                  ) : (
                    simulations.map((simulation) => (
                      <a
                        key={simulation.id}
                        href={`/simulations?selected=${simulation.id}${suggestionId ? `&suggestion=${suggestionId}` : ""}`}
                        className="rounded border border-slate-200 bg-white p-3 hover:bg-slate-50"
                      >
                        <div className="font-semibold">
                          {simulation.contract.code} &mdash; {simulation.contract.name}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--muted)]">
                          {formatDate(simulation.createdAt)} &middot; {formatHours(simulation.inputTotalHours)} &middot;{" "}
                          {simulation.sourceType === "ai_suggestion" ? "AI-voorstel" : "Standaard"} &middot; {simulation.status}
                        </div>
                      </a>
                    ))
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* STAP 2 - alleen zichtbaar als een suggestion geladen is */}
      {suggestion ? (
        <section>
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">
              2
            </span>
            <h2 className="text-lg font-bold text-slate-950">Controleer &amp; verfijn het AI-voorstel</h2>
            <span className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">
              Optioneel &mdash; het concept is al gemaakt
            </span>
          </div>

          <Card>
            {suggestion.overallRationale ? (
              <p className="mb-4 text-sm text-[var(--muted)]">{suggestion.overallRationale}</p>
            ) : null}
            <p className="mb-4 text-xs text-[var(--muted)]">
              Model: {suggestionRecord?.model} &middot; som van percentages:{" "}
              <span className={suggestionTotal === 100 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                {formatPercent(suggestionTotal)}
              </span>
              {suggestionRecord?.acceptedAt ? " · al gebruikt als basis voor een simulatie" : ""}
            </p>

            {/* PV-velden overnemen */}
            {suggestion.extractedContract ? (
              <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-teal-950">PV-velden uit AI-voorstel</h3>
                    <p className="mt-1 text-xs text-teal-800">
                      Controleer de tekstvelden en neem ze over als ze kloppen. Uren en bedragen blijven buiten deze overname.
                    </p>
                  </div>
                  <form action={applyExtractedContractData}>
                    <input type="hidden" name="suggestionId" value={suggestionRecord?.id} />
                    <Button type="submit" variant="secondary">
                      <FileCheck size={16} />
                      PV-velden overnemen
                    </Button>
                  </form>
                </div>
                <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-teal-800">Titel</dt>
                    <dd className="text-slate-900">{suggestion.extractedContract.orderLetterTitle ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-teal-800">Referentie</dt>
                    <dd className="text-slate-900">{suggestion.extractedContract.orderLetterReference ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-teal-800">Bestekcode</dt>
                    <dd className="text-slate-900">{suggestion.extractedContract.specificationCode ?? "-"}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-teal-800">Domeinbeheerder</dt>
                    <dd className="text-slate-900">{suggestion.extractedContract.domainManagerName ?? "-"}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="text-xs font-semibold uppercase text-teal-800">Projectleiding</dt>
                    <dd className="text-slate-900">{suggestion.extractedContract.projectLeadNames ?? "-"}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {/* Percentages aanpassen en nieuw voorstel maken */}
            <form action={acceptAllocationSuggestion} className="grid gap-4">
              <input type="hidden" name="suggestionId" value={suggestionRecord?.id} />
              <div>
                <h3 className="text-sm font-bold text-slate-950">Percentages aanpassen (optioneel)</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Pas de percentages aan als de AI-verdeling niet klopt. Het systeem herberekent de uren zelf.
                </p>
              </div>
              <div className="grid gap-2">
                {suggestion.lines.map((line) => (
                  <div
                    key={line.profileCategoryId}
                    className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[200px_140px_1fr] sm:items-center"
                  >
                    <span className="text-sm font-medium">{line.profileName}</span>
                    <div className="flex items-center gap-2">
                      <input
                        name={`pct-${line.profileCategoryId}`}
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        defaultValue={line.suggestedPercentage}
                        className={`${inputClass} w-24`}
                      />
                      <span className="text-sm text-[var(--muted)]">%</span>
                    </div>
                    <span className="text-xs text-[var(--muted)]">{line.rationale}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Field label="Totaal voorziene uren" className="w-52">
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
                <Button type="submit">
                  <FlaskConical size={16} />
                  Verfijnd voorstel maken
                </Button>
              </div>
            </form>
          </Card>
        </section>
      ) : null}

      {/* STAP 3 */}
      <section>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-bold text-white">
            3
          </span>
          <h2 className="text-lg font-bold text-slate-950">Resultaat: gesimuleerde uren</h2>
        </div>

        <Card>
          <CardHeader
            title="Voorstel controleren en PV genereren"
            description="Controleer de uren per profiel, pas zo nodig de finale uren aan en genereer de PV."
          />
          {selected ? (
            <form action={updateSimulationAndGenerateReport} className="grid gap-5">
              <input type="hidden" name="simulationId" value={selected.id} />

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="text-base font-bold text-slate-950">
                  {selected.contract.code} &mdash; {selected.contract.name}
                </div>
                <div className="mt-1 text-sm text-[var(--muted)]">
                  Bron:{" "}
                  <span className="font-medium text-slate-800">
                    {selected.sourceType === "ai_suggestion" ? "AI-voorstel" : "Standaardtemplate"}
                  </span>
                  {" "}&middot; Totaal voorziene uren:{" "}
                  <span className="font-medium text-slate-800">{formatHours(selected.inputTotalHours)}</span>
                  {" "}&middot; Status:{" "}
                  <span className="font-medium text-slate-800">{selected.status}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                      <th className="py-2 pr-4">Profiel</th>
                      <th className="py-2 pr-4">Verdeelsleutel</th>
                      <th className="py-2 pr-4">Berekend voorstel</th>
                      <th className="py-2 pr-4">Werkelijk</th>
                      <th className="py-2">Finale uren</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line) => {
                      const actual =
                        actuals.find((item) => item.profileCategoryId === line.profileCategoryId)?._sum.hours ?? 0;
                      return (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium">{line.profileCategory.name}</td>
                          <td className="py-3 pr-4">{formatPercent(line.targetPercentage)}</td>
                          <td className="py-3 pr-4 font-semibold text-slate-900">{formatHours(line.proposedHours)}</td>
                          <td className="py-3 pr-4">{formatHours(actual)}</td>
                          <td className="py-3">
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
                  <Button type="submit">
                    <FileCheck size={16} />
                    Finale uren bevestigen en PV genereren
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-[var(--muted)]">
              Maak eerst een simulatie via Stap 1 om het urenvoorstel hier te zien.
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
