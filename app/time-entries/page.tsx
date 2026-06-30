import { Trash2 } from "lucide-react";
import { deleteTimeEntry } from "@/app/actions";
import { HoursTracker } from "@/components/time-entries/hours-tracker";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatDate, formatHours } from "@/lib/utils";

export default async function TimeEntriesPage() {
  const [contracts, employees, tasks, entries] = await Promise.all([
    prisma.contract.findMany({ orderBy: { code: "asc" } }),
    prisma.employee.findMany({ include: { profileCategory: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ orderBy: [{ name: "asc" }] }),
    prisma.timeEntry.findMany({
      include: { contract: true, employee: { include: { profileCategory: true } }, task: true },
      orderBy: { date: "desc" },
      take: 500,
    }),
  ]);

  const employeeOpts = employees.map((emp) => ({
    id: emp.id,
    name: emp.name,
    profileCategoryId: emp.profileCategoryId,
    profileName: emp.profileCategory.name,
  }));

  const contractOpts = contracts.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
  }));

  const taskOpts = tasks.map((t) => ({
    id: t.id,
    name: t.name,
    contractId: t.contractId,
  }));

  const entryDTOs = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString(),
    hours: e.hours,
    notes: e.notes ?? null,
    clockIn: e.clockIn ?? null,
    clockOut: e.clockOut ?? null,
    pauseMinutes: e.pauseMinutes ?? null,
    employeeId: e.employeeId,
    employeeName: e.employee.name,
    contractId: e.contractId,
    contractCode: e.contract.code,
    taskId: e.taskId,
    taskName: e.task.name,
    profileName: e.employee.profileCategory.name,
  }));

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Urentracker</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Klok in en uit; bij het uitklokken leg je medewerker, opdrachtbrief en taak vast.
        </p>
      </div>

      <HoursTracker
        employees={employeeOpts}
        contracts={contractOpts}
        tasks={taskOpts}
        entries={entryDTOs}
      />

      <Card>
        <CardHeader title="Records" description={`${entries.length} laatste records.`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                <th className="py-2 pr-4">Datum</th>
                <th className="py-2 pr-4">Opdrachtbrief</th>
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
                  <td className="py-3 pr-4">{entry.employee.profileCategory.name}</td>
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
