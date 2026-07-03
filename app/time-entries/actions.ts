"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatHours } from "@/lib/utils";

/** Ververst alle pagina's die geregistreerde uren tonen. */
function revalidateTimeEntryViews(contractId?: string) {
  revalidatePath("/");
  revalidatePath("/time-entries");
  if (contractId) {
    revalidatePath(`/contracts/${contractId}`);
  }
}

function redirectWithError(message: string): never {
  redirect(`/time-entries?entryError=${encodeURIComponent(message)}`);
}

/**
 * Handmatige urenregistratie. Valideert de invoer met Nederlandse
 * foutmeldingen en toont feedback via query-params op de urenpagina.
 * Het profiel wordt automatisch overgenomen van de gekozen medewerker.
 */
export async function createManualTimeEntry(formData: FormData) {
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const contractId = String(formData.get("contractId") ?? "").trim();
  const taskId = String(formData.get("taskId") ?? "").trim();
  const rawDate = String(formData.get("date") ?? "").trim();
  const rawHours = String(formData.get("hours") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!employeeId) redirectWithError("Kies een medewerker.");
  if (!contractId) redirectWithError("Kies een opdrachtbrief.");
  if (!taskId) redirectWithError("Kies een taak.");

  const date = new Date(`${rawDate}T00:00:00`);
  if (!rawDate || Number.isNaN(date.getTime())) {
    redirectWithError("Vul een geldige datum in.");
  }

  const hours = Number(rawHours.replace(",", "."));
  if (!rawHours || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    redirectWithError("Vul een geldig aantal uren in: groter dan 0 en maximaal 24.");
  }

  const [employee, task] = await Promise.all([
    prisma.employee.findUnique({ where: { id: employeeId } }),
    prisma.task.findFirst({ where: { id: taskId, contractId } }),
  ]);

  if (!employee) {
    redirectWithError("Medewerker niet gevonden.");
  }
  if (!task) {
    redirectWithError("De gekozen taak hoort niet bij de gekozen opdrachtbrief.");
  }

  await prisma.timeEntry.create({
    data: {
      employeeId,
      contractId,
      taskId,
      date,
      hours,
      notes: notes || null,
      // Profiel volgt altijd de medewerker; geen aparte keuze in het formulier.
      profileCategoryId: employee.profileCategoryId,
    },
  });

  revalidateTimeEntryViews(contractId);
  redirect(
    `/time-entries?entrySuccess=${encodeURIComponent(
      `${formatHours(hours)} geregistreerd voor ${employee.name}.`,
    )}`,
  );
}

/** Verwijdert een registratie vanuit de tabel op de urenpagina. */
export async function deleteTimeEntryFromOverview(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const contractId = String(formData.get("contractId") ?? "");

  if (!id) {
    redirectWithError("Geen registratie gekozen om te verwijderen.");
  }

  const existing = await prisma.timeEntry.findUnique({ where: { id } });
  if (!existing) {
    redirectWithError("Registratie niet gevonden; mogelijk is die al verwijderd.");
  }

  await prisma.timeEntry.delete({ where: { id } });

  revalidateTimeEntryViews(contractId || existing.contractId);
  redirect(`/time-entries?entrySuccess=${encodeURIComponent("Registratie verwijderd.")}`);
}
