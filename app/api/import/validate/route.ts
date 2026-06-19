import { NextResponse } from "next/server";
import { validateImportRows, type ColumnMapping, type RawImportRow } from "@/lib/domain/import";
import { getImportReferenceData } from "@/lib/import-server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    rows?: RawImportRow[];
    mapping?: ColumnMapping;
  };

  if (!Array.isArray(body.rows) || !body.mapping) {
    return NextResponse.json({ error: "Ongeldige import-preview payload." }, { status: 400 });
  }

  const referenceData = await getImportReferenceData();
  const validation = validateImportRows(body.rows, body.mapping, referenceData);

  return NextResponse.json({ validation });
}
