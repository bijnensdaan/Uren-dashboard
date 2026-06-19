import { Plus, Trash2, Upload } from "lucide-react";
import { createTimeEntry, deleteTimeEntry } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import { formatDate, formatHours } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TimeEntriesPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const contractId = typeof params.contract === "string" ? params.contract : "";
  const employeeId = typeof params.employee === "string" ? params.employee : "";
  const imported = typeof params.imported === "string" ? params.imported : "";
  const errors = typeof params.errors === "string" ? params.errors : "";

  const [contracts, employees, tasks, entries] = await Promise.all([
    prisma.contract.findMany({ orderBy: { code: "asc" } }),
    prisma.employee.findMany({ include: { profileCategory: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ include: { contract: true }, orderBy: [{ contract: { code: "asc" } }, { name: "asc" }] }),
    prisma.timeEntry.findMany({
      where: {
        ...(contractId ? { contractId } : {}),
        ...(employeeId ? { employeeId } : {}),
      },
      include: { contract: true, employee: true, task: true, profileCategory: true },
      orderBy: { date: "desc" },
      take: 200,
    }),
  ]);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Time Entry Management</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Beheer individuele prestaties en importeer nieuwe records.</p>
      </div>

      {imported || errors ? (
        <Card className="border-teal-200 bg-teal-50 text-sm text-teal-950">
          Import voltooid: {imported || "0"} records toegevoegd, {errors || "0"} rijen overgeslagen.
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Nieuwe registratie" description="Een entry moet altijd aan contract en taak gekoppeld zijn." />
        <form action={createTimeEntry} className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Medewerker">
            <select name="employeeId" className={inputClass} required>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Contract">
            <select name="contractId" className={inputClass} required>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.code}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Taak">
            <select name="taskId" className={inputClass} required>
              {tasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.contract.code} - {task.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Datum">
            <input name="date" type="date" className={inputClass} defaultValue="2026-06-19" required />
          </Field>
          <Field label="Uren">
            <input name="hours" type="number" step="0.1" className={inputClass} placeholder="7.6" required />
          </Field>
          <Field label="Notities" className="md:col-span-2 lg:col-span-4">
            <input name="notes" className={inputClass} placeholder="Optioneel" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full">
              <Plus size={16} />
              Toevoegen
            </Button>
          </div>
        </form>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Filters" />
          <form className="grid gap-3 md:grid-cols-3">
            <Field label="Contract">
              <select name="contract" defaultValue={contractId} className={inputClass}>
                <option value="">Alle contracten</option>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.code}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Medewerker">
              <select name="employee" defaultValue={employeeId} className={inputClass}>
                <option value="">Alle medewerkers</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Filter</Button>
            </div>
          </form>
        </Card>
        <Card>
          <CardHeader title="Bulk import" description="CSV en XLSX met kolommen employee,date,hours,task,contract,profile,notes." />
          <form action="/api/import" method="post" encType="multipart/form-data" className="flex flex-wrap items-end gap-3">
            <Field label="Bestand">
              <input name="file" type="file" accept=".csv,.xlsx" className={inputClass} required />
            </Field>
            <Button type="submit" variant="secondary">
              <Upload size={16} />
              Importeren
            </Button>
          </form>
        </Card>
      </div>

      <Card>
        <CardHeader title="Records" description={`${entries.length} laatste records binnen de selectie.`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                <th className="py-2 pr-4">Datum</th>
                <th className="py-2 pr-4">Contract</th>
                <th className="py-2 pr-4">Taak</th>
                <th className="py-2 pr-4">Medewerker</th>
                <th className="py-2 pr-4">Profiel</th>
                <th className="py-2 pr-4">Uren</th>
                <th className="py-2">Actie</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4">{formatDate(entry.date)}</td>
                  <td className="py-3 pr-4">{entry.contract.code}</td>
                  <td className="py-3 pr-4">{entry.task.name}</td>
                  <td className="py-3 pr-4">{entry.employee.name}</td>
                  <td className="py-3 pr-4">{entry.profileCategory.name}</td>
                  <td className="py-3 pr-4">{formatHours(entry.hours)}</td>
                  <td className="py-3">
                    <form action={deleteTimeEntry}>
                      <input type="hidden" name="id" value={entry.id} />
                      <input type="hidden" name="contractId" value={entry.contractId} />
                      <Button type="submit" variant="danger" className="h-8 px-2" title="Verwijderen">
                        <Trash2 size={15} />
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
