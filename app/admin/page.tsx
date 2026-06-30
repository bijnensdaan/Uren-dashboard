import {
  createContractWithSetup,
  createEmployee,
  createProfile,
  createTask,
  deactivateContract,
  deactivateEmployee,
  deactivateProfile,
  deactivateTask,
  deleteContractDocument,
  updateContract,
  updateContractAllocations,
  updateContractBilling,
  updateEmployee,
  updateProfile,
  updateTask,
  uploadContractDocument,
} from "@/app/admin/actions";
import { AllocationEditor } from "@/components/admin/allocation-editor";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import { formatDate, formatHours } from "@/lib/utils";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

/** Convert bytes to a human-readable size string in nl-BE style (e.g. "12 KB", "1,3 MB"). */
function humanFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString("nl-BE", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} MB`;
}

/** Derive a short type label from a MIME type. */
function mimeLabel(mimeType: string): string {
  if (mimeType === "application/pdf") return "PDF";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "Word";
  if (mimeType === "text/plain") return "Tekst";
  return "Bestand";
}

function statusBadge(active: boolean) {
  return (
    <Badge
      className={
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }
    >
      {active ? "Actief" : "Inactief"}
    </Badge>
  );
}

/** Small tooltip helper — rendered as a hoverable (?) */
function Tip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 cursor-help rounded-full border border-slate-300 px-1 text-xs text-slate-400 select-none"
      aria-label={text}
    >
      ?
    </span>
  );
}

/**
 * Like Field but accepts ReactNode for the label so we can embed <Tip>.
 * Renders identically to Field (same Tailwind classes).
 */
function LabeledField({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Sub-form section inside a contract accordion */
function SubCard({
  title,
  helper,
  children,
}: {
  title: React.ReactNode;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-4">
      <div className="mb-1 flex items-center text-sm font-bold text-slate-800">
        {title}
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">{helper}</p>
      {children}
    </div>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = (await searchParams) ?? {};
  const adminMessage =
    typeof params.adminMessage === "string" ? params.adminMessage : "";
  const adminError =
    typeof params.adminError === "string" ? params.adminError : "";
  const searchQuery =
    typeof params.q === "string" ? params.q.trim().toLowerCase() : "";

  const [contracts, employees, profiles] = await Promise.all([
    prisma.contract.findMany({
      include: {
        tasks: {
          include: { _count: { select: { timeEntries: true } } },
          orderBy: { name: "asc" },
        },
        allocationTemplates: {
          include: { profileCategory: true },
          orderBy: { targetPercentage: "asc" },
        },
        profileRates: true,
        documents: { orderBy: { uploadedAt: "desc" } },
        _count: {
          select: {
            timeEntries: true,
            tasks: true,
            simulations: true,
            deliveryReports: true,
          },
        },
      },
      orderBy: { code: "asc" },
    }),
    prisma.employee.findMany({
      include: {
        profileCategory: true,
        _count: { select: { timeEntries: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.profileCategory.findMany({
      include: {
        _count: {
          select: {
            employees: true,
            timeEntries: true,
            contractAllocationTemplates: true,
          },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const activeProfiles = profiles.filter((p) => p.active);
  const allocationProfiles =
    activeProfiles.length > 0 ? activeProfiles : profiles;

  // Filter contracts by search query (in-memory after fetch)
  const filteredContracts = searchQuery
    ? contracts.filter(
        (c) =>
          c.code.toLowerCase().includes(searchQuery) ||
          c.name.toLowerCase().includes(searchQuery),
      )
    : contracts;

  return (
    <div className="grid gap-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Beheer</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Beheer contracten, taken, profielen en medewerkers zonder
          codewijzigingen.
        </p>
      </div>

      {/* Feedback banners — prominent with icons */}
      {adminMessage ? (
        <div className="flex items-start gap-3 rounded border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm">
          <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
            ✅
          </span>
          <span>{adminMessage}</span>
        </div>
      ) : null}
      {adminError ? (
        <div className="flex items-start gap-3 rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900 shadow-sm">
          <span className="mt-0.5 text-lg leading-none" aria-hidden="true">
            ❌
          </span>
          <span>{adminError}</span>
        </div>
      ) : null}

      {/* ════════════════════════════════════════════════════
          Nieuw contract — collapsed by default, visually distinct
          ════════════════════════════════════════════════════ */}
      <details className="rounded border-2 border-teal-300 bg-teal-50 shadow-sm">
        <summary className="cursor-pointer select-none list-none rounded px-4 py-3 text-sm font-bold text-teal-900 hover:bg-teal-100">
          ➕ Nieuw contract aanmaken
          <span className="ml-2 text-xs font-normal text-teal-700">
            — klik om het formulier te openen
          </span>
        </summary>
        <div className="border-t border-teal-200 bg-white p-4">
          <p className="mb-4 text-sm text-[var(--muted)]">
            Maak een volledig nieuw contract aan met taken en verdeling van uren
            over profielen. De verdeelsleutel moet exact 100% zijn.
          </p>
          <form action={createContractWithSetup} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Code">
                <input
                  name="code"
                  className={inputClass}
                  placeholder="C-2026-030"
                  required
                />
              </Field>
              <Field label="Naam">
                <input
                  name="name"
                  className={inputClass}
                  placeholder="Nieuw contract"
                  required
                />
              </Field>
              <Field label="Budget uren">
                <input
                  name="totalBudgetHours"
                  type="number"
                  step="0.1"
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Startdatum">
                <input
                  name="startDate"
                  type="date"
                  className={inputClass}
                  required
                />
              </Field>
              <Field label="Einddatum">
                <input
                  name="endDate"
                  type="date"
                  className={inputClass}
                  required
                />
              </Field>
              <LabeledField
                label={
                  <>
                    Waarschuwingsdrempel %
                    <Tip text="Bij welk percentage van het budget een oranje waarschuwing verschijnt (bijv. 85 = waarschuwing bij 85% verbruik)." />
                  </>
                }
              >
                <input
                  name="warningThreshold"
                  type="number"
                  step="0.1"
                  defaultValue={85}
                  className={inputClass}
                />
              </LabeledField>
              <LabeledField
                label={
                  <>
                    Kritische drempel %
                    <Tip text="Bij welk percentage een rode kritische melding verschijnt (bijv. 95)." />
                  </>
                }
              >
                <input
                  name="criticalThreshold"
                  type="number"
                  step="0.1"
                  defaultValue={95}
                  className={inputClass}
                />
              </LabeledField>
              <Field label="Taken (één per lijn)">
                <textarea
                  name="tasks"
                  className={`${inputClass} min-h-20 py-2`}
                  placeholder={"Analyse\nImplementatie\nProjectopvolging"}
                />
              </Field>
            </div>

            {/* Verdeelsleutel for new contract */}
            <div className="rounded border border-teal-200 bg-teal-50/50 p-3">
              <div className="mb-1 flex items-center text-xs font-semibold uppercase text-teal-800">
                Verdeelsleutel
                <Tip text="Hoe de uren over de profielen worden verdeeld — het totaal moet exact 100% zijn." />
              </div>
              <p className="mb-3 text-xs text-teal-700">
                Geef per profiel aan welk percentage van de uren daarvoor
                bestemd is. Het totaal moet exact 100% zijn.
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {allocationProfiles.map((profile) => (
                  <Field key={profile.id} label={`${profile.name} %`}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <input
                      name={`allocation-${profile.id}`}
                      type="number"
                      step="0.1"
                      defaultValue={profile.defaultAllocationPercentage}
                      className={inputClass}
                    />
                  </Field>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit">Contract aanmaken</Button>
            </div>
          </form>
        </div>
      </details>

      {/* ════════════════════════════════════════════════════
          Contracten + zijpaneel
          ════════════════════════════════════════════════════ */}
      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader title="Contracten" />

          {/* Search */}
          <form method="GET" action="/admin" className="mb-4 flex gap-2">
            <input
              name="q"
              defaultValue={searchQuery}
              className={`${inputClass} flex-1`}
              placeholder="Zoek op code of naam…"
              aria-label="Zoek contract"
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
                    {/* 1. Contractgegevens */}
                    <SubCard
                      title="Contractgegevens"
                      helper="Basisinformatie van het contract: code, naam, looptijd en budget. Wijzigingen zijn direct actief na opslaan."
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
                    <SubCard
                      title={
                        <>
                          Verdeelsleutel
                          <Tip text="De verdeelsleutel bepaalt hoe de uren worden verdeeld over de verschillende profielen (bijv. Analist, Ontwikkelaar). Het totaal moet altijd exact 100% zijn." />
                        </>
                      }
                      helper="Hoe de uren over de profielen verdeeld worden — samen exact 100%. De groene indicator bevestigt dat het totaal klopt voor u opslaat."
                    >
                      <form action={updateContractAllocations}>
                        <input
                          type="hidden"
                          name="contractId"
                          value={contract.id}
                        />
                        <AllocationEditor
                          profiles={allocationProfiles.map((p) => ({
                            id: p.id,
                            name: p.name,
                            defaultAllocationPercentage:
                              p.defaultAllocationPercentage,
                          }))}
                          savedAllocations={savedAllocations}
                        />
                      </form>
                    </SubCard>

                    {/* 3. Facturatie & PV-gegevens */}
                    <SubCard
                      title={
                        <>
                          Facturatie &amp; PV-gegevens
                          <Tip text="PV staat voor Procès-Verbal (proces-verbaal van oplevering). Deze gegevens worden automatisch ingevuld op de PV-documenten." />
                        </>
                      }
                      helper="Gegevens voor facturatie en het automatisch invullen van PV-documenten. Eenheidsprijzen zijn exclusief btw, per gepresteerd uur."
                    >
                      <form
                        action={updateContractBilling}
                        className="grid gap-4"
                      >
                        <input
                          type="hidden"
                          name="contractId"
                          value={contract.id}
                        />
                        <div className="grid gap-3 md:grid-cols-3">
                          <Field label="Btw %">
                            <input
                              name="vatPercentage"
                              type="number"
                              step="0.1"
                              defaultValue={contract.vatPercentage}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Totaalbudget (EUR)">
                            <input
                              name="totalBudgetAmount"
                              type="number"
                              step="0.01"
                              defaultValue={contract.totalBudgetAmount ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <LabeledField
                            label={
                              <>
                                Bestekcode
                                <Tip text="Het unieke referentienummer van het bestek (aanbestedingsdocument) waarop dit contract is gebaseerd." />
                              </>
                            }
                          >
                            <input
                              name="specificationCode"
                              defaultValue={contract.specificationCode ?? ""}
                              className={inputClass}
                            />
                          </LabeledField>
                          <Field label="Opdrachtbrief - titel">
                            <input
                              name="orderLetterTitle"
                              defaultValue={contract.orderLetterTitle ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Opdrachtbrief - referentie">
                            <input
                              name="orderLetterReference"
                              defaultValue={
                                contract.orderLetterReference ?? ""
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Domeinmanager - naam">
                            <input
                              name="domainManagerName"
                              defaultValue={contract.domainManagerName ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Domeinmanager - functie">
                            <input
                              name="domainManagerRole"
                              defaultValue={contract.domainManagerRole ?? ""}
                              className={inputClass}
                              placeholder="Domeinmanager"
                            />
                          </Field>
                          <Field label="Projectleider(s) - namen">
                            <input
                              name="projectLeadNames"
                              defaultValue={contract.projectLeadNames ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Organisatie (handtekeningblok)">
                            <input
                              name="domainManagerOrg"
                              defaultValue={contract.domainManagerOrg ?? ""}
                              className={inputClass}
                              placeholder="FOD ... - DG ..."
                            />
                          </Field>
                        </div>

                        <div>
                          <div className="mb-2 flex items-center text-xs font-semibold text-slate-600">
                            Eenheidsprijs per profiel (excl. btw, per gepresteerd uur)
                            <Tip text="Het uurtarief dat gefactureerd wordt voor dit profiel, exclusief btw." />
                          </div>
                          <div className="grid gap-3 md:grid-cols-3">
                            {allocationProfiles.map((profile) => (
                              <Field
                                key={profile.id}
                                label={`${profile.name} (EUR/u)`}
                              >
                                <input
                                  type="hidden"
                                  name="profileId"
                                  value={profile.id}
                                />
                                <input
                                  name={`unit-${profile.id}`}
                                  type="number"
                                  step="0.01"
                                  defaultValue={
                                    rateByProfile.get(profile.id) ?? ""
                                  }
                                  className={inputClass}
                                />
                              </Field>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button type="submit" variant="secondary">
                            Facturatiegegevens bewaren
                          </Button>
                        </div>
                      </form>
                    </SubCard>

                    {/* 4. Taken */}
                    <SubCard
                      title="Taken binnen dit contract"
                      helper="Taken zijn de werkonderdelen waarop medewerkers hun uren boeken. U kunt taken hernoemen, (de)activeren of nieuwe taken toevoegen."
                    >
                      <div className="grid gap-2">
                        {contract.tasks.map((task) => (
                          <div
                            key={task.id}
                            className="flex flex-wrap items-center gap-2 rounded border border-slate-100 bg-white p-2"
                          >
                            <form
                              action={updateTask}
                              className="flex flex-1 flex-wrap items-center gap-2"
                            >
                              <input type="hidden" name="id" value={task.id} />
                              <input
                                type="hidden"
                                name="contractId"
                                value={contract.id}
                              />
                              <input
                                name="name"
                                defaultValue={task.name}
                                className={`${inputClass} flex-1`}
                              />
                              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                                <input
                                  name="active"
                                  type="checkbox"
                                  defaultChecked={task.active}
                                />
                                Actief
                              </label>
                              <Button type="submit" variant="secondary">
                                Bewaren
                              </Button>
                            </form>
                            <span className="text-xs text-[var(--muted)]">
                              {task._count.timeEntries} geregistreerde uren-lijnen
                            </span>
                            <form action={deactivateTask}>
                              <input type="hidden" name="id" value={task.id} />
                              <ConfirmSubmitButton
                                confirmMessage={`Taak "${task.name}" deactiveren? Medewerkers kunnen er geen uren meer op boeken. Historische uren blijven bewaard.`}
                                label="Deactiveer taak"
                                variant="danger"
                              />
                            </form>
                          </div>
                        ))}
                        <form
                          action={createTask}
                          className="flex flex-wrap gap-2"
                        >
                          <input
                            type="hidden"
                            name="contractId"
                            value={contract.id}
                          />
                          <input
                            name="name"
                            className={`${inputClass} flex-1`}
                            placeholder="Naam nieuwe taak"
                          />
                          <Button type="submit">Taak toevoegen</Button>
                        </form>
                      </div>
                    </SubCard>

                    {/* 5. Opdrachtbrieven & documenten */}
                    <SubCard
                      title="Opdrachtbrieven & documenten"
                      helper="Upload hier de opdrachtbrief/offerte van dit contract. Deze documenten kun je op de pagina's Simulatie en Planning hergebruiken."
                    >
                      {/* Upload form */}
                      <form
                        action={uploadContractDocument}
                        encType="multipart/form-data"
                        className="mb-4 flex flex-wrap items-end gap-2"
                      >
                        <input
                          type="hidden"
                          name="contractId"
                          value={contract.id}
                        />
                        <label className="grid flex-1 gap-1 text-sm font-medium text-slate-700">
                          <span>Bestand kiezen</span>
                          <input
                            type="file"
                            name="file"
                            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                            className={inputClass}
                            required
                          />
                        </label>
                        <Button type="submit">Document toevoegen</Button>
                      </form>

                      {/* Document list */}
                      {contract.documents.length === 0 ? (
                        <p className="text-xs text-[var(--muted)]">
                          Nog geen documenten voor dit contract.
                        </p>
                      ) : (
                        <div className="grid gap-2">
                          {contract.documents.map((doc) => (
                            <div
                              key={doc.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-white px-3 py-2"
                            >
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                                <Badge className="shrink-0 border-slate-200 bg-slate-100 text-slate-600">
                                  {mimeLabel(doc.mimeType)}
                                </Badge>
                                <span className="truncate text-sm font-medium text-slate-800">
                                  {doc.fileName}
                                </span>
                                <span className="text-xs text-[var(--muted)]">
                                  {humanFileSize(doc.fileSize)}
                                </span>
                                <span className="text-xs text-[var(--muted)]">
                                  · {formatDate(doc.uploadedAt)}
                                </span>
                              </div>
                              <form action={deleteContractDocument}>
                                <input
                                  type="hidden"
                                  name="documentId"
                                  value={doc.id}
                                />
                                <ConfirmSubmitButton
                                  confirmMessage={`Document "${doc.fileName}" definitief verwijderen? Dit kan niet ongedaan worden gemaakt.`}
                                  label="Verwijderen"
                                  variant="danger"
                                />
                              </form>
                            </div>
                          ))}
                        </div>
                      )}
                    </SubCard>

                    {/* Contract deactiveren */}
                    <div className="flex items-center justify-between rounded border border-red-100 bg-red-50 p-3">
                      <div>
                        <span className="text-sm font-semibold text-red-800">
                          Contract deactiveren
                        </span>
                        <p className="text-xs text-red-700">
                          Het contract wordt gedeactiveerd, niet verwijderd -
                          historische uren blijven bewaard.
                        </p>
                      </div>
                      <form action={deactivateContract}>
                        <input type="hidden" name="id" value={contract.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Contract "${contract.code} - ${contract.name}" deactiveren? Het contract wordt niet verwijderd maar inactief gezet. Historische uren blijven bewaard.`}
                          label="Contract deactiveren"
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

        {/* Side panel: Profielen & Medewerkers */}
        <div className="grid gap-5">
          {/* Profielen */}
          <Card>
            <CardHeader
              title="Profielen"
              description="Een profiel groepeert medewerkers met dezelfde rol (bijv. Analist). Profielen worden gedeactiveerd, niet verwijderd - historische uren blijven bewaard."
            />
            <form action={createProfile} className="mb-4 grid gap-2">
              <Field label="Naam nieuw profiel">
                <input
                  name="name"
                  className={inputClass}
                  placeholder="Analist"
                  required
                />
              </Field>
              <LabeledField
                label={
                  <>
                    Standaard verdeelsleutel %
                    <Tip text="Het standaardpercentage dat bij een nieuw contract voor dit profiel wordt ingevuld." />
                  </>
                }
              >
                <input
                  name="defaultAllocationPercentage"
                  type="number"
                  step="0.1"
                  className={inputClass}
                  defaultValue={0}
                />
              </LabeledField>
              <Button type="submit">Profiel toevoegen</Button>
            </form>
            <div className="grid gap-3">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="rounded border border-slate-200 p-3"
                >
                  <form action={updateProfile} className="grid gap-2">
                    <input type="hidden" name="id" value={profile.id} />
                    <Field label="Naam">
                      <input
                        name="name"
                        defaultValue={profile.name}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Standaard %">
                      <input
                        name="defaultAllocationPercentage"
                        type="number"
                        step="0.1"
                        defaultValue={profile.defaultAllocationPercentage}
                        className={inputClass}
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={profile.active}
                      />
                      Actief
                    </label>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span>
                        {profile._count.employees} medewerker
                        {profile._count.employees !== 1 ? "s" : ""}
                      </span>
                      <span>{"·"}</span>
                      <span>
                        {profile._count.timeEntries} geregistreerde uren-lijnen
                      </span>
                      <span>{"·"}</span>
                      <span>
                        {profile._count.contractAllocationTemplates}{" "}
                        contract-verdeelsleutels
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" variant="secondary">
                        Bewaren
                      </Button>
                      </div>
                  </form>
                  <form action={deactivateProfile} className="mt-2">
                    <input type="hidden" name="id" value={profile.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Profiel "${profile.name}" deactiveren? Het profiel wordt niet verwijderd maar inactief gezet. Historische uren blijven bewaard.`}
                      label="Deactiveer profiel"
                      variant="danger"
                    />
                  </form>
                </div>
              ))}
            </div>
          </Card>

          {/* Medewerkers */}
          <Card>
            <CardHeader
              title="Medewerkers"
              description="Koppel medewerkers aan een profielcategorie. Medewerkers worden gedeactiveerd, niet verwijderd - historische uren blijven bewaard."
            />
            <form action={createEmployee} className="mb-4 grid gap-2">
              <Field label="Naam nieuwe medewerker">
                <input
                  name="name"
                  className={inputClass}
                  placeholder="Voornaam Achternaam"
                  required
                />
              </Field>
              <Field label="Profiel">
                <select name="profileCategoryId" className={inputClass}>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Capaciteit (u/week)">
                <input
                  name="weeklyCapacityHours"
                  type="number"
                  step="0.5"
                  defaultValue={40}
                  className={inputClass}
                />
              </Field>
              <Button type="submit">Medewerker toevoegen</Button>
            </form>
            <div className="grid gap-3">
              {employees.map((employee) => (
                <div
                  key={employee.id}
                  className="rounded border border-slate-200 p-3"
                >
                  <form action={updateEmployee} className="grid gap-2">
                    <input type="hidden" name="id" value={employee.id} />
                    <Field label="Naam">
                      <input
                        name="name"
                        defaultValue={employee.name}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Profiel">
                      <select
                        name="profileCategoryId"
                        defaultValue={employee.profileCategoryId}
                        className={inputClass}
                      >
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Capaciteit (u/week)">
                      <input
                        name="weeklyCapacityHours"
                        type="number"
                        step="0.5"
                        defaultValue={employee.weeklyCapacityHours}
                        className={inputClass}
                      />
                    </Field>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        name="active"
                        type="checkbox"
                        defaultChecked={employee.active}
                      />
                      Actief
                    </label>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span>
                        {employee._count.timeEntries} geregistreerde uren-lijnen
                      </span>
                      <span>{"·"}</span>
                      <span>Profiel: {employee.profileCategory.name}</span>
                    </div>
                    <Button type="submit" variant="secondary">
                      Bewaren
                    </Button>
                  </form>
                  <form action={deactivateEmployee} className="mt-2">
                    <input type="hidden" name="id" value={employee.id} />
                    <ConfirmSubmitButton
                      confirmMessage={`Medewerker "${employee.name}" deactiveren? De medewerker wordt niet verwijderd maar inactief gezet. Historische uren blijven bewaard.`}
                      label="Deactiveer medewerker"
                      variant="danger"
                    />
                  </form>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
