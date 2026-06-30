import { FileDown, Sheet } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import {
  finalizePvInvoice,
  generateReportAiDraft,
  savePvData,
  saveReportAiDraft,
} from "@/app/actions";
import { PrintButton } from "@/components/reports/print-button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, inputClass } from "@/components/ui/form-fields";
import { PendingNotice, PendingSkeleton, SubmitButton } from "@/components/ui/pending-feedback";
import { prisma } from "@/lib/db";
import { buildPvDefaults, buildPvFacturatie, hoursToDays, parsePvData } from "@/lib/domain/pv";
import { flagUnsupportedBullets, type PvNarrative } from "@/lib/domain/pv-narrative";
import { formatDate, formatDays, formatEuro, formatHours } from "@/lib/utils";

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function fmtPeriod(value: string) {
  if (!value) return "…";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatDate(date);
}

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
      contract: {
        include: { timeEntries: { include: { task: true } }, profileRates: true },
      },
      simulation: {
        include: { lines: { include: { profileCategory: true }, orderBy: { targetPercentage: "asc" } } },
      },
      invoice: true,
    },
  });

  if (!report) {
    notFound();
  }

  // Periode automatisch uit de time entries van het contract (min/max datum).
  const periodAgg = await prisma.timeEntry.aggregate({
    where: { contractId: report.contractId },
    _min: { date: true },
    _max: { date: true },
  });

  // "Reeds gefactureerd" = som van eerdere goedgekeurde PV's van dit contract
  // (de Invoice-historiek, exclusief deze PV zelf). Automatisch, niet manueel.
  const invoicedAgg = await prisma.invoice.aggregate({
    where: { contractId: report.contractId, deliveryReportId: { not: report.id } },
    _sum: { amountInclVat: true },
  });
  const alreadyInvoiced = invoicedAgg._sum.amountInclVat ?? 0;

  const aiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const aiStatusLabel =
    {
      not_requested: "Nog niet gegenereerd",
      generating: "Wordt gegenereerd",
      draft: "Concept klaar",
      approved: "Goedgekeurd",
      failed: "Mislukt",
    }[report.aiDraftStatus] ?? report.aiDraftStatus;

  // Auto-fill: defaults uit contract-stamdata + afgeleide periode + factuurhistoriek.
  // Bij een eerdere handmatige save winnen die waarden; "reeds gefactureerd" blijft
  // altijd de live som.
  const defaults = buildPvDefaults({
    contract: report.contract,
    profileRates: report.contract.profileRates,
    periodStart: isoDate(periodAgg._min.date),
    periodEnd: isoDate(periodAgg._max.date),
    alreadyInvoiced,
  });
  const pvData = report.pvDataJson
    ? { ...parsePvData(report.pvDataJson), alreadyInvoiced }
    : defaults;
  const narrative: PvNarrative | null = report.pvNarrativeJson
    ? (JSON.parse(report.pvNarrativeJson) as PvNarrative)
    : null;

  // Profielen met uren > 0 (zoals in de bestaande PV's, waar lege profielen wegvallen).
  const profileHours = report.simulation.lines
    .filter((line) => line.finalHours > 0)
    .map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      finalHours: line.finalHours,
    }));

  const facturatie = buildPvFacturatie(profileHours, pvData.unitPriceByProfile, pvData.vatPercentage);

  // Vaste alinea's: AI-tekst indien aanwezig, anders deterministisch uit de PV-gegevens.
  const orderLetterSentence =
    narrative?.orderLetterSentence ||
    `Alle opdrachten zijn uitgevoerd volgens de bepalingen van de opdrachtbrief “${pvData.orderLetterTitle || "…"}”${
      pvData.orderLetterReference ? ` nr. ${pvData.orderLetterReference}` : ""
    } en in overeenstemming met de bepalingen van het bestek ${pvData.specificationCode || "…"} en de UHasselt offerte.`;
  const transmissionSentence =
    narrative?.transmissionSentence ||
    `De gepresteerde uren ter uitvoering van de bovenstaande opdrachten voor de periode ${fmtPeriod(
      pvData.periodStart,
    )} – ${fmtPeriod(pvData.periodEnd)} werden overgemaakt aan de DAV/FOD BOSA projectleider.`;

  // Trefwoord-overlapcheck: markeer bullets die niet in de notities voorkomen.
  const derivedNotes = [
    ...new Set(report.contract.timeEntries.map((entry) => entry.task.name)),
    ...report.contract.timeEntries.map((entry) => entry.notes?.trim()).filter(Boolean),
  ].join("\n");
  const bulletFlags = narrative
    ? flagUnsupportedBullets(narrative.deliverablesBullets, derivedNotes)
    : [];
  const hasUnsupported = bulletFlags.some(Boolean);

  return (
    <div className="grid gap-5">
      <div className="no-print flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">PV / Rapport</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Proces-verbaal van oplevering in de structuur van de bestaande PV&apos;s.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/reports/${report.id}/pv-docx`}
            className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            <FileDown size={16} /> PV (Word)
          </a>
          <a
            href={`/api/reports/${report.id}/uren-xlsx`}
            className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold hover:bg-slate-50"
          >
            <Sheet size={16} /> Uren (Excel)
          </a>
          <PrintButton />
        </div>
      </div>

      {/* PV-gegevens — bedragen en namen komen van de gebruiker, niet van AI. */}
      <Card className="no-print">
        <CardHeader
          title="PV-gegevens"
          description="Vul de cijfers en namen in die de PV nodig heeft. Alle euro-bedragen worden hieruit deterministisch berekend (uren × eenheidsprijs, btw, totalen)."
        />
        <form action={savePvData} className="grid gap-4">
          <input type="hidden" name="reportId" value={report.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Periode van">
              <input type="date" name="periodStart" defaultValue={pvData.periodStart} className={inputClass} />
            </Field>
            <Field label="Periode tot">
              <input type="date" name="periodEnd" defaultValue={pvData.periodEnd} className={inputClass} />
            </Field>
            <Field label="Datum PV">
              <input type="date" name="date" defaultValue={pvData.date} className={inputClass} />
            </Field>
            <Field label="Btw %">
              <input type="number" step="0.1" name="vatPercentage" defaultValue={pvData.vatPercentage} className={inputClass} />
            </Field>
            <Field label="Reeds gefactureerd (€ incl. btw)">
              <input
                type="number"
                step="0.01"
                value={pvData.alreadyInvoiced}
                readOnly
                className={`${inputClass} bg-slate-100 text-[var(--muted)]`}
              />
              <span className="text-xs font-normal text-[var(--muted)]">
                Automatisch uit de factuurhistoriek van dit contract.
              </span>
            </Field>
            <Field label="Totaalbudget (€)">
              <input type="number" step="0.01" name="totalBudgetAmount" defaultValue={pvData.totalBudgetAmount} className={inputClass} />
            </Field>
            <Field label="Bestekcode">
              <input type="text" name="specificationCode" defaultValue={pvData.specificationCode} className={inputClass} />
            </Field>
            <Field label="Opdrachtbrief-titel">
              <input type="text" name="orderLetterTitle" defaultValue={pvData.orderLetterTitle} className={inputClass} />
            </Field>
            <Field label="Opdrachtbrief-referentie (UW REFERENTIE in PV)">
              <input type="text" name="orderLetterReference" defaultValue={pvData.orderLetterReference} className={inputClass} />
            </Field>
            <Field label="FEDCOM Bestelbonnummer">
              <input type="text" name="bestelbon" defaultValue={pvData.bestelbon} className={inputClass} placeholder="bijv. 4501132577-749549/origineel" />
            </Field>
            <Field label="Financiële dienst e-mail">
              <input type="text" name="financieleEmail" defaultValue={pvData.financieleEmail} className={inputClass} />
            </Field>
          </div>

          <div>
            <div className="text-sm font-semibold">Eenheidsprijs per profiel (excl. btw, per uur)</div>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {report.simulation.lines.map((line) => (
                <Field key={line.id} label={line.profileCategory.name}>
                  <input
                    type="number"
                    step="0.01"
                    name={`unit-${line.profileCategoryId}`}
                    defaultValue={pvData.unitPriceByProfile[line.profileCategoryId] ?? ""}
                    className={inputClass}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Domeinmanager — naam">
              <input type="text" name="domainManagerName" defaultValue={pvData.domainManagerName} className={inputClass} />
            </Field>
            <Field label="Domeinmanager — functie">
              <input type="text" name="domainManagerRole" defaultValue={pvData.domainManagerRole} className={inputClass} />
            </Field>
            <Field label="Projectleider(s) — namen">
              <input type="text" name="projectLeadNames" defaultValue={pvData.projectLeadNames} className={inputClass} />
            </Field>
            <Field label="Organisatie (handtekeningblok)">
              <input type="text" name="domainManagerOrg" defaultValue={pvData.domainManagerOrg.replace(/\n/g, " — ")} className={inputClass} />
            </Field>
          </div>
          <div className="flex justify-end">
            <SubmitButton type="submit" variant="secondary" pendingLabel="PV-gegevens opslaan...">
              PV-gegevens opslaan
            </SubmitButton>
          </div>
          <PendingNotice text="PV-gegevens worden opgeslagen..." />
        </form>
      </Card>

      {/* AI document assistant — nu via Gemini. */}
      <Card className="no-print">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">AI document assistant (Gemini)</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Genereert enkel de tekst voor &quot;Ter realisatie van&quot; en de twee vaste alinea&apos;s. Uren, dagen en bedragen blijven uit de domeinlogica komen.
            </p>
          </div>
          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold">
            {aiStatusLabel}
          </span>
        </div>

        {!aiConfigured ? (
          <p className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Voeg `GEMINI_API_KEY` toe aan je environment (.env) om AI-tekst te genereren.
          </p>
        ) : null}

        <form action={generateReportAiDraft} className="mt-4 grid gap-2">
          <input type="hidden" name="reportId" value={report.id} />
          <Field label="Taken / deliverables / notities (basis voor de tekst — leeg = afgeleid uit time entries)">
            <textarea
              name="taskNotes"
              rows={3}
              className={`${inputClass} h-auto py-2`}
              placeholder="Plak of som de opgeleverde rapporten en taken op, één per lijn…"
            />
          </Field>
          <div>
            <SubmitButton
              type="submit"
              variant="secondary"
              disabled={!aiConfigured}
              pendingLabel="AI-concept genereren..."
            >
              AI-concept genereren
            </SubmitButton>
          </div>
          <PendingSkeleton
            title="AI-concept wordt gegenereerd"
            description="Gemini maakt de PV-tekst op basis van taken, deliverables en notities."
            lines={4}
          />
        </form>

        {report.aiDraftStatus === "failed" && report.aiDraftText ? (
          <p className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {report.aiDraftText}
          </p>
        ) : null}

        {narrative ? (
          <form action={saveReportAiDraft} className="mt-4 grid gap-3 border-t border-[var(--border)] pt-4">
            <input type="hidden" name="reportId" value={report.id} />
            {hasUnsupported ? (
              <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Sommige opgesomde items komen niet voor in de aangeleverde notities — controleer ze voor je goedkeurt.
              </p>
            ) : null}
            <Field label="Ter realisatie van (één item per lijn)">
              <textarea
                name="deliverablesBullets"
                defaultValue={narrative.deliverablesBullets.join("\n")}
                className="min-h-48 rounded border border-[var(--border)] bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-teal-100"
              />
            </Field>
            <Field label="Vaste alinea — opdrachtbrief/bestek">
              <textarea
                name="orderLetterSentence"
                defaultValue={narrative.orderLetterSentence}
                className="min-h-20 rounded border border-[var(--border)] bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-teal-100"
              />
            </Field>
            <Field label="Vaste alinea — overdracht gepresteerde uren">
              <textarea
                name="transmissionSentence"
                defaultValue={narrative.transmissionSentence}
                className="min-h-20 rounded border border-[var(--border)] bg-white p-3 text-sm leading-6 outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-teal-100"
              />
            </Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[var(--muted)]">
                Model: {report.aiModel ?? "n.v.t."}
                {report.aiGeneratedAt ? ` · gegenereerd op ${formatDate(report.aiGeneratedAt)}` : ""}
              </p>
              <SubmitButton type="submit" pendingLabel="Concept goedkeuren...">
                Concept goedkeuren voor PV
              </SubmitButton>
            </div>
            <PendingNotice text="Concept wordt bewaard..." />
          </form>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted)]">
            Nog geen AI-concept. Genereer eerst een concept en keur het daarna pas goed voor de printbare PV.
          </p>
        )}
      </Card>

      {/* Vastleggen & factureren: maakt een Invoice zodat deze PV automatisch
          meetelt in "reeds gefactureerd" bij de volgende PV van dit contract. */}
      <Card className="no-print">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Vastleggen &amp; factureren</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {report.invoice
                ? `Vastgelegd op ${formatDate(report.invoice.createdAt)} · ${formatEuro(report.invoice.amountInclVat)} incl. btw. Telt automatisch mee in "reeds gefactureerd" bij volgende PV's.`
                : "Leg dit PV-bedrag vast in de factuurhistoriek zodat het automatisch in 'reeds gefactureerd' verschijnt bij de volgende PV van dit contract."}
            </p>
          </div>
          <form action={finalizePvInvoice}>
            <input type="hidden" name="reportId" value={report.id} />
            <SubmitButton
              type="submit"
              variant={report.invoice ? "secondary" : "primary"}
              pendingLabel={report.invoice ? "Bedrag bijwerken..." : "PV vastleggen..."}
            >
              {report.invoice ? "Bedrag bijwerken" : "PV vastleggen en factureren"}
            </SubmitButton>
            <PendingNotice text="Factuurhistoriek wordt bijgewerkt..." />
          </form>
        </div>
      </Card>

      {/* Printbare PV in de structuur van de bestaande bestanden in docs/. */}
      <Card className="mx-auto w-full max-w-4xl p-8 text-sm leading-6 text-slate-900 print:border-0 print:shadow-none">
        <div className="border-b border-slate-200 pb-4 text-xs text-[var(--muted)]">
          <div>
            <span className="font-semibold uppercase">Onderwerp/betreft</span> · Proces-verbaal van tussentijdse oplevering van geleverde prestaties gedurende de periode {fmtPeriod(pvData.periodStart)} – {fmtPeriod(pvData.periodEnd)} in het kader van {report.contract.code} “{report.contract.name}”.
          </div>
          {pvData.orderLetterReference ? (
            <div className="mt-1">
              <span className="font-semibold uppercase">Uw referentie</span> · {pvData.orderLetterReference}
            </div>
          ) : null}
        </div>

        <h2 className="mt-6 text-base font-bold">Opgeleverde diensten en uitgevoerde taken:</h2>

        <div className="mt-4">
          <div className="font-semibold">Inzet van:</div>
          <ul className="mt-1 list-disc pl-6">
            {profileHours.map((profile) => (
              <li key={profile.profileCategoryId}>
                {profile.profileName}: {formatDays(hoursToDays(profile.finalHours))} persoondagen
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4">
          <div className="font-semibold">Ter realisatie van:</div>
          {narrative && narrative.deliverablesBullets.length > 0 ? (
            <ul className="mt-1 list-disc pl-6">
              {narrative.deliverablesBullets.map((bullet, index) => (
                <li key={index}>{bullet}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 italic text-[var(--muted)]">
              Nog geen deliverables — genereer en keur eerst een AI-concept goed.
            </p>
          )}
        </div>

        <p className="mt-4">{orderLetterSentence}</p>
        <p className="mt-2">{transmissionSentence}</p>

        <h3 className="mt-8 text-base font-bold">Facturatie:</h3>
        <div className="mt-1 text-[var(--muted)]">
          Te factureren periode {fmtPeriod(pvData.periodStart)} – {fmtPeriod(pvData.periodEnd)}
        </div>
        <table className="mt-3 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-400 uppercase text-[var(--muted)]">
              <th className="py-2 pr-3">Profiel</th>
              <th className="py-2 pr-3 text-right">Eenheidsprijs (excl. btw)</th>
              <th className="py-2 pr-3 text-right">Uren</th>
              <th className="py-2 pr-3 text-right">Dagen</th>
              <th className="py-2 pr-3 text-right">Prijs</th>
              <th className="py-2 pr-3 text-right">Btw</th>
              <th className="py-2 text-right">Totaal prijs (incl. btw)</th>
            </tr>
          </thead>
          <tbody>
            {facturatie.lines.map((line) => (
              <tr key={line.profileCategoryId} className="border-b border-slate-100">
                <td className="py-2 pr-3 font-medium">{line.profileName}</td>
                <td className="py-2 pr-3 text-right">{formatEuro(line.unitPrice, 2)}</td>
                <td className="py-2 pr-3 text-right">{formatHours(line.hours)}</td>
                <td className="py-2 pr-3 text-right">{formatDays(line.days)}</td>
                <td className="py-2 pr-3 text-right">{formatEuro(line.amountExclVat)}</td>
                <td className="py-2 pr-3 text-right">{formatEuro(line.vatAmount)}</td>
                <td className="py-2 text-right">{formatEuro(line.amountInclVat)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-400 font-bold">
              <td className="py-2 pr-3">Totalen</td>
              <td className="py-2 pr-3" />
              <td className="py-2 pr-3 text-right">{formatHours(facturatie.totals.hours)}</td>
              <td className="py-2 pr-3 text-right">{formatDays(facturatie.totals.days)}</td>
              <td className="py-2 pr-3 text-right">{formatEuro(facturatie.totals.amountExclVat)}</td>
              <td className="py-2 pr-3 text-right">{formatEuro(facturatie.totals.vatAmount)}</td>
              <td className="py-2 text-right">{formatEuro(facturatie.totals.amountInclVat)}</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-5 grid gap-1">
          <div>
            Reeds gefactureerd: <strong>{formatEuro(pvData.alreadyInvoiced)}</strong>
          </div>
          <div>
            van het beschikbare totaalbudget van:{" "}
            <strong>{formatEuro(pvData.totalBudgetAmount, 2)}</strong>
          </div>
          <div className="font-bold">
            Totaal te factureren bedrag voor huidig proces-verbaal (incl. btw):{" "}
            {formatEuro(facturatie.totals.amountInclVat)}
          </div>
        </div>

        <div className="mt-6">Datum: {pvData.date ? fmtPeriod(pvData.date) : "…"}</div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div className="border-t border-slate-300 pt-3">
            <div className="font-semibold">{pvData.domainManagerName || "…"}</div>
            <div className="text-[var(--muted)]">{pvData.domainManagerRole}</div>
            {pvData.domainManagerOrg.split("\n").map((line, index) => (
              <div key={index} className="text-[var(--muted)]">{line}</div>
            ))}
          </div>
          <div className="border-t border-slate-300 pt-3">
            <div className="font-semibold">{pvData.projectLeadNames || "…"}</div>
            <div className="text-[var(--muted)]">Projectleider(s)</div>
            {pvData.projectLeadOrg.split("\n").map((line, index) => (
              <div key={index} className="text-[var(--muted)]">{line}</div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
