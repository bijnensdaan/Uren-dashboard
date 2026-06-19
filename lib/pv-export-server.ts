import { prisma } from "@/lib/db";
import { buildPvDefaults, buildPvFacturatie, hoursToDays, parsePvData } from "@/lib/domain/pv";
import type { PvNarrative } from "@/lib/domain/pv-narrative";

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function displayDate(value: string) {
  if (!value) return "…";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

/**
 * Verzamelt alle gegevens die de .docx- en .xlsx-export nodig hebben voor één PV,
 * met exact dezelfde auto-fill- en berekeningslogica als de PV-pagina:
 * defaults uit contract-stamdata, periode uit de time entries, "reeds gefactureerd"
 * uit de Invoice-historiek en de facturatie deterministisch via buildPvFacturatie.
 */
export async function loadPvExportData(reportId: string) {
  const report = await prisma.deliveryReport.findUnique({
    where: { id: reportId },
    include: {
      contract: {
        include: { profileRates: true, timeEntries: { include: { employee: true } } },
      },
      simulation: {
        include: { lines: { include: { profileCategory: true }, orderBy: { targetPercentage: "asc" } } },
      },
    },
  });

  if (!report) {
    return null;
  }

  const periodAgg = await prisma.timeEntry.aggregate({
    where: { contractId: report.contractId },
    _min: { date: true },
    _max: { date: true },
  });
  const invoicedAgg = await prisma.invoice.aggregate({
    where: { contractId: report.contractId, deliveryReportId: { not: report.id } },
    _sum: { amountInclVat: true },
  });
  const alreadyInvoiced = invoicedAgg._sum.amountInclVat ?? 0;

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

  const profileHours = report.simulation.lines
    .filter((line) => line.finalHours > 0)
    .map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      finalHours: line.finalHours,
    }));

  const facturatie = buildPvFacturatie(profileHours, pvData.unitPriceByProfile, pvData.vatPercentage);

  const narrative: PvNarrative | null = report.pvNarrativeJson
    ? (JSON.parse(report.pvNarrativeJson) as PvNarrative)
    : null;

  const orderLetterSentence =
    narrative?.orderLetterSentence ||
    `Alle opdrachten zijn uitgevoerd volgens de bepalingen van de opdrachtbrief “${pvData.orderLetterTitle || "…"}”${
      pvData.orderLetterReference ? ` nr. ${pvData.orderLetterReference}` : ""
    } en in overeenstemming met de bepalingen van het bestek ${pvData.specificationCode || "…"} en de UHasselt offerte.`;
  const transmissionSentence =
    narrative?.transmissionSentence ||
    `De gepresteerde uren ter uitvoering van de bovenstaande opdrachten voor de periode ${displayDate(
      pvData.periodStart,
    )} – ${displayDate(pvData.periodEnd)} werden overgemaakt aan de DAV/FOD BOSA projectleider.`;

  const effort = profileHours.map((line) => ({
    profileName: line.profileName,
    days: hoursToDays(line.finalHours),
  }));

  return {
    report,
    pvData,
    facturatie,
    alreadyInvoiced,
    periodStartDisplay: displayDate(pvData.periodStart),
    periodEndDisplay: displayDate(pvData.periodEnd),
    dateDisplay: pvData.date ? displayDate(pvData.date) : "",
    deliverables: narrative?.deliverablesBullets ?? [],
    orderLetterSentence,
    transmissionSentence,
    effort,
    timeEntries: report.contract.timeEntries.map((entry) => ({
      employeeName: entry.employee.name,
      date: entry.date,
      hours: entry.hours,
    })),
  };
}
