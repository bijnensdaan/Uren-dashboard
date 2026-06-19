import { FileCheck, FlaskConical } from "lucide-react";
import { createSimulation, updateSimulationAndGenerateReport } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { prisma } from "@/lib/db";
import { formatDate, formatHours, formatPercent } from "@/lib/utils";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SimulationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const selectedId = typeof params.selected === "string" ? params.selected : "";

  const [contracts, simulations] = await Promise.all([
    prisma.contract.findMany({ orderBy: { code: "asc" } }),
    prisma.simulation.findMany({
      include: {
        contract: true,
        lines: { include: { profileCategory: true }, orderBy: { targetPercentage: "asc" } },
        deliveryReport: true,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const selected = simulations.find((simulation) => simulation.id === selectedId) ?? simulations[0];
  const actuals = selected
    ? await prisma.timeEntry.groupBy({
        by: ["profileCategoryId"],
        where: { contractId: selected.contractId },
        _sum: { hours: true },
      })
    : [];

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Simulatietool</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Maak een initiële urenverdeling op basis van contracttemplates en genereer een PV.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader title="Nieuwe simulatie" description="Gebruik de standaardverdeelsleutel van het contract." />
          <form action={createSimulation} className="grid gap-3">
            <Field label="Contract">
              <select name="contractId" className={inputClass} required>
                {contracts.map((contract) => (
                  <option key={contract.id} value={contract.id}>
                    {contract.code} - {contract.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Totaal voorziene uren">
              <input name="inputTotalHours" type="number" step="0.1" className={inputClass} defaultValue={380} required />
            </Field>
            <Button type="submit">
              <FlaskConical size={16} />
              Voorstel maken
            </Button>
          </form>

          <div className="mt-6">
            <h2 className="text-sm font-bold">Recente simulaties</h2>
            <div className="mt-2 grid gap-2 text-sm">
              {simulations.map((simulation) => (
                <a
                  key={simulation.id}
                  href={`/simulations?selected=${simulation.id}`}
                  className="rounded border border-slate-200 bg-white p-3 hover:bg-slate-50"
                >
                  <div className="font-semibold">{simulation.contract.code}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {formatDate(simulation.createdAt)} · {formatHours(simulation.inputTotalHours)} · {simulation.status}
                  </div>
                </a>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Voorstel en aanpassing"
            description="Pas finale uren aan en bevestig om een PV te genereren."
          />
          {selected ? (
            <form action={updateSimulationAndGenerateReport} className="grid gap-4">
              <input type="hidden" name="simulationId" value={selected.id} />
              <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="font-bold">
                  {selected.contract.code} - {selected.contract.name}
                </div>
                <div className="mt-1 text-[var(--muted)]">
                  Input {formatHours(selected.inputTotalHours)} · status {selected.status}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] text-xs uppercase text-[var(--muted)]">
                      <th className="py-2 pr-4">Profiel</th>
                      <th className="py-2 pr-4">Target</th>
                      <th className="py-2 pr-4">Voorstel</th>
                      <th className="py-2 pr-4">Werkelijk</th>
                      <th className="py-2">Finale uren</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.lines.map((line) => {
                      const actual = actuals.find((item) => item.profileCategoryId === line.profileCategoryId)?._sum.hours ?? 0;
                      return (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-3 pr-4 font-medium">{line.profileCategory.name}</td>
                          <td className="py-3 pr-4">{formatPercent(line.targetPercentage)}</td>
                          <td className="py-3 pr-4">{formatHours(line.proposedHours)}</td>
                          <td className="py-3 pr-4">{formatHours(actual)}</td>
                          <td className="py-3">
                            <input
                              name={`line-${line.id}`}
                              type="number"
                              step="0.1"
                              defaultValue={line.finalHours}
                              className={`${inputClass} w-28`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                {selected.deliveryReport ? (
                  <a
                    href={`/reports/${selected.deliveryReport.id}`}
                    className="inline-flex items-center justify-center rounded border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                  >
                    Bestaande PV openen
                  </a>
                ) : null}
                <Button type="submit">
                  <FileCheck size={16} />
                  Bevestigen en PV genereren
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-sm text-[var(--muted)]">Maak eerst een simulatie om een voorstel te zien.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
