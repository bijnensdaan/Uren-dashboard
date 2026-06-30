"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  contractBillingFormSchema,
  contractFormSchema,
  employeeFormSchema,
  parseAllocationLines,
  parseTaskNames,
  profileFormSchema,
  taskFormSchema,
  validateAllocationPercentages,
} from "@/lib/domain/admin";
import { saveDocumentFile, deleteDocument } from "@/lib/documents-server";

function go(message: string, type: "success" | "error" = "success") {
  const key = type === "success" ? "adminMessage" : "adminError";
  redirect(`/admin?${key}=${encodeURIComponent(message)}`);
}

function activeFromForm(formData: FormData) {
  return formData.get("active") === "on";
}

export async function createProfile(formData: FormData) {
  try {
    const parsed = profileFormSchema.parse({
      name: formData.get("name"),
      defaultAllocationPercentage: formData.get("defaultAllocationPercentage"),
      active: true,
    });
    await prisma.profileCategory.create({ data: parsed });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Profiel aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Profiel aangemaakt.");
}

export async function updateProfile(formData: FormData) {
  try {
    const parsed = profileFormSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      defaultAllocationPercentage: formData.get("defaultAllocationPercentage"),
      active: activeFromForm(formData),
    });
    await prisma.profileCategory.update({
      where: { id: parsed.id! },
      data: {
        name: parsed.name,
        defaultAllocationPercentage: parsed.defaultAllocationPercentage,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Profiel bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Profiel bijgewerkt.");
}

export async function deactivateProfile(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.profileCategory.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Profiel gedeactiveerd.");
}

export async function createEmployee(formData: FormData) {
  try {
    const parsed = employeeFormSchema.parse({
      name: formData.get("name"),
      profileCategoryId: formData.get("profileCategoryId"),
      weeklyCapacityHours: formData.get("weeklyCapacityHours") ?? 40,
      active: true,
    });
    await prisma.employee.create({
      data: {
        name: parsed.name,
        profileCategoryId: parsed.profileCategoryId,
        weeklyCapacityHours: parsed.weeklyCapacityHours,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Medewerker aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Medewerker aangemaakt.");
}

export async function updateEmployee(formData: FormData) {
  try {
    const parsed = employeeFormSchema.parse({
      id: formData.get("id"),
      name: formData.get("name"),
      profileCategoryId: formData.get("profileCategoryId"),
      weeklyCapacityHours: formData.get("weeklyCapacityHours") ?? 40,
      active: activeFromForm(formData),
    });
    await prisma.employee.update({
      where: { id: parsed.id! },
      data: {
        name: parsed.name,
        profileCategoryId: parsed.profileCategoryId,
        weeklyCapacityHours: parsed.weeklyCapacityHours,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Medewerker bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Medewerker bijgewerkt.");
}

export async function deactivateEmployee(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.employee.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Medewerker gedeactiveerd.");
}

export async function createTask(formData: FormData) {
  try {
    const parsed = taskFormSchema.parse({
      contractId: formData.get("contractId"),
      name: formData.get("name"),
      active: true,
    });
    await prisma.task.create({ data: parsed });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Taak aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Taak aangemaakt.");
}

export async function updateTask(formData: FormData) {
  try {
    const parsed = taskFormSchema.parse({
      id: formData.get("id"),
      contractId: formData.get("contractId"),
      name: formData.get("name"),
      active: activeFromForm(formData),
    });
    await prisma.task.update({
      where: { id: parsed.id! },
      data: {
        name: parsed.name,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Taak bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Taak bijgewerkt.");
}

export async function deactivateTask(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.task.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Taak gedeactiveerd.");
}

export async function createContractWithSetup(formData: FormData) {
  try {
    const parsed = contractFormSchema.parse({
      code: formData.get("code"),
      name: formData.get("name"),
      totalBudgetHours: formData.get("totalBudgetHours"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      warningThreshold: formData.get("warningThreshold"),
      criticalThreshold: formData.get("criticalThreshold"),
      active: true,
    });
    const profileIds = formData.getAll("profileId").map(String);
    const allocationLines = parseAllocationLines(formData, profileIds);
    validateAllocationPercentages(allocationLines);
    const taskNames = parseTaskNames(formData.get("tasks"));

    await prisma.contract.create({
      data: {
        code: parsed.code,
        name: parsed.name,
        totalBudgetHours: parsed.totalBudgetHours,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        warningThreshold: parsed.warningThreshold,
        criticalThreshold: parsed.criticalThreshold,
        active: true,
        tasks: {
          create: taskNames.map((name) => ({ name })),
        },
        allocationTemplates: {
          create: allocationLines.map((line) => ({
            profileCategoryId: line.profileCategoryId,
            targetPercentage: line.targetPercentage,
          })),
        },
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Contract aanmaken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Contract met taken en verdeelsleutel aangemaakt.");
}

export async function updateContract(formData: FormData) {
  try {
    const parsed = contractFormSchema.parse({
      id: formData.get("id"),
      code: formData.get("code"),
      name: formData.get("name"),
      totalBudgetHours: formData.get("totalBudgetHours"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      warningThreshold: formData.get("warningThreshold"),
      criticalThreshold: formData.get("criticalThreshold"),
      active: activeFromForm(formData),
    });

    await prisma.contract.update({
      where: { id: parsed.id! },
      data: {
        code: parsed.code,
        name: parsed.name,
        totalBudgetHours: parsed.totalBudgetHours,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        warningThreshold: parsed.warningThreshold,
        criticalThreshold: parsed.criticalThreshold,
        active: parsed.active,
      },
    });
  } catch (error) {
    return go(error instanceof Error ? error.message : "Contract bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Contract bijgewerkt.");
}

export async function deactivateContract(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.contract.update({ where: { id }, data: { active: false } });
  revalidatePath("/admin");
  go("Contract gedeactiveerd.");
}

export async function updateContractBilling(formData: FormData) {
  try {
    const parsed = contractBillingFormSchema.parse({
      contractId: formData.get("contractId"),
      vatPercentage: formData.get("vatPercentage"),
      totalBudgetAmount: formData.get("totalBudgetAmount"),
      specificationCode: formData.get("specificationCode"),
      orderLetterTitle: formData.get("orderLetterTitle"),
      orderLetterReference: formData.get("orderLetterReference"),
      domainManagerName: formData.get("domainManagerName"),
      domainManagerRole: formData.get("domainManagerRole"),
      domainManagerOrg: formData.get("domainManagerOrg"),
      projectLeadNames: formData.get("projectLeadNames"),
      projectLeadOrg: formData.get("projectLeadOrg"),
    });

    const profileIds = formData.getAll("profileId").map(String);
    const rateUpserts = profileIds
      .map((profileCategoryId) => ({
        profileCategoryId,
        unitPrice: Number(formData.get(`unit-${profileCategoryId}`)),
      }))
      .filter((rate) => Number.isFinite(rate.unitPrice) && rate.unitPrice > 0);

    await prisma.$transaction([
      prisma.contract.update({
        where: { id: parsed.contractId },
        data: {
          vatPercentage: parsed.vatPercentage,
          totalBudgetAmount: parsed.totalBudgetAmount ?? null,
          specificationCode: parsed.specificationCode ?? null,
          orderLetterTitle: parsed.orderLetterTitle ?? null,
          orderLetterReference: parsed.orderLetterReference ?? null,
          domainManagerName: parsed.domainManagerName ?? null,
          domainManagerRole: parsed.domainManagerRole ?? null,
          domainManagerOrg: parsed.domainManagerOrg ?? null,
          projectLeadNames: parsed.projectLeadNames ?? null,
          projectLeadOrg: parsed.projectLeadOrg ?? null,
        },
      }),
      ...rateUpserts.map((rate) =>
        prisma.profileRate.upsert({
          where: {
            contractId_profileCategoryId: {
              contractId: parsed.contractId,
              profileCategoryId: rate.profileCategoryId,
            },
          },
          create: {
            contractId: parsed.contractId,
            profileCategoryId: rate.profileCategoryId,
            unitPrice: rate.unitPrice,
          },
          update: { unitPrice: rate.unitPrice },
        }),
      ),
    ]);
  } catch (error) {
    return go(error instanceof Error ? error.message : "Facturatiegegevens bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Facturatiegegevens en tarieven bijgewerkt.");
}

export async function updateContractAllocations(formData: FormData) {
  try {
    const contractId = String(formData.get("contractId") ?? "");
    const profileIds = formData.getAll("profileId").map(String);
    const allocationLines = parseAllocationLines(formData, profileIds);
    validateAllocationPercentages(allocationLines);

    await prisma.$transaction(
      allocationLines.map((line) =>
        prisma.contractAllocationTemplate.upsert({
          where: {
            contractId_profileCategoryId: {
              contractId,
              profileCategoryId: line.profileCategoryId,
            },
          },
          create: {
            contractId,
            profileCategoryId: line.profileCategoryId,
            targetPercentage: line.targetPercentage,
          },
          update: {
            targetPercentage: line.targetPercentage,
          },
        }),
      ),
    );
  } catch (error) {
    return go(error instanceof Error ? error.message : "Verdeelsleutel bijwerken is mislukt.", "error");
  }
  revalidatePath("/admin");
  return go("Verdeelsleutel bijgewerkt.");
}

// ---------------------------------------------------------------------------
// Documentenbibliotheek
// ---------------------------------------------------------------------------

/**
 * Upload een document en koppel het aan een contract.
 * FormData-velden: contractId (string), file (File).
 */
export async function uploadContractDocument(formData: FormData) {
  try {
    const contractId = String(formData.get("contractId") ?? "");
    const file = formData.get("file");

    if (!contractId) {
      throw new Error("Kies eerst een contract.");
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Geen bestand geüpload.");
    }

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new Error("Contract niet gevonden.");
    }

    await saveDocumentFile(file, contractId);
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Document uploaden is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  return go("Document geüpload.");
}

/**
 * Verwijder een document (bestand + DB-rij).
 * FormData-velden: documentId (string).
 */
export async function deleteContractDocument(formData: FormData) {
  try {
    const documentId = String(formData.get("documentId") ?? "");
    if (!documentId) {
      throw new Error("Geen document opgegeven.");
    }
    await deleteDocument(documentId);
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Document verwijderen is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  return go("Document verwijderd.");
}
