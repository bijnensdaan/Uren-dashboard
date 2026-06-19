import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatDate, formatHours, formatPercent } from "@/lib/utils";

export default async function AdminPage() {
  const [contracts, employees, profiles] = await Promise.all([
    prisma.contract.findMany({
      include: {
        tasks: true,
        allocationTemplates: { include: { profileCategory: true }, orderBy: { targetPercentage: "asc" } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.employee.findMany({ include: { profileCategory: true }, orderBy: { name: "asc" } }),
    prisma.profileCategory.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Beheer</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Centrale stamdata voor contracten, taken, medewerkers, profielen en verdeelsleutels.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Contracten en verdeelsleutels" />
          <div className="grid gap-4">
            {contracts.map((contract) => (
              <div key={contract.id} className="rounded border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-bold text-slate-950">
                      {contract.code} - {contract.name}
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {formatDate(contract.startDate)} tot {formatDate(contract.endDate)} · Budget{" "}
                      {formatHours(contract.totalBudgetHours)}
                    </div>
                  </div>
                  <Badge className="border-slate-200 bg-slate-50 text-slate-700">
                    {contract.active ? "Actief" : "Inactief"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-semibold uppercase text-[var(--muted)]">Taken</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {contract.tasks.map((task) => (
                        <Badge key={task.id} className="border-slate-200 bg-white text-slate-700">
                          {task.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-[var(--muted)]">Verdeelsleutel</div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {contract.allocationTemplates.map((line) => (
                        <Badge key={line.id} className="border-teal-200 bg-teal-50 text-teal-900">
                          {line.profileCategory.name}: {formatPercent(line.targetPercentage)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-5">
          <Card>
            <CardHeader title="Profielen" />
            <div className="grid gap-2 text-sm">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex justify-between border-b border-slate-100 py-2">
                  <span>{profile.name}</span>
                  <span className="font-semibold">{formatPercent(profile.defaultAllocationPercentage)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Medewerkers" />
            <div className="grid gap-2 text-sm">
              {employees.map((employee) => (
                <div key={employee.id} className="flex justify-between border-b border-slate-100 py-2">
                  <span>{employee.name}</span>
                  <span className="text-[var(--muted)]">{employee.profileCategory.name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
