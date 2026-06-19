"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { buildDeliveryReportHtml } from "@/lib/domain/report";
import { createSimulationProposal } from "@/lib/domain/simulation";
import { simulationFormSchema, timeEntryFormSchema } from "@/lib/validators";

export async function createTimeEntry(formData: FormData) {
  const parsed = timeEntryFormSchema.parse({
    employeeId: formData.get("employeeId"),
    contractId: formData.get("contractId"),
    taskId: formData.get("taskId"),
    profileCategoryId: formData.get("profileCategoryId"),
    date: formData.get("date"),
    hours: formData.get("hours"),
    notes: formData.get("notes"),
  });

  const task = await prisma.task.findFirst({
    where: { id: parsed.taskId, contractId: parsed.contractId },
  });

  if (!task) {
    throw new Error("Taak hoort niet bij het gekozen contract.");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: parsed.employeeId },
  });

  if (!employee) {
    throw new Error("Medewerker niet gevonden.");
  }

  await prisma.timeEntry.create({
    data: {
      ...parsed,
      profileCategoryId: employee.profileCategoryId,
    },
  });
  revalidatePath("/");
  revalidatePath("/time-entries");
  revalidatePath(`/contracts/${parsed.contractId}`);
}

export async function deleteTimeEntry(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const contractId = String(formData.get("contractId") ?? "");

  await prisma.timeEntry.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/time-entries");
  if (contractId) {
    revalidatePath(`/contracts/${contractId}`);
  }
}

export async function createSimulation(formData: FormData) {
  const parsed = simulationFormSchema.parse({
    contractId: formData.get("contractId"),
    inputTotalHours: formData.get("inputTotalHours"),
  });

  const allocations = await prisma.contractAllocationTemplate.findMany({
    where: { contractId: parsed.contractId },
    include: { profileCategory: true },
    orderBy: { targetPercentage: "asc" },
  });

  const proposal = createSimulationProposal(
    parsed.inputTotalHours,
    allocations.map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      targetPercentage: line.targetPercentage,
    })),
  );

  const simulation = await prisma.simulation.create({
    data: {
      contractId: parsed.contractId,
      inputTotalHours: parsed.inputTotalHours,
      sourceType: "manual",
      status: "draft",
      lines: {
        create: proposal.map((line) => ({
          profileCategoryId: line.profileCategoryId,
          proposedHours: line.proposedHours,
          finalHours: line.finalHours,
          targetPercentage: line.targetPercentage,
        })),
      },
    },
  });

  revalidatePath("/simulations");
  redirect(`/simulations?selected=${simulation.id}`);
}

export async function updateSimulationAndGenerateReport(formData: FormData) {
  const simulationId = String(formData.get("simulationId") ?? "");
  const simulation = await prisma.simulation.findUnique({
    where: { id: simulationId },
    include: {
      contract: true,
      lines: { include: { profileCategory: true } },
    },
  });

  if (!simulation) {
    throw new Error("Simulatie niet gevonden.");
  }

  for (const line of simulation.lines) {
    const finalHours = Number(formData.get(`line-${line.id}`) ?? line.finalHours);
    await prisma.simulationLine.update({
      where: { id: line.id },
      data: {
        adjustedHours: finalHours,
        finalHours,
      },
    });
  }

  const updated = await prisma.simulation.update({
    where: { id: simulation.id },
    data: { status: "approved" },
    include: {
      contract: true,
      lines: { include: { profileCategory: true } },
    },
  });

  const htmlContent = buildDeliveryReportHtml({
    contractCode: updated.contract.code,
    contractName: updated.contract.name,
    generatedAt: new Date(),
    inputTotalHours: updated.inputTotalHours,
    lines: updated.lines.map((line) => ({
      profileName: line.profileCategory.name,
      targetPercentage: line.targetPercentage,
      finalHours: line.finalHours,
    })),
  });

  const report = await prisma.deliveryReport.upsert({
    where: { simulationId: updated.id },
    create: {
      simulationId: updated.id,
      contractId: updated.contractId,
      htmlContent,
    },
    update: {
      generatedAt: new Date(),
      htmlContent,
    },
  });

  revalidatePath("/simulations");
  revalidatePath(`/reports/${report.id}`);
  redirect(`/reports/${report.id}`);
}
