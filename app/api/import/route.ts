import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import { parseCsv, importRowSchema } from "@/lib/domain/import";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.redirect(new URL("/time-entries?imported=0&errors=1", request.url));
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name.toLowerCase();
  let rawRows: Array<Record<string, unknown>> = [];

  if (fileName.endsWith(".xlsx")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    rawRows = XLSX.utils.sheet_to_json(firstSheet);
  } else {
    rawRows = parseCsv(buffer.toString("utf8"));
  }

  const [employees, contracts, tasks, profiles] = await Promise.all([
    prisma.employee.findMany(),
    prisma.contract.findMany(),
    prisma.task.findMany(),
    prisma.profileCategory.findMany(),
  ]);

  const employeeMap = new Map(employees.map((item) => [normalize(item.name), item]));
  const contractMap = new Map(contracts.map((item) => [normalize(item.code), item]));
  const profileMap = new Map(profiles.map((item) => [normalize(item.name), item]));
  const taskMap = new Map(tasks.map((item) => [`${item.contractId}:${normalize(item.name)}`, item]));

  let imported = 0;
  let errors = 0;

  for (const raw of rawRows) {
    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors += 1;
      continue;
    }

    const employee = employeeMap.get(normalize(parsed.data.employee));
    const contract = contractMap.get(normalize(parsed.data.contract));
    const profile = profileMap.get(normalize(parsed.data.profile));

    if (!employee || !contract || !profile) {
      errors += 1;
      continue;
    }

    const task = taskMap.get(`${contract.id}:${normalize(parsed.data.task)}`);
    if (!task || employee.profileCategoryId !== profile.id) {
      errors += 1;
      continue;
    }

    await prisma.timeEntry.create({
      data: {
        employeeId: employee.id,
        contractId: contract.id,
        taskId: task.id,
        profileCategoryId: profile.id,
        date: parsed.data.date,
        hours: parsed.data.hours,
        notes: parsed.data.notes,
      },
    });
    imported += 1;
  }

  return NextResponse.redirect(
    new URL(`/time-entries?imported=${imported}&errors=${errors}`, request.url),
  );
}
