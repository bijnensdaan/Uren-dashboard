import { buildPlanningWorkbook } from "@/lib/domain/planning-xlsx";
import { loadPlanData } from "@/lib/planning-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-");
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPlanData(id);
  if (!data) {
    return new Response("Plan niet gevonden", { status: 404 });
  }

  const buffer = buildPlanningWorkbook({
    contractCode: data.contract.code,
    grid: data.grid,
    phases: data.phases,
  });

  const filename = safeName(`Planning ${data.contract.code}.xlsx`);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
