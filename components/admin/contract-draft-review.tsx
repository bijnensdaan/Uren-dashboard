import { CheckCircle2, FileText, Sparkles } from "lucide-react";
import { confirmContractDraft, discardContractDraft } from "@/app/admin/actions/contracts";
import { LabeledField, Tip } from "@/components/admin/shared";
import { Badge } from "@/components/ui/badge";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingNotice, SubmitButton } from "@/components/ui/pending-feedback";
import type { ContractDraft } from "@/lib/contract-draft-server";

/**
 * Controle-stap van de upload-flow: toont alles wat Gemini uit de geüploade
 * opdrachtbrief heeft gelezen in een bewerkbaar formulier. Er is nog NIETS
 * toegevoegd aan het dashboard — dat gebeurt pas bij "Toevoegen aan dashboard".
 */
export function ContractDraftReview({ draft }: { draft: ContractDraft }) {
  const { setup } = draft;
  const fallbackName =
    setup.contractName ?? setup.orderLetterTitle ?? draft.fileName.replace(/\.[^.]+$/, "");

  const sourceBadge = (source: "explicit" | "inferred") =>
    source === "explicit" ? (
      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">uit document</Badge>
    ) : (
      <Badge className="border-amber-200 bg-amber-50 text-amber-800">AI-voorstel</Badge>
    );

  return (
    <div className="rounded border-2 border-[var(--primary)] bg-white shadow-md">
      {/* Kop */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-t border-b border-teal-200 bg-teal-50 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-teal-300 bg-white text-[var(--primary)]">
            <CheckCircle2 size={20} />
          </span>
          <div>
            <h2 className="text-base font-bold text-teal-950">
              Stap 2 van 2 — Controleer de uitgelezen gegevens
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-teal-800">
              <FileText size={14} /> {draft.fileName}
            </p>
          </div>
        </div>
        <Badge className="border-teal-300 bg-white text-teal-900">
          Nog niet toegevoegd aan het dashboard
        </Badge>
      </div>

      <div className="grid gap-4 p-4">
        <p className="text-sm text-[var(--muted)]">
          Gemini heeft de opdrachtbrief uitgelezen. Controleer hieronder alle gegevens, pas aan
          waar nodig en klik daarna op <strong>Toevoegen aan dashboard</strong>. Met{" "}
          <strong>Annuleren</strong> gooi je dit voorstel weg zonder iets toe te voegen.
        </p>

        {setup.overallRationale ? (
          <p className="flex items-start gap-2 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <Sparkles size={14} className="mt-0.5 shrink-0 text-[var(--primary)]" />
            <span>
              <span className="font-semibold">Toelichting van de AI:</span> {setup.overallRationale}
            </span>
          </p>
        ) : null}

        <form action={confirmContractDraft} className="grid gap-4">
          <input type="hidden" name="draftId" value={draft.id} />

          {/* Basisgegevens */}
          <fieldset className="grid gap-3 rounded border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-slate-600">
              Basisgegevens
            </legend>
            <div className="grid gap-3 md:grid-cols-5">
              <Field label="Code">
                <input name="code" defaultValue={setup.contractCode ?? ""} className={inputClass} placeholder="C-2026-030" />
              </Field>
              <Field label="Naam" className="md:col-span-2">
                <input name="name" defaultValue={fallbackName} className={inputClass} required />
              </Field>
              <Field label="Startdatum">
                <input name="startDate" type="date" defaultValue={setup.startDate ?? ""} className={inputClass} required />
              </Field>
              <Field label="Einddatum">
                <input name="endDate" type="date" defaultValue={setup.endDate ?? ""} className={inputClass} required />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Budget uren">
                <input
                  name="totalBudgetHours"
                  type="number"
                  step="0.1"
                  defaultValue={setup.totalBudgetHours ?? ""}
                  className={inputClass}
                  required
                />
              </Field>
              <LabeledField
                label={
                  <>
                    Waarschuwingsdrempel %
                    <Tip text="Bij welk percentage van het budget een oranje waarschuwing verschijnt (bijv. 85)." />
                  </>
                }
              >
                <input name="warningThreshold" type="number" step="0.1" defaultValue={85} className={inputClass} />
              </LabeledField>
              <LabeledField
                label={
                  <>
                    Kritische drempel %
                    <Tip text="Bij welk percentage een rode kritische melding verschijnt (bijv. 95)." />
                  </>
                }
              >
                <input name="criticalThreshold" type="number" step="0.1" defaultValue={95} className={inputClass} />
              </LabeledField>
            </div>
          </fieldset>

          {/* Profielen & verdeelsleutel */}
          <fieldset className="grid gap-2 rounded border border-slate-200 p-3">
            <legend className="flex items-center px-1 text-xs font-semibold uppercase text-slate-600">
              Profielen, verdeelsleutel &amp; tarieven
              <Tip text="De verdeelsleutel bepaalt hoe het urenbudget over de profielen wordt verdeeld. De percentages worden bij het toevoegen automatisch herschaald naar exact 100%." />
            </legend>
            {setup.profiles.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Geen profielen gevonden in het document. Je kunt ze later toevoegen via Beheer.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-[var(--muted)]">
                      <th className="pb-2 pr-2 text-center font-medium">Meenemen</th>
                      <th className="pb-2 pr-2 font-medium">Profiel</th>
                      <th className="pb-2 pr-2 font-medium">Verdeling %</th>
                      <th className="pb-2 pr-2 font-medium">Tarief €/u</th>
                      <th className="pb-2 font-medium">Bron</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setup.profiles.map((profile, index) => (
                      <tr key={index} className="border-t border-slate-100 align-top">
                        <td className="py-2 pr-2 text-center">
                          <input type="hidden" name="profileIndex" value={index} />
                          <input type="checkbox" name={`profile-include-${index}`} defaultChecked />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            name={`profile-name-${index}`}
                            defaultValue={profile.name}
                            className={`${inputClass} w-full min-w-40`}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            name={`profile-pct-${index}`}
                            type="number"
                            step="0.1"
                            defaultValue={profile.defaultAllocationPercentage ?? ""}
                            className={`${inputClass} w-24`}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            name={`profile-rate-${index}`}
                            type="number"
                            step="0.01"
                            defaultValue={profile.unitPrice ?? ""}
                            className={`${inputClass} w-28`}
                          />
                        </td>
                        <td className="py-2">
                          {sourceBadge(profile.source)}
                          {profile.rationale ? (
                            <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">{profile.rationale}</p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </fieldset>

          {/* Medewerkers */}
          <fieldset className="grid gap-2 rounded border border-slate-200 p-3">
            <legend className="flex items-center px-1 text-xs font-semibold uppercase text-slate-600">
              Medewerkers uit de opdrachtbrief
              <Tip text="Alleen personen die letterlijk in het document vermeld staan. Vink uit wie je niet wilt toevoegen; bestaande medewerkers met dezelfde naam worden niet dubbel aangemaakt." />
            </legend>
            {setup.employees.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Geen medewerkers letterlijk vermeld in het document. Je kunt medewerkers later
                koppelen via Beheer.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-[var(--muted)]">
                      <th className="pb-2 pr-2 text-center font-medium">Meenemen</th>
                      <th className="pb-2 pr-2 font-medium">Naam</th>
                      <th className="pb-2 pr-2 font-medium">Profiel</th>
                      <th className="pb-2 font-medium">Uren/week</th>
                    </tr>
                  </thead>
                  <tbody>
                    {setup.employees.map((employee, index) => (
                      <tr key={index} className="border-t border-slate-100">
                        <td className="py-2 pr-2 text-center">
                          <input type="hidden" name="employeeIndex" value={index} />
                          <input type="checkbox" name={`employee-include-${index}`} defaultChecked />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            name={`employee-name-${index}`}
                            defaultValue={employee.name}
                            className={`${inputClass} w-full min-w-40`}
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <input
                            name={`employee-profile-${index}`}
                            defaultValue={employee.profileName}
                            className={`${inputClass} w-full min-w-32`}
                          />
                        </td>
                        <td className="py-2">
                          <input
                            name={`employee-capacity-${index}`}
                            type="number"
                            step="0.5"
                            defaultValue={employee.weeklyCapacityHours || 40}
                            className={`${inputClass} w-24`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </fieldset>

          {/* Taken */}
          <fieldset className="grid gap-2 rounded border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase text-slate-600">Taken</legend>
            <Field label="Taken (één per lijn)">
              <textarea
                name="tasks"
                defaultValue={setup.tasks.map((task) => task.name).join("\n")}
                className={`${inputClass} min-h-24 py-2`}
                placeholder={"Analyse\nImplementatie\nProjectopvolging"}
              />
            </Field>
          </fieldset>

          {/* Facturatie & PV-stamdata — dichtgeklapt, minder vaak nodig */}
          <details className="rounded border border-slate-200">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold uppercase text-slate-600 hover:bg-slate-50">
              Facturatie &amp; PV-gegevens (optioneel)
            </summary>
            <div className="grid gap-3 border-t border-slate-100 p-3 md:grid-cols-3">
              <Field label="BTW %">
                <input name="vatPercentage" type="number" step="0.1" defaultValue={setup.vatPercentage ?? 21} className={inputClass} />
              </Field>
              <Field label="Totaalbedrag (excl. BTW)">
                <input name="totalBudgetAmount" type="number" step="0.01" defaultValue={setup.totalBudgetAmount ?? ""} className={inputClass} />
              </Field>
              <Field label="Bestekcode">
                <input name="specificationCode" defaultValue={setup.specificationCode ?? ""} className={inputClass} />
              </Field>
              <Field label="Titel opdrachtbrief" className="md:col-span-2">
                <input name="orderLetterTitle" defaultValue={setup.orderLetterTitle ?? ""} className={inputClass} />
              </Field>
              <Field label="Referentie opdrachtbrief">
                <input name="orderLetterReference" defaultValue={setup.orderLetterReference ?? ""} className={inputClass} />
              </Field>
              <Field label="Domeinmanager">
                <input name="domainManagerName" defaultValue={setup.domainManagerName ?? ""} className={inputClass} />
              </Field>
              <Field label="Rol domeinmanager">
                <input name="domainManagerRole" defaultValue={setup.domainManagerRole ?? ""} className={inputClass} />
              </Field>
              <Field label="Organisatie domeinmanager">
                <input name="domainManagerOrg" defaultValue={setup.domainManagerOrg ?? ""} className={inputClass} />
              </Field>
              <Field label="Projectleider(s)" className="md:col-span-3">
                <input name="projectLeadNames" defaultValue={setup.projectLeadNames ?? ""} className={inputClass} />
              </Field>
            </div>
          </details>

          {/* Acties */}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <button
              type="submit"
              formAction={discardContractDraft}
              formNoValidate
              className="inline-flex h-10 items-center rounded border border-[var(--border)] bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Annuleren
            </button>
            <SubmitButton pendingLabel="Toevoegen...">Toevoegen aan dashboard</SubmitButton>
          </div>
          <PendingNotice text="De opdrachtbrief wordt toegevoegd en de fasering wordt opgehaald — dit kan 20-30 seconden duren." />
        </form>
      </div>
    </div>
  );
}
