import { FileCheck, FlaskConical, Sparkles } from "lucide-react";
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
      const suggestion = parseSuggestion(record.suggestedJson);
      if (!suggestion) {
        return null;
      }

      return {
        id: record.id,
        contractCode: record.contract.code,
        contractName: record.contract.name,
        sourceText: record.sourceText,
        model: record.model,
        createdAt: record.createdAt,
        acceptedAt: record.acceptedAt,
        suggestion,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Simulaties en PV-voorbereiding</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Kies eerst hoe je een urenvoorstel wilt maken. Daarna controleer je de uren en genereer je de PV.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border border-teal-200 bg-teal-50 p-3">
          <div className="text-xs font-bold uppercase text-teal-800">Route A</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">AI uit document of tekst</div>
          <p className="mt-1 text-xs text-teal-900">
            Gebruik een offerte of opdrachtbrief wanneer de inhoud de verdeelsleutel moet sturen.
          </p>
        </div>
        <div className="rounded border border-slate-200 bg-white p-3">
          <div className="text-xs font-bold uppercase text-slate-500">Route B</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">Standaardtemplate</div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Gebruik de vaste contractverdeling wanneer er geen inhoudelijke herverdeling nodig is.
          </p>
        </div>
        <div className="rounded border border-emerald-200 bg-emerald-50 p-3">
          <div className="text-xs font-bold uppercase text-emerald-800">Laatste stap</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">Controleren en PV genereren</div>
          <p className="mt-1 text-xs text-emerald-900">
            Pas finale uren aan, bevestig het voorstel en open de printvriendelijke PV.
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <AiDocumentUploadCard contracts={aiContracts} geminiConfigured={geminiConfigured} />
        <AiExtractionHistory items={extractionHistory} />
      </div>

      <Card>
        <CardHeader
          title="Route A2: AI-voorstel via geplakte tekst"
          description="Gebruik deze route alleen wanneer je geen PDF/DOCX uploadt, maar wel relevante tekst uit de offerte of opdrachtbrief hebt."
        />
        {suggestError ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {suggestError}
          </div>
        ) : null}
        {extractedApplied ? (
          <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            PV-stamdata is overgenomen naar het contract. Controleer de velden bij de PV voordat je definitief oplevert.
          </div>
        ) : null}

        <div className="grid gap-4">
          <form action={suggestAllocation} className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[0.8fr_0.85fr_1.2fr_auto] lg:items-end">
            <div>
              <h3 className="text-sm font-bold">Brontekst voor AI</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Plak hier alleen de passages die iets zeggen over scope, urenbudget, profielen of opdrachtgegevens.
              </p>
            </div>
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

        {suggestion ? (
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <h3 className="text-sm font-bold">AI-voorstel controleren</h3>
            {suggestion.overallRationale ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{suggestion.overallRationale}</p>
            ) : null}
            <p className="mt-1 text-xs text-[var(--muted)]">
              Model: {suggestionRecord?.model} - som van percentages:{" "}
              <span className={suggestionTotal === 100 ? "text-emerald-700" : "text-amber-700"}>
                {formatPercent(suggestionTotal)}
              </span>
              {suggestionRecord?.acceptedAt ? " - reeds gebruikt" : ""}
            </p>

            {suggestion.extractedContract ? (
              <div className="mt-4 rounded border border-teal-200 bg-teal-50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-teal-950">PV-velden uit AI-voorstel</h4>
                    <p className="mt-1 text-xs text-teal-800">
                      Neem deze tekstvelden over als ze kloppen. Uren en bedragen blijven buiten deze overname.
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

            <form action={acceptAllocationSuggestion} className="mt-4 grid gap-4">
              <input type="hidden" name="suggestionId" value={suggestionRecord?.id} />
              <div className="grid gap-3">
                {suggestion.lines.map((line) => (
                  <div
                    key={line.profileCategoryId}
                    className="grid gap-2 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[200px_120px_1fr] sm:items-center"
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
                <Field label="Totaal voorziene uren" className="w-48">
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
                  AI-voorstel omzetten naar simulatie
                </Button>
              </div>
              <p className="text-xs text-[var(--muted)]">
                De AI levert alleen voorgestelde percentages en tekstvelden. De applicatie rekent de uren zelf uit.
              </p>
            </form>
          </div>
        ) : null}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader
            title="Route B: standaardsimulatie uit contracttemplate"
            description="Geen AI. Gebruik de vaste verdeelsleutel die al op het contract is ingericht."
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

          <div className="mt-6">
            <h2 className="text-sm font-bold">Gemaakte simulaties</h2>
            <div className="mt-2 grid gap-2 text-sm">
              {simulations.map((simulation) => (
                <a
                  key={simulation.id}
                  href={`/simulations?selected=${simulation.id}`}
                  className="rounded border border-slate-200 bg-white p-3 hover:bg-slate-50"
                >
                  <div className="font-semibold">{simulation.contract.code}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {formatDate(simulation.createdAt)} - {formatHours(simulation.inputTotalHours)} - {simulation.status}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Laatste stap: voorstel controleren en PV genereren"
            description="Open een AI- of standaardvoorstel, pas finale uren aan en bevestig de PV."
          />
          {selected ? (
            <form action={updateSimulationAndGenerateReport} className="grid gap-4">
              <input type="hidden" name="simulationId" value={selected.id} />
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-bold">
                  {selected.contract.code} - {selected.contract.name}
                </div>
                <div className="mt-1 text-[var(--muted)]">
                  Bron {selected.sourceType === "ai_suggestion" ? "AI-voorstel" : "standaardtemplate"} · totaal voorziene uren {formatHours(selected.inputTotalHours)} · status {selected.status}
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
                      const actual = actuals.find((item) => item.profileCategoryId === line.profileCategoryId)?._sum.hours ?? 0;
                      return (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium">{line.profileCategory.name}</td>
                          <td className="py-3 pr-4">{formatPercent(line.targetPercentage)}</td>
                          <td className="py-3 pr-4">{formatHours(line.proposedHours)}</td>
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
              <div className="flex flex-wrap justify-end gap-2">
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
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">Maak eerst een simulatie om een voorstel te zien.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
