import type { Prisma, ProfileCategory } from "@prisma/client";
import { createEmployee, deactivateEmployee, updateEmployee } from "@/app/admin/actions/employees";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";

/** Medewerker inclusief profiel en tellingen zoals de beheerpagina die laadt. */
export type AdminEmployee = Prisma.EmployeeGetPayload<{
  include: {
    profileCategory: true;
    _count: { select: { timeEntries: true } };
  };
}>;

/** Sectie "Medewerkers": medewerkers aanmaken, bewerken en deactiveren. */
export function EmployeesSection({
  employees,
  profiles,
}: {
  employees: AdminEmployee[];
  profiles: ProfileCategory[];
}) {
  return (
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
      <div className="grid gap-2">
        {employees.map((employee) => (
          <details
            key={employee.id}
            className="group rounded border border-slate-200"
          >
            <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 rounded px-3 py-2 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2 truncate text-sm font-medium text-slate-800">
                {employee.name}
                {!employee.active ? (
                  <Badge className="border-slate-200 bg-slate-100 text-slate-500">
                    Inactief
                  </Badge>
                ) : null}
              </span>
              <span className="shrink-0 truncate text-xs text-[var(--muted)]">
                {employee.profileCategory.name} · {employee.weeklyCapacityHours.toLocaleString("nl-BE")} u/week · ▼
              </span>
            </summary>
            <div className="border-t border-slate-100 p-3">
              <form action={updateEmployee} className="grid gap-2 sm:grid-cols-2 sm:items-end">
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
                <Field label="Status">
                  <span className={`${inputClass} flex items-center gap-2 font-normal text-slate-700`}>
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={employee.active}
                    />
                    Actief
                  </span>
                </Field>
                <div className="sm:col-span-2 flex justify-end">
                  <Button type="submit" variant="secondary">
                    Bewaren
                  </Button>
                </div>
              </form>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <span>{employee._count.timeEntries} uren-lijnen</span>
                <form action={deactivateEmployee}>
                  <input type="hidden" name="id" value={employee.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Medewerker "${employee.name}" deactiveren? De medewerker wordt niet verwijderd maar inactief gezet. Historische uren blijven bewaard.`}
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
