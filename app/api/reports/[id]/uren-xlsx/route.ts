import { buildUrenWorkbook } from "@/lib/domain/pv-xlsx";
import { loadPvExportData } from "@/lib/pv-export-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPvExportData(id);
  if (!data) {
    return new Response("Rapport niet gevonden", { status: 404 });
  }

  const buffer = buildUrenWorkbook({
    contractCode: data.report.contract.code,
    periodStart: data.periodStartDisplay,
    periodEnd: data.periodEndDisplay,
    timeEntries: data.timeEntries,
    facturatie: data.facturatie,
    vatPercentage: data.pvData.vatPercentage,
    alreadyInvoiced: data.alreadyInvoiced,
    totalBudgetAmount: data.pvData.totalBudgetAmount,
  });

  const filename = safeName(
    `Gepresteerde uren ${data.report.contract.code} ${data.periodStartDisplay} - ${data.periodEndDisplay}.xlsx`,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
