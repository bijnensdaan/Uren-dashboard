import { notFound, redirect } from "next/navigation";
import { generateReportAiDraft, saveReportAiDraft } from "@/app/actions";
import { PrintButton } from "@/components/reports/print-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { prisma } from "@/lib/db";
import { formatDate, formatHours } from "@/lib/utils";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id === "demo") {
    const latest = await prisma.deliveryReport.findFirst({ orderBy: { generatedAt: "desc" } });
    if (latest) {
      redirect(`/reports/${latest.id}`);
    }
  }

  const report = await prisma.deliveryReport.findUnique({
    where: { id },
    include: {
      contract: true,
      simulation: {
        include: { lines: { include: { profileCategory: true }, orderBy: { targetPercentage: "asc" } } },
      },
    },
  });

  if (!report) {
    notFound();
  }

  const aiConfigured = Boolean(process.env.OPENAI_API_KEY);
  const aiStatusLabel =
    {
      not_requested: "Nog niet gegenereerd",
      generating: "Wordt gegenereerd",
      draft: "Concept klaar",
      approved: "Goedgekeurd",
      failed: "Mislukt",
    }[report.aiDraftStatus] ?? report.aiDraftStatus;

  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">PV / Rapport</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Printvriendelijke opleveringsnota voor simulatie.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form action={generateReportAiDraft}>
            <input type="hidden" name="reportId" value={report.id} />
            <Button type="submit" variant="secondary" disabled={!aiConfigured}>
              AI concept genereren
            </Button>
          </form>
          <PrintButton />
        </div>
      </div>

      <Card className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">AI document assistant</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Genereert enkel concepttekst. Budgetten, uren en afwijkingen blijven uit de bestaande domeinlogica komen.
            </p>
          </div>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold">
            {aiStatusLabel}
          </span>
        </div>

        {!aiConfigured ? (
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Voeg `OPENAI_API_KEY` toe aan je environment om AI-concepten te genereren.
          </p>
        ) : null}

        {report.aiDraftStatus === "failed" && report.aiDraftText ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {report.aiDraftText}
          </p>
        ) : report.aiDraftText ? (
          <form action={saveReportAiDraft} className="mt-4 grid gap-3">
            <input type="hidden" name="reportId" value={report.id} />
            <textarea
              name="aiDraftText"
              defaultValue={report.aiDraftText}
              className="min-h-72 rounded border border-[var(--border)] bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-teal-100"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--muted)]">
                Model: {report.aiModel ?? "n.v.t."}
                {report.aiGeneratedAt ? ` · gegenereerd op ${formatDate(report.aiGeneratedAt)}` : ""}
              </p>
              <Button type="submit">Concept goedkeuren voor PV</Button>
            </div>
          </form>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Nog geen AI-concept. Genereer eerst een concept en keur het daarna pas goed voor de printbare PV.
          </p>
        )}
      </Card>

      <Card className="mx-auto w-full max-w-4xl p-8 print:border-0 print:shadow-none">
        <div className="border-b border-slate-200 pb-5">
          <div className="text-sm font-semibold text-[var(--primary)]">PV van oplevering</div>
          <h2 className="mt-2 text-3xl font-bold text-slate-950">{report.contract.name}</h2>
          <div className="mt-2 text-sm text-[var(--muted)]">
            {report.contract.code} · gegenereerd op {formatDate(report.generatedAt)}
          </div>
        </div>

        <div className="grid gap-4 border-b border-slate-200 py-5 md:grid-cols-3">
          <div>
            <div className="text-xs uppercase text-[var(--muted)]">Totaal voorziene uren</div>
            <div className="mt-1 text-xl font-bold">{formatHours(report.simulation.inputTotalHours)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-[var(--muted)]">Status</div>
            <div className="mt-1 text-xl font-bold">{report.simulation.status}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-[var(--muted)]">Bron</div>
            <div className="mt-1 text-xl font-bold">{report.simulation.sourceType}</div>
          </div>
        </div>

        <div className="py-5">
          <h3 className="text-lg font-bold">Finale verdeling per profiel</h3>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-xs uppercase text-[var(--muted)]">
                <th className="py-2 pr-4">Profiel</th>
                <th className="py-2 pr-4">Target</th>
                <th className="py-2 pr-4">Voorstel</th>
                <th className="py-2">Finale uren</th>
              </tr>
            </thead>
            <tbody>
              {report.simulation.lines.map((line) => (
                <tr key={line.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 font-medium">{line.profileCategory.name}</td>
                  <td className="py-3 pr-4">{line.targetPercentage}%</td>
                  <td className="py-3 pr-4">{formatHours(line.proposedHours)}</td>
                  <td className="py-3">{formatHours(line.finalHours)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {report.aiDraftStatus === "approved" && report.aiDraftText ? (
          <div className="border-t border-slate-200 py-5">
            <h3 className="text-lg font-bold">AI-ondersteunde toelichting</h3>
            <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-6 text-slate-800">
              {report.aiDraftText}
            </pre>
          </div>
        ) : null}

        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <div className="border-t border-slate-300 pt-3 text-sm text-[var(--muted)]">Voor akkoord projectverantwoordelijke</div>
          <div className="border-t border-slate-300 pt-3 text-sm text-[var(--muted)]">Voor akkoord opdrachtgever</div>
        </div>
      </Card>
    </div>
  );
}
