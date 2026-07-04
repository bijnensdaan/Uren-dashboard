import { ChevronDown, FileUp, Plus } from "lucide-react";
import { createContractFromDocument } from "@/app/admin/actions/contracts";
import { LabeledField, Tip } from "@/components/admin/shared";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingNotice, SubmitButton } from "@/components/ui/pending-feedback";

type AllocationProfile = { id: string; name: string };

/**
 * "Nieuwe opdrachtbrief aanmaken" — inklapbaar formulier bovenaan de beheerpagina.
 * Upload een bestand voor AI-invulling of vul de gegevens handmatig in.
 */
export function NewContractForm({
  allocationProfiles,
}: {
  allocationProfiles: AllocationProfile[];
}) {
  return (
    <details className="group rounded border border-teal-300 bg-white shadow-sm transition hover:border-teal-400">
      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-3 rounded bg-teal-50 px-4 py-4 text-teal-950 transition hover:bg-teal-100 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3 text-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-teal-300 bg-white text-[var(--primary)] shadow-sm">
            <Plus size={20} strokeWidth={2.5} />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-bold">
              Nieuwe opdrachtbrief aanmaken
            </span>
            <span className="mt-0.5 block text-sm font-normal text-teal-800">
              Upload een bestand voor AI-invulling of vul de gegevens zelf in.
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 rounded border border-teal-300 bg-white px-3 py-2 text-xs font-bold text-teal-900 shadow-sm">
          Open formulier
          <ChevronDown
            size={15}
            className="transition group-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="border-t border-teal-200 bg-white p-4">
        <p className="mb-4 text-sm text-[var(--muted)]">
          Maak een nieuwe opdrachtbrief aan. Upload optioneel een PDF of Word-bestand om Gemini de gegevens automatisch te laten invullen. Zonder bestand vul je alles zelf in.
        </p>
        <form
          action={createContractFromDocument}
          encType="multipart/form-data"
          className="grid gap-4"
        >
          {/* Bestand uploaden — optioneel */}
          <div className="rounded border border-teal-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-teal-200 bg-white text-[var(--primary)]">
                <FileUp size={18} />
              </span>
              <span>
                <span className="block text-sm font-bold text-slate-950">
                  Opdrachtbrief uploaden
                </span>
                <span className="mt-0.5 block text-xs text-slate-600">
                  Optioneel. Gemini vult code, datums, budget, taken en profielen automatisch aan.
                </span>
              </span>
            </div>
            <input
              name="file"
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="w-full rounded border border-[var(--border)] bg-white px-3 py-2 text-sm text-slate-700 outline-none file:mr-3 file:rounded file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-teal-900 hover:file:bg-teal-100 focus:border-[var(--primary)] focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {/* Basisgegevens */}
          <div className="grid gap-3 md:grid-cols-5">
            <Field label="Code">
              <input
                name="code"
                className={inputClass}
                placeholder="C-2026-030"
              />
            </Field>
            <Field label="Naam">
              <input
                name="name"
                className={inputClass}
                placeholder="Naam opdrachtbrief"
              />
            </Field>
            <Field label="Startdatum">
              <input name="startDate" type="date" className={inputClass} />
            </Field>
            <Field label="Einddatum">
              <input name="endDate" type="date" className={inputClass} />
            </Field>
            <Field label="Budget uren">
              <input
                name="totalBudgetHours"
                type="number"
                step="0.1"
                className={inputClass}
              />
            </Field>
          </div>

          {/* Drempels + taken */}
          <div className="grid gap-3 md:grid-cols-4">
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
            <Field label="Taken (één per lijn)" className="md:col-span-2">
              <textarea
                name="tasks"
                className={`${inputClass} min-h-20 py-2`}
                placeholder={"Analyse\nImplementatie\nProjectopvolging"}
              />
            </Field>
          </div>

          {/* Verdeelsleutel */}
          <div className="rounded border border-teal-200 bg-teal-50/50 p-3">
            <div className="mb-1 flex items-center text-xs font-semibold uppercase text-teal-800">
              Verdeelsleutel
              <Tip text="Hoe de uren over de profielen worden verdeeld — het totaal moet exact 100% zijn." />
            </div>
            <p className="mb-3 text-xs text-teal-700">
              Alleen invullen als je <strong>geen bestand uploadt</strong>. Bij een upload leest Gemini de verdeelsleutel automatisch uit het document.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {allocationProfiles.map((profile) => (
                <Field key={profile.id} label={`${profile.name} %`}>
                  <input type="hidden" name="profileId" value={profile.id} />
                  <input
                    name={`allocation-${profile.id}`}
                    type="number"
                    step="0.1"
                    placeholder="0"
                    className={inputClass}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <SubmitButton pendingLabel="Verwerken...">
              Opdrachtbrief aanmaken
            </SubmitButton>
          </div>
          <PendingNotice text="Opdrachtbrief wordt verwerkt — Gemini leest het document uit. Dit kan 20–30 seconden duren." />
        </form>
      </div>
    </details>
  );
}
