import {
  createContractWithSetup,
  createEmployee,
  createProfile,
  createTask,
  deactivateContract,
  deactivateEmployee,
  deactivateProfile,
  deactivateTask,
  updateContract,
  updateContractAllocations,
  updateContractBilling,
  updateEmployee,
  updateProfile,
  updateTask,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import { formatDate, formatHours, formatPercent } from "@/lib/utils";

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function dateInput(value: Date) {
  return value.toISOString().slice(0, 10);
}

function statusBadge(active: boolean) {
  return (
    <Badge className={active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-700"}>
      {active ? "Actief" : "Inactief"}
    </Badge>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = (await searchParams) ?? {};
  const adminMessage = typeof params.adminMessage === "string" ? params.adminMessage : "";
  const adminError = typeof params.adminError === "string" ? params.adminError : "";

  const [contracts, employees, profiles] = await Promise.all([
    prisma.contract.findMany({
      include: {
        tasks: { include: { _count: { select: { timeEntries: true } } }, orderBy: { name: "asc" } },
        allocationTemplates: { include: { profileCategory: true }, orderBy: { targetPercentage: "asc" } },
        profileRates: true,
        _count: { select: { timeEntries: true, tasks: true, simulations: true, deliveryReports: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.employee.findMany({
      include: { profileCategory: true, _count: { select: { timeEntries: true } } },
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

  const activeProfiles = profiles.filter((profile) => profile.active);
  const allocationProfiles = activeProfiles.length > 0 ? activeProfiles : profiles;

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Beheer</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Beheer contracten, taken, profielen, medewerkers en verdeelsleutels zonder codewijzigingen.
        </p>
      </div>

      {adminMessage ? (
        <Card className="border-emerald-200 bg-emerald-50 text-sm text-emerald-900">{adminMessage}</Card>
      ) : null}
      {adminError ? <Card className="border-red-200 bg-red-50 text-sm text-red-900">{adminError}</Card> : null}

      <Card>
        <CardHeader
          title="Nieuw contract met taken en verdeelsleutel"
          description="Maak stamdata in één flow aan. De verdeelsleutel moet exact 100% zijn."
        />
        <form action={createContractWithSetup} className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <Field label="Code">
              <input name="code" className={inputClass} placeholder="C-2026-030" required />
            </Field>
            <Field label="Naam">
              <input name="name" className={inputClass} placeholder="Nieuw contract" required />
            </Field>
            <Field label="Budget uren">
              <input name="totalBudgetHours" type="number" step="0.1" className={inputClass} required />
            </Field>
            <Field label="Startdatum">
              <input name="startDate" type="date" className={inputClass} required />
            </Field>
            <Field label="Einddatum">
              <input name="endDate" type="date" className={inputClass} required />
            </Field>
            <Field label="Warning %">
              <input name="warningThreshold" type="number" step="0.1" defaultValue={85} className={inputClass} />
            </Field>
            <Field label="Kritisch %">
              <input name="criticalThreshold" type="number" step="0.1" defaultValue={95} className={inputClass} />
            </Field>
            <Field label="Taken">
              <textarea
                name="tasks"
                className={`${inputClass} min-h-10 py-2`}
                placeholder={"Analyse\nImplementatie\nProjectopvolging"}
              />
            </Field>
          </div>
          <div className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
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
          <div className="flex justify-end">
            <Button type="submit">Contract aanmaken</Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <CardHeader title="Contracten, taken en verdeelsleutels" />
          <div className="grid gap-5">
            {contracts.map((contract) => {
              const allocationByProfile = new Map(
                contract.allocationTemplates.map((line) => [line.profileCategoryId, line.targetPercentage]),
              );
              const rateByProfile = new Map(
                contract.profileRates.map((rate) => [rate.profileCategoryId, rate.unitPrice]),
              );

              return (
                <div key={contract.id} className="grid gap-4 rounded border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-bold text-slate-950">
                        {contract.code} - {contract.name}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">
                        {formatDate(contract.startDate)} tot {formatDate(contract.endDate)} - Budget{" "}
                        {formatHours(contract.totalBudgetHours)}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <Badge className="border-slate-200 bg-white text-slate-700">
                          {contract._count.timeEntries} time entries
                        </Badge>
                        <Badge className="border-slate-200 bg-white text-slate-700">{contract._count.tasks} taken</Badge>
                        <Badge className="border-slate-200 bg-white text-slate-700">
                          {contract._count.simulations} simulaties
                        </Badge>
                      </div>
                    </div>
                    {statusBadge(contract.active)}
                  </div>

                  <form action={updateContract} className="grid gap-3 md:grid-cols-4">
                    <input type="hidden" name="id" value={contract.id} />
                    <Field label="Code">
                      <input name="code" defaultValue={contract.code} className={inputClass} required />
                    </Field>
                    <Field label="Naam">
                      <input name="name" defaultValue={contract.name} className={inputClass} required />
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
                    <Field label="Start">
                      <input name="startDate" type="date" defaultValue={dateInput(contract.startDate)} className={inputClass} />
                    </Field>
                    <Field label="Einde">
                      <input name="endDate" type="date" defaultValue={dateInput(contract.endDate)} className={inputClass} />
                    </Field>
                    <Field label="Warning %">
                      <input
                        name="warningThreshold"
                        type="number"
                        step="0.1"
                        defaultValue={contract.warningThreshold}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Kritisch %">
                      <input
                        name="criticalThreshold"
                        type="number"
                        step="0.1"
                        defaultValue={contract.criticalThreshold}
                        className={inputClass}
                      />
                    </Field>
                    <label className="flex items-center gap-2 self-end text-sm font-medium text-slate-700">
                      <input name="active" type="checkbox" defaultChecked={contract.active} />
                      Actief
                    </label>
                    <div className="flex flex-wrap justify-end gap-2 md:col-span-4">
                      <Button type="submit" variant="secondary">Contract bewaren</Button>
                    </div>
                  </form>

                  <form action={updateContractAllocations} className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 md:grid-cols-4">
                    <input type="hidden" name="contractId" value={contract.id} />
                    {profiles.map((profile) => (
                      <Field key={profile.id} label={`${profile.name} %`}>
                        <input type="hidden" name="profileId" value={profile.id} />
                        <input
                          name={`allocation-${profile.id}`}
                          type="number"
                          step="0.1"
                          defaultValue={allocationByProfile.get(profile.id) ?? 0}
                          className={inputClass}
                        />
                      </Field>
                    ))}
                    <div className="flex items-end justify-end md:col-span-4">
                      <Button type="submit" variant="secondary">Verdeelsleutel bewaren</Button>
                    </div>
                  </form>

                  <form action={updateContractBilling} className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3">
                    <input type="hidden" name="contractId" value={contract.id} />
                    <div className="text-xs font-semibold uppercase text-[var(--muted)]">
                      Facturatie & PV-stamdata (vult de PV automatisch voor)
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <Field label="Btw %">
                        <input name="vatPercentage" type="number" step="0.1" defaultValue={contract.vatPercentage} className={inputClass} />
                      </Field>
                      <Field label="Totaalbudget (€)">
                        <input name="totalBudgetAmount" type="number" step="0.01" defaultValue={contract.totalBudgetAmount ?? ""} className={inputClass} />
                      </Field>
                      <Field label="Bestekcode">
                        <input name="specificationCode" defaultValue={contract.specificationCode ?? ""} className={inputClass} />
                      </Field>
                      <Field label="Opdrachtbrief-titel">
                        <input name="orderLetterTitle" defaultValue={contract.orderLetterTitle ?? ""} className={inputClass} />
                      </Field>
                      <Field label="Opdrachtbrief-referentie">
                        <input name="orderLetterReference" defaultValue={contract.orderLetterReference ?? ""} className={inputClass} />
                      </Field>
                      <Field label="Domeinmanager — naam">
                        <input name="domainManagerName" defaultValue={contract.domainManagerName ?? ""} className={inputClass} />
                      </Field>
                      <Field label="Domeinmanager — functie">
                        <input name="domainManagerRole" defaultValue={contract.domainManagerRole ?? ""} className={inputClass} placeholder="Domeinmanager" />
                      </Field>
                      <Field label="Projectleider(s) — namen">
                        <input name="projectLeadNames" defaultValue={contract.projectLeadNames ?? ""} className={inputClass} />
                      </Field>
                      <Field label="Organisatie (handtekeningblok)">
                        <input name="domainManagerOrg" defaultValue={contract.domainManagerOrg ?? ""} className={inputClass} placeholder="FOD ... — DG ..." />
                      </Field>
                    </div>
                    <div className="text-xs font-semibold uppercase text-[var(--muted)]">Eenheidsprijs per profiel (excl. btw, per uur)</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {allocationProfiles.map((profile) => (
                        <Field key={profile.id} label={`${profile.name} (€/u)`}>
                          <input type="hidden" name="profileId" value={profile.id} />
                          <input
                            name={`unit-${profile.id}`}
                            type="number"
                            step="0.01"
                            defaultValue={rateByProfile.get(profile.id) ?? ""}
                            className={inputClass}
                          />
                        </Field>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button type="submit" variant="secondary">Facturatiegegevens bewaren</Button>
                    </div>
                  </form>

                  <div className="grid gap-2">
                    <div className="text-xs font-semibold uppercase text-[var(--muted)]">Taken binnen contract</div>
                    {contract.tasks.map((task) => (
                      <div key={task.id} className="grid gap-2 rounded border border-slate-100 p-2 md:grid-cols-[1fr_auto_auto]">
                        <form action={updateTask} className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                          <input type="hidden" name="id" value={task.id} />
                          <input type="hidden" name="contractId" value={contract.id} />
                          <input name="name" defaultValue={task.name} className={inputClass} />
                          <label className="flex items-center gap-2 text-sm">
                            <input name="active" type="checkbox" defaultChecked={task.active} />
                            Actief
                          </label>
                          <Button type="submit" variant="secondary">Bewaren</Button>
                        </form>
                        <div className="flex items-center text-xs text-[var(--muted)]">
                          {task._count.timeEntries} time entries
                        </div>
                        <form action={deactivateTask}>
                          <input type="hidden" name="id" value={task.id} />
                          <Button type="submit" variant="danger">Deactiveer</Button>
                        </form>
                      </div>
                    ))}
                    <form action={createTask} className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <input type="hidden" name="contractId" value={contract.id} />
                      <input name="name" className={inputClass} placeholder="Nieuwe taak" />
                      <Button type="submit">Taak toevoegen</Button>
                    </form>
                  </div>

                  <form action={deactivateContract} className="flex justify-end">
                    <input type="hidden" name="id" value={contract.id} />
                    <Button type="submit" variant="danger">Contract deactiveren</Button>
                  </form>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardHeader title="Profielen" description="Profielen worden gedeactiveerd, niet verwijderd." />
            <form action={createProfile} className="mb-4 grid gap-2">
              <Field label="Nieuw profiel">
                <input name="name" className={inputClass} placeholder="Analist" required />
              </Field>
              <Field label="Standaard %">
                <input name="defaultAllocationPercentage" type="number" step="0.1" className={inputClass} defaultValue={0} />
              </Field>
              <Button type="submit">Profiel toevoegen</Button>
            </form>
            <div className="grid gap-3">
              {profiles.map((profile) => (
                <div key={profile.id} className="rounded border border-slate-200 p-3">
                  <form action={updateProfile} className="grid gap-2">
                    <input type="hidden" name="id" value={profile.id} />
                    <input name="name" defaultValue={profile.name} className={inputClass} />
                    <input
                      name="defaultAllocationPercentage"
                      type="number"
                      step="0.1"
                      defaultValue={profile.defaultAllocationPercentage}
                      className={inputClass}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input name="active" type="checkbox" defaultChecked={profile.active} />
                      Actief
                    </label>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span>{profile._count.employees} medewerkers</span>
                      <span>{profile._count.timeEntries} time entries</span>
                      <span>{profile._count.contractAllocationTemplates} verdeelsleutels</span>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" variant="secondary">Bewaren</Button>
                    </div>
                  </form>
                  <form action={deactivateProfile} className="mt-2">
                    <input type="hidden" name="id" value={profile.id} />
                    <Button type="submit" variant="danger">Deactiveer</Button>
                  </form>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Medewerkers" description="Koppel medewerkers aan één profielcategorie." />
            <form action={createEmployee} className="mb-4 grid gap-2">
              <Field label="Nieuwe medewerker">
                <input name="name" className={inputClass} placeholder="Naam" required />
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
              <Button type="submit">Medewerker toevoegen</Button>
            </form>
            <div className="grid gap-3">
              {employees.map((employee) => (
                <div key={employee.id} className="rounded border border-slate-200 p-3">
                  <form action={updateEmployee} className="grid gap-2">
                    <input type="hidden" name="id" value={employee.id} />
                    <input name="name" defaultValue={employee.name} className={inputClass} />
                    <select name="profileCategoryId" defaultValue={employee.profileCategoryId} className={inputClass}>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm">
                      <input name="active" type="checkbox" defaultChecked={employee.active} />
                      Actief
                    </label>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                      <span>{employee._count.timeEntries} time entries</span>
                      <span>Profiel: {employee.profileCategory.name}</span>
                    </div>
                    <Button type="submit" variant="secondary">Bewaren</Button>
                  </form>
                  <form action={deactivateEmployee} className="mt-2">
                    <input type="hidden" name="id" value={employee.id} />
                    <Button type="submit" variant="danger">Deactiveer</Button>
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
