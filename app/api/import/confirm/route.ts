import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateImportRows, type ColumnMapping, type RawImportRow } from "@/lib/domain/import";
import { getImportReferenceData } from "@/lib/import-server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    rows?: RawImportRow[];
    mapping?: ColumnMapping;
  };

  if (!Array.isArray(body.rows) || !body.mapping) {
    return NextResponse.json({ error: "Ongeldige import payload." }, { status: 400 });
  }

  const referenceData = await getImportReferenceData();
  const validation = validateImportRows(body.rows, body.mapping, referenceData);
  const validRows = validation.rows.filter((row) => row.status === "valid" && row.normalized);

  if (validRows.length === 0) {
    return NextResponse.json({
      imported: 0,
      skipped: validation.invalidRows,
      validation,
    });
  }

  await prisma.timeEntry.createMany({
    data: validRows.map((row) => ({
      employeeId: row.normalized!.employeeId,
      contractId: row.normalized!.contractId,
      taskId: row.normalized!.taskId,
      profileCategoryId: row.normalized!.profileCategoryId,
      date: new Date(`${row.normalized!.date}T00:00:00.000Z`),
      hours: row.normalized!.hours,
      notes: row.normalized!.notes,
    })),
  });

  return NextResponse.json({
    imported: validRows.length,
    skipped: validation.invalidRows,
    validation,
  });
}
