import type { Prisma, ProfileCategory } from "@prisma/client";
import {
  deactivateContract,
  deleteContract,
  reactivateContract,
  updateContract,
} from "@/app/admin/actions/contracts";
import { AllocationsSection } from "@/components/admin/allocations-section";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { ContractBillingSection } from "@/components/admin/contract-billing-section";
import { ContractDocumentsSection } from "@/components/admin/contract-documents-section";
import { ContractInsightsSection } from "@/components/admin/contract-insights-section";
import { dateInput, LabeledField, statusBadge, SubCard, Tip } from "@/components/admin/shared";
import { TasksSection } from "@/components/admin/tasks-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { formatDate, formatHours } from "@/lib/utils";

/** Contract inclusief alle relaties die de beheerpagina laadt. */
export type AdminContract = Prisma.ContractGetPayload<{
  include: {
    tasks: { include: { _count: { select: { timeEntries: true } } } };
    allocationTemplates: { include: { profileCategory: true } };
    profileRates: true;
    documents: true;
    _count: {
      select: {
        timeEntries: true;
        tasks: true;
        simulations: true;
        deliveryReports: true;
      };
    };
  };
}>;

/**
 * Sectie "Opdrachtbrieven": zoekveld, resultaattelling en per contract een
 * accordion met documenten, AI-inzichten, gegevens, verdeelsleutel,
 * facturatie, taken en (de)activeren/verwijderen.
 */
export function ContractsSection({
  contracts,
  allocationProfiles,
  searchQuery,
}: {
  contracts: AdminContract[];
  allocationProfiles: ProfileCategory[];
  searchQuery: string;
}) {
  // Filter contracts by search query (in-memory after fetch)
  const filteredContracts = searchQuery
    ? contracts.filter(
        (c) =>
          c.code.toLowerCase().includes(searchQuery) ||
          c.name.toLowerCase().includes(searchQuery),
      )
    : contracts;

  return (
    <Card>
      <CardHeader title="Opdrachtbrieven" />

      {/* Search */}
      <form method="GET" action="/admin" className="mb-4 flex gap-2">
        <input
          name="q"
          defaultValue={searchQuery}
          className={`${inputClass} flex-1`}
          placeholder="Zoek op code of naam…"
          aria-label="Zoek opdrachtbrief"
        />
        <Button type="submit" variant="secondary">
          Zoeken
        </Button>
        {searchQuery ? (
          <a
            href="/admin"
            className="inline-flex items-center rounded border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Wis
          </a>
        ) : null}
      </form>

      {/* Result count */}
      <p className="mb-3 text-xs text-[var(--muted)]">
        {filteredContracts.length} van {contracts.length} contract
        {contracts.length !== 1 ? "en" : ""}
        {searchQuery ? ` voor "${searchQuery}"` : ""}
      </p>

      <div className="grid gap-3">
        {filteredContracts.map((contract) => {
          const allocationByProfile = new Map(
            contract.allocationTemplates.map((line) => [
              line.profileCategoryId,
              line.targetPercentage,
            ]),
          );
          const rateByProfile = new Map(
            contract.profileRates.map((rate) => [
              rate.profileCategoryId,
              rate.unitPrice,
            ]),
          );

          // Build savedAllocations record for the client AllocationEditor
          const savedAllocations: Record<string, number> = {};
          for (const [id, pct] of allocationByProfile) {
            savedAllocations[id] = pct;
          }

          return (
            <details
              key={contract.id}
              className="rounded border border-slate-200 bg-white shadow-sm"
            >
              {/* Compact summary row */}
              <summary className="flex cursor-pointer select-none list-none flex-wrap items-center justify-between gap-3 rounded px-4 py-3 hover:bg-slate-50">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-bold text-slate-950">
                    {contract.code} — {contract.name}
                  </span>
                  {statusBadge(contract.active)}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                  <span>
                    {formatDate(contract.startDate)} –{" "}
                    {formatDate(contract.endDate)}
                  </span>
                  <span>·</span>
                  <span>{formatHours(contract.totalBudgetHours)} budget</span>
                  <span>·</span>
                  <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                    {contract._count.timeEntries} uren-lijnen
                  </Badge>
                  <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                    {contract._count.tasks} taken
                  </Badge>
                  {contract._count.simulations > 0 ? (
                    <Badge className="border-slate-200 bg-slate-50 text-slate-600">
                      {contract._count.simulations} simulaties
                    </Badge>
                  ) : null}
                  {contract.documents.length > 0 ? (
                    <Badge className="border-blue-200 bg-blue-50 text-blue-700">
                      {contract.documents.length} doc
                      {contract.documents.length !== 1 ? "s" : ""}
                    </Badge>
                  ) : null}
                  <span className="text-slate-400" aria-hidden="true">
                    ▼
                  </span>
                </div>
              </summary>

              {/* ── Expanded body ── */}
              <div className="grid gap-4 border-t border-slate-200 p-4">
                {/* Opdrachtbrieven & documenten — bovenaan, standaard open */}
                <ContractDocumentsSection
                  contractId={contract.id}
                  documents={contract.documents}
                />

                {/* AI: contract & opdrachtbrief uitlezen */}
                <ContractInsightsSection contract={contract} />

                {/* 1. Gegevens opdrachtbrief */}
                <SubCard
                  title="Gegevens opdrachtbrief"
                  helper="Basisinformatie van de opdrachtbrief: code, naam, looptijd en budget. Wijzigingen zijn direct actief na opslaan."
                >
                  <form
                    action={updateContract}
                    className="grid gap-3 md:grid-cols-4"
                  >
                    <input type="hidden" name="id" value={contract.id} />
                    <Field label="Code">
                      <input
                        name="code"
                        defaultValue={contract.code}
                        className={inputClass}
                        required
                      />
                    </Field>
                    <Field label="Naam">
                      <input
                        name="name"
                        defaultValue={contract.name}
                        className={inputClass}
                        required
                      />
                    </Field>
                    <Field label="Budget uren">
                      <input
                        name="totalBudgetHours"
                        type="number"
                        step="0.1"
                        defaultValue={contract.totalBudgetHours}
                        className={inputClass}
                        required
                      />
                    </Field>
                    <Field label="Startdatum">
                      <input
                        name="startDate"
                        type="date"
                        defaultValue={dateInput(contract.startDate)}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Einddatum">
                      <input
                        name="endDate"
                        type="date"
                        defaultValue={dateInput(contract.endDate)}
                        className={inputClass}
                      />
                    </Field>
                    <LabeledField
                      label={
                        <>
                          Waarschuwingsdrempel %
                          <Tip text="Oranje waarschuwing bij dit percentage verbruik (bijv. 85)." />
                        </>
                      }
                    >
                      <input
                        name="warningThreshold"
                        type="number"
                        step="0.1"
                        defaultValue={contract.warningThreshold}
                        className={inputClass}
                      />
                    </LabeledField>
                    <LabeledField
                      label={
                        <>
                          Kritische drempel %
                          <Tip text="Rode kritische melding bij dit percentage verbruik (bijv. 95)." />
                        </>
                      }
                    >
                      <input
                        name="criticalThreshold"
                        type="number"
                        step="0.1"
                        defaultValue={contract.criticalThreshold}
                        className={inputClass}
                      />
                    </LabeledField>
                    <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={contract.active}
                      />
                      Actief
                    </label>
                    <div className="flex flex-wrap justify-end gap-2 md:col-span-4">
                      <Button type="submit" variant="secondary">
                        Contractgegevens bewaren
                      </Button>
                    </div>
                  </form>
                </SubCard>

                {/* 2. Verdeelsleutel */}
                <AllocationsSection
                  contractId={contract.id}
                  allocationProfiles={allocationProfiles}
                  savedAllocations={savedAllocations}
                />

                {/* 3. Facturatie & PV-gegevens */}
                <ContractBillingSection
                  contract={contract}
                  allocationProfiles={allocationProfiles}
                  rateByProfile={rateByProfile}
                />

                {/* 4. Taken */}
                <TasksSection contractId={contract.id} tasks={contract.tasks} />

                {/* Opdrachtbrief (de)activeren */}
                {contract.active ? (
                  <div className="flex items-center justify-between rounded border border-red-100 bg-red-50 p-3">
                    <div>
                      <span className="text-sm font-semibold text-red-800">
                        Opdrachtbrief deactiveren
                      </span>
                      <p className="text-xs text-red-700">
                        De opdrachtbrief wordt gedeactiveerd, niet verwijderd —
                        historische uren blijven bewaard.
                      </p>
                    </div>
                    <form action={deactivateContract}>
                      <input type="hidden" name="id" value={contract.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Opdrachtbrief "${contract.code} - ${contract.name}" deactiveren? De opdrachtbrief wordt niet verwijderd maar inactief gezet. Historische uren blijven bewaard.`}
                        label="Deactiveren"
                        variant="danger"
                      />
                    </form>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded border border-emerald-200 bg-emerald-50 p-3">
                    <div>
                      <span className="text-sm font-semibold text-emerald-800">
                        Opdrachtbrief is inactief
                      </span>
                      <p className="text-xs text-emerald-700">
                        Zet de opdrachtbrief terug op actief om ze weer te
                        gebruiken in simulaties, planning en uren.
                      </p>
                    </div>
                    <form action={reactivateContract}>
                      <input type="hidden" name="id" value={contract.id} />
                      <Button type="submit">Activeren</Button>
                    </form>
                  </div>
                )}

                {/* Opdrachtbrief permanent verwijderen */}
                <div className="flex items-center justify-between rounded border border-red-200 bg-red-50 p-3">
                  <div>
                    <span className="text-sm font-semibold text-red-900">
                      Opdrachtbrief permanent verwijderen
                    </span>
                    <p className="text-xs text-red-800">
                      Verwijdert de opdrachtbrief inclusief alle simulaties, planningen, uren en PV's. Dit kan niet ongedaan worden gemaakt.
                    </p>
                  </div>
                  <form action={deleteContract}>
                    <input type="hidden" name="id" value={contract.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Opdrachtbrief "${contract.code} - ${contract.name}" permanent verwijderen? Alle bijbehorende uren, simulaties, planningen en PV's worden ook verwijderd. Dit kan NIET ongedaan worden gemaakt.`}
                      label="Verwijderen"
                      variant="danger"
                    />
                  </form>
                </div>
              </div>
            </details>
          );
        })}

        {filteredContracts.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--muted)]">
            Geen contracten gevonden
            {searchQuery ? ` voor "${searchQuery}"` : ""}.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
