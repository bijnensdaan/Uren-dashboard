import type { Prisma } from "@prisma/client";
import { createProfile, deactivateProfile, updateProfile } from "@/app/admin/actions/profiles";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { LabeledField, Tip } from "@/components/admin/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";

/** Profielcategorie inclusief de tellingen die de beheerpagina laadt. */
export type AdminProfile = Prisma.ProfileCategoryGetPayload<{
  include: {
    _count: {
      select: {
        employees: true;
        timeEntries: true;
        contractAllocationTemplates: true;
      };
    };
  };
}>;

/** Sectie "Profielen": profielen aanmaken, bewerken en deactiveren. */
export function ProfilesSection({ profiles }: { profiles: AdminProfile[] }) {
  return (
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
      <div className="grid gap-2">
        {profiles.map((profile) => (
          <details
            key={profile.id}
            className="group rounded border border-slate-200"
          >
            <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 rounded px-3 py-2 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 truncate text-sm font-medium text-slate-800">
                {profile.name}
                {!profile.active ? (
                  <Badge className="border-slate-200 bg-slate-100 text-slate-500">
                    Inactief
                  </Badge>
                ) : null}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {profile._count.employees} mw · ▼
              </span>
            </summary>
            <div className="border-t border-slate-100 p-3">
              <form action={updateProfile} className="grid gap-2 sm:grid-cols-2 sm:items-end">
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
                <div className="flex justify-end">
                  <Button type="submit" variant="secondary">
                    Bewaren
                  </Button>
                </div>
              </form>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <span>
                  {profile._count.timeEntries} uren-lijnen ·{" "}
                  {profile._count.contractAllocationTemplates} verdeelsleutels
                </span>
                <form action={deactivateProfile}>
                  <input type="hidden" name="id" value={profile.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Profiel "${profile.name}" deactiveren? Het profiel wordt niet verwijderd maar inactief gezet. Historische uren blijven bewaard.`}
                    label="Deactiveer"
                    variant="danger"
                  />
                </form>
              </div>
            </div>
          </details>
        ))}
      </div>
    </Card>
  );
}
