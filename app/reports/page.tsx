import { FileText, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/utils";

const euro = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

export default async function ReportsOverviewPage() {
  const reports = await prisma.deliveryReport.findMany({
    include: {
      contract: true,
      invoice: true,
    },
    orderBy: { generatedAt: "desc" },
  });

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">PV&apos;s van oplevering</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Overzicht van alle gegenereerde processen-verbaal. Klik op een PV om de gegevens te
          controleren, de tekst te verfijnen, te factureren of te exporteren naar Word/Excel.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Gegenereerde PV's"
          description="Een PV maak je aan vanaf een simulatie. Hier vind je ze allemaal terug."
        />

        {reports.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded border border-dashed border-slate-200 bg-slate-50/60 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-[var(--primary)]">
              <FileText size={22} />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-950">Nog geen PV&apos;s</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-[var(--muted)]">
                Ga naar de pagina <span className="font-semibold">Simulatie</span>, maak een
                urenvoorstel en genereer daar een PV. Het verschijnt daarna hier in het overzicht.
              </p>
            </div>
            <a
              href="/simulations"
              className="inline-flex items-center gap-2 rounded bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-strong)]"
            >
              <FlaskConical size={16} />
              Naar Simulatie
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-300 text-xs uppercase text-[var(--muted)]">
                  <th className="py-2 pr-4">Contract</th>
                  <th className="py-2 pr-4">Gegenereerd op</th>
                  <th className="py-2 pr-4">Gefactureerd</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4" />
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-4">
                      <div className="font-semibold text-slate-950">{report.contract.code}</div>
                      <div className="text-xs text-[var(--muted)]">{report.contract.name}</div>
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">{formatDate(report.generatedAt)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      {report.invoice ? euro.format(report.invoice.amountInclVat) : "-"}
                    </td>
                    <td className="py-3 pr-4">
                      {report.invoice ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800">
                          Gefactureerd
                        </Badge>
                      ) : (
                        <Badge className="border-amber-200 bg-amber-50 text-amber-800">Concept</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <a
                        href={`/reports/${report.id}`}
                        className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-semibold hover:bg-slate-50"
                      >
                        <FileText size={15} /> PV openen
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
