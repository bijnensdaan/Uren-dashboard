import { NextResponse } from "next/server";
import { inferColumnMapping, validateImportRows } from "@/lib/domain/import";
import { getImportReferenceData, parseImportFile } from "@/lib/import-server";

const MAX_PREVIEW_ROWS = 1000;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Geen bestand ontvangen." }, { status: 400 });
  }

  const parsed = await parseImportFile(file);
  if (parsed.rows.length > MAX_PREVIEW_ROWS) {
    return NextResponse.json(
      { error: `Import bevat ${parsed.rows.length} rijen. Maximaal ${MAX_PREVIEW_ROWS} rijen per import.` },
      { status: 400 },
    );
  }

  const mapping = inferColumnMapping(parsed.columns);
  const referenceData = await getImportReferenceData();
  const validation = validateImportRows(parsed.rows, mapping, referenceData);

  return NextResponse.json({
    fileName: file.name,
    columns: parsed.columns,
    rows: parsed.rows,
    mapping,
    validation,
  });
}
