import { buildPvDocx } from "@/lib/domain/pv-docx";
import { loadPvExportData } from "@/lib/pv-export-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/[^\x20-\x7E]/g, "-");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPvExportData(id);
  if (!data) {
    return new Response("Rapport niet gevonden", { status: 404 });
  }

  const buffer = await buildPvDocx({
    contractCode: data.report.contract.code,
    contractName: data.report.contract.name,
    periodStart: data.periodStartDisplay,
    periodEnd: data.periodEndDisplay,
    orderLetterReference: data.pvData.orderLetterReference,
    bestelbon: data.pvData.bestelbon,
    financieleEmail: data.pvData.financieleEmail,
    effort: data.effort,
    deliverables: data.deliverables,
    orderLetterSentence: data.orderLetterSentence,
    transmissionSentence: data.transmissionSentence,
    facturatie: data.facturatie,
    alreadyInvoiced: data.alreadyInvoiced,
    totalBudgetAmount: data.pvData.totalBudgetAmount,
    date: data.dateDisplay,
    domainManagerName: data.pvData.domainManagerName,
    domainManagerRole: data.pvData.domainManagerRole,
    domainManagerOrg: data.pvData.domainManagerOrg,
    projectLeadNames: data.pvData.projectLeadNames,
    projectLeadRole: "Projectleider(s)",
    projectLeadOrg: data.pvData.projectLeadOrg,
  });

  const filename = safeName(
    `PV van oplevering ${data.report.contract.code} ${data.periodStartDisplay} - ${data.periodEndDisplay}.docx`,
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
