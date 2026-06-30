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
import { saveDocumentFile, deleteDocument, documentToGeminiInput } from "@/lib/documents-server";
import {
  extractContractInsights as runContractInsights,
  parseContractInsights,
} from "@/lib/domain/contract-insights";

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

export async function reactivateContract(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.contract.update({ where: { id }, data: { active: true } });
  revalidatePath("/admin");
  go("Contract opnieuw geactiveerd.");
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

// ---------------------------------------------------------------------------
// AI-inzichten: uitlezen, overnemen, wissen
// ---------------------------------------------------------------------------

/**
 * Leest een opgeslagen document uit met Gemini en slaat de AI-inzichten op als
 * concept (aiInsightsStatus = "draft") op het contract.
 *
 * FormData-velden:
 *   contractId  (string) — het contract waarvoor de inzichten worden aangemaakt
 *   documentId  (string) — een aan dat contract gekoppeld opgeslagen document
 */
export async function extractContractInsights(formData: FormData) {
  try {
    const contractId = String(formData.get("contractId") ?? "");
    const documentId = String(formData.get("documentId") ?? "");

    if (!contractId) throw new Error("Kies een contract.");
    if (!documentId) throw new Error("Kies een document.");

    // Laad het contract met actieve taken.
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        tasks: { where: { active: true }, select: { name: true } },
      },
    });

    if (!contract) throw new Error("Contract niet gevonden.");

    // Laad alle actieve profielcategorieën als basis voor de verdeelsleutel.
    const activeProfiles = await prisma.profileCategory.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    const knownProfiles = activeProfiles.map((p: { id: string; name: string }) => ({
      profileCategoryId: p.id,
      profileName: p.name,
    }));

    const knownTasks = contract.tasks.map((t: { name: string }) => t.name);

    // Zet het document om naar Gemini-invoer.
    const { filePart, sourceText } = await documentToGeminiInput(documentId);

    // Roep de gecombineerde extractie aan.
    const { model, insights } = await runContractInsights({
      contractCode: contract.code,
      contractName: contract.name,
      startDate: contract.startDate.toISOString().slice(0, 10),
      endDate: contract.endDate.toISOString().slice(0, 10),
      knownProfiles,
      knownTasks,
      file: filePart,
      sourceText,
    });

    // Sla op als concept.
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        aiInsightsJson: JSON.stringify(insights),
        aiInsightsStatus: "draft",
        aiInsightsModel: model,
        aiInsightsAt: new Date(),
      },
    });
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "AI-inzichten uitlezen is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  return go("AI-inzichten succesvol uitgelezen en opgeslagen als concept.");
}

/**
 * Past de opgeslagen AI-inzichten toe op het contract:
 *   - verdeelsleutel (ContractAllocationTemplate) — upsert per profiel
 *   - tarieven (ProfileRate) — upsert voor regels met unitPrice
 *   - scalaire contractvelden (totalBudgetHours, stamdata) — overschrijf alleen niet-null waarden
 *   - fases blijven in aiInsightsJson voor Planning (geen ProjectPlan aangemaakt hier)
 *
 * FormData-velden:
 *   contractId  (string)
 */
export async function applyContractInsights(formData: FormData) {
  try {
    const contractId = String(formData.get("contractId") ?? "");
    if (!contractId) throw new Error("Kies een contract.");

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) throw new Error("Contract niet gevonden.");

    const insights = parseContractInsights(contract.aiInsightsJson);
    if (!insights) {
      throw new Error(
        "Geen AI-inzichten gevonden voor dit contract. Voer eerst een uitlezing uit.",
      );
    }

    // Bouw de transactie-operaties op. `any[]` want Prisma's $transaction-overloads
    // zijn niet beschikbaar zonder gegenereerde client; runtime is altijd correct.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ops: any[] = [];
    const allocationStatus = insights.allocationStatus ?? "not_found";
    const canApplyAllocation = allocationStatus === "complete";

    // 1. Verdeelsleutel — upsert per profiel.
    if (canApplyAllocation) {
      for (const line of insights.allocation) {
      ops.push(
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
            targetPercentage: line.suggestedPercentage,
          },
          update: { targetPercentage: line.suggestedPercentage },
        }),
      );
      }
    }

    // 2. Tarieven — upsert alleen als unitPrice aanwezig.
    if (canApplyAllocation) {
      for (const line of insights.allocation) {
        if (line.unitPrice !== null && line.unitPrice > 0) {
        ops.push(
          prisma.profileRate.upsert({
            where: {
              contractId_profileCategoryId: {
                contractId,
                profileCategoryId: line.profileCategoryId,
              },
            },
            create: {
              contractId,
              profileCategoryId: line.profileCategoryId,
              unitPrice: line.unitPrice,
            },
            update: { unitPrice: line.unitPrice },
          }),
        );
        }
      }
    }

    // 3. Scalaire contractvelden — overschrijf alleen niet-null waarden.
    const scalarUpdate: Record<string, unknown> = { aiInsightsStatus: "applied" };

    if (insights.suggestedTotalHours !== null && insights.suggestedTotalHours > 0) {
      scalarUpdate.totalBudgetHours = insights.suggestedTotalHours;
    }

    const pvFields: Record<string, keyof typeof insights.pv> = {
      specificationCode: "specificationCode",
      orderLetterTitle: "orderLetterTitle",
      orderLetterReference: "orderLetterReference",
      domainManagerName: "domainManagerName",
      projectLeadNames: "projectLeadNames",
    };

    for (const [dbField, insightKey] of Object.entries(pvFields)) {
      const value = insights.pv[insightKey];
      if (value !== null && value !== undefined && value.trim() !== "") {
        scalarUpdate[dbField] = value;
      }
    }

    ops.push(prisma.contract.update({ where: { id: contractId }, data: scalarUpdate }));

    await prisma.$transaction(ops);
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "AI-inzichten toepassen is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  revalidatePath("/simulations");
  revalidatePath("/planning");
  return go("AI-inzichten toegepast. Niet gevonden of onvolledige velden zijn niet overgenomen.");
}

/**
 * Wist de opgeslagen AI-inzichten voor een contract zodat een nieuwe uitlezing
 * uitgevoerd kan worden.
 *
 * FormData-velden:
 *   contractId  (string)
 */
export async function clearContractInsights(formData: FormData) {
  try {
    const contractId = String(formData.get("contractId") ?? "");
    if (!contractId) throw new Error("Kies een contract.");

    await prisma.contract.update({
      where: { id: contractId },
      data: {
        aiInsightsJson: null,
        aiInsightsStatus: "none",
        aiInsightsModel: null,
        aiInsightsAt: null,
      },
    });
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "AI-inzichten wissen is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  return go("AI-inzichten gewist.");
}
