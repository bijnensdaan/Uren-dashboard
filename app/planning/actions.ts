"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import type { Phase } from "@/lib/domain/planning";
import { normalizePhases, suggestProjectPhases } from "@/lib/domain/planning-suggestion";
import { buildDefaultAssignments, type PlanAssignment } from "@/lib/planning-server";
import { documentToGeminiInput, fileToGeminiInput } from "@/lib/documents-server";

const MAX_UPLOAD_BYTES = 18 * 1024 * 1024;

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function suggestProjectPlan(formData: FormData) {
  const contractId = String(formData.get("contractId") ?? "");
  const documentId = String(formData.get("documentId") ?? "").trim();
  const file = formData.get("file");

  let redirectTo: string;
  try {
    if (!contractId) {
      throw new Error("Kies eerst een contract.");
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        allocationTemplates: { include: { profileCategory: true } },
        tasks: { where: { active: true } },
      },
    });
    if (!contract) {
      throw new Error("Contract niet gevonden.");
    }

    const profileIds = contract.allocationTemplates
      .filter((line) => line.targetPercentage > 0)
      .map((line) => line.profileCategoryId);
    const employees = await prisma.employee.findMany({
      where: { active: true, profileCategoryId: { in: profileIds } },
      orderBy: { name: "asc" },
    });

    let filePart: { mimeType: string; dataBase64: string } | undefined;
    let sourceText: string | undefined;

    if (documentId) {
      // Gebruik een opgeslagen document uit de bibliotheek
      const result = await documentToGeminiInput(documentId);
      filePart = result.filePart;
      sourceText = result.sourceText;
    } else if (file instanceof File && file.size > 0) {
      // Gebruik een vers geüpload bestand
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("Bestand is te groot (max 18 MB).");
      }
      const result = await fileToGeminiInput(file);
      filePart = result.filePart;
      sourceText = result.sourceText;
    }
    // Als geen van beide: doorgaan zonder document (bestaand gedrag)

    const { model, phases, overallRationale } = await suggestProjectPhases({
      contractCode: contract.code,
      contractName: contract.name,
      startDate: isoDate(contract.startDate),
      endDate: isoDate(contract.endDate),
      knownTasks: contract.tasks.map((task) => task.name),
      file: filePart,
      sourceText,
    });

    const record = await prisma.projectPlan.create({
      data: {
        contractId,
        status: "concept",
        model,
        totalHours: contract.totalBudgetHours,
        phasesJson: JSON.stringify({ phases, overallRationale }),
        assignmentsJson: JSON.stringify(buildDefaultAssignments(employees.map((e) => e.id))),
      },
    });

    redirectTo = `/planning?plan=${record.id}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fasering genereren is mislukt.";
    redirectTo = `/planning?planError=${encodeURIComponent(message)}`;
  }

  revalidatePath("/planning");
  redirect(redirectTo);
}

export async function savePlanPhases(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const plan = await prisma.projectPlan.findUnique({
    where: { id: planId },
    include: { contract: true },
  });
  if (!plan) {
    throw new Error("Plan niet gevonden.");
  }

  const names = formData.getAll("phaseName").map(String);
  const starts = formData.getAll("phaseStart").map(String);
  const ends = formData.getAll("phaseEnd").map(String);
  const weights = formData.getAll("phaseWeight").map((value) => Number(value));

  const existing = JSON.parse(plan.phasesJson) as { phases: Phase[]; overallRationale: string };
  const phases: Phase[] = names.map((name, index) => ({
    name,
    startDate: starts[index] ?? "",
    endDate: ends[index] ?? "",
    weightPercentage: weights[index] || 0,
    relatedTasks: existing.phases[index]?.relatedTasks ?? [],
    rationale: existing.phases[index]?.rationale ?? "",
  }));

  const normalized = normalizePhases(phases, isoDate(plan.contract.startDate), isoDate(plan.contract.endDate));

  await prisma.projectPlan.update({
    where: { id: planId },
    data: { phasesJson: JSON.stringify({ phases: normalized, overallRationale: existing.overallRationale ?? "" }) },
  });

  revalidatePath("/planning");
  redirect(`/planning?plan=${planId}`);
}

export async function savePlanAssignments(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const employeeIds = formData.getAll("employeeId").map(String);

  const assignments: PlanAssignment[] = employeeIds.map((employeeId) => {
    const capacityRaw = formData.get(`capacity-${employeeId}`);
    const capacity = typeof capacityRaw === "string" && capacityRaw !== "" ? Number(capacityRaw) : null;
    return {
      employeeId,
      included: formData.get(`included-${employeeId}`) === "on",
      weight: Number(formData.get(`weight-${employeeId}`)) || 0,
      capacityOverride: capacity !== null && Number.isFinite(capacity) ? capacity : null,
    };
  });

  await prisma.projectPlan.update({
    where: { id: planId },
    data: { assignmentsJson: JSON.stringify({ employees: assignments }) },
  });

  revalidatePath("/planning");
  redirect(`/planning?plan=${planId}`);
}

export async function approveProjectPlan(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  await prisma.projectPlan.update({
    where: { id: planId },
    data: { status: "approved", approvedAt: new Date() },
  });
  revalidatePath("/planning");
  redirect(`/planning?plan=${planId}`);
}
