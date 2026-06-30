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
import {
  saveDocumentFile,
  deleteDocument,
  documentToGeminiInput,
  fileToGeminiInput,
} from "@/lib/documents-server";
import {
  extractContractInsights as runContractInsights,
  parseContractInsights,
} from "@/lib/domain/contract-insights";
import { extractContractSetup } from "@/lib/domain/contract-setup-extraction";
import { normalizePersonName } from "@/lib/domain/name-normalization";

function go(message: string, type: "success" | "error" = "success") {
  const key = type === "success" ? "adminMessage" : "adminError";
  redirect(`/admin?${key}=${encodeURIComponent(message)}`);
}

function activeFromForm(formData: FormData) {
  return formData.get("active") === "on";
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sanitizeContractCode(value: string) {
  const code = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return code || "CONTRACT";
}

async function uniqueContractCode(rawCode: string) {
  const base = sanitizeContractCode(rawCode);
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await prisma.contract.findUnique({
      where: { code: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now()}`;
}

function fileNameBase(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").trim();
}

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function parseIsoDateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parsePositiveNumberOrNull(value: string | null | undefined) {
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function cleanAllocationPercentage(value: number | null) {
  return value !== null && Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
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

export async function createContractFromDocument(formData: FormData) {
  let createdContractCode = "";
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Upload eerst een opdrachtbrief of contract.");
    }

    const activeProfiles = await prisma.profileCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });

    const { filePart, sourceText } = await fileToGeminiInput(file);
    const { model: setupModel, setup } = await extractContractSetup({
      knownProfileNames: activeProfiles.map((profile) => profile.name),
      file: filePart,
      sourceText,
    });

    const manualStartDate = formText(formData, "manualStartDate");
    const manualEndDate = formText(formData, "manualEndDate");
    const manualTotalBudgetHours = formText(formData, "manualTotalBudgetHours");
    const manualCode = formText(formData, "manualCode");
    const manualName = formText(formData, "manualName");

    const startDate = parseIsoDateOrNull(setup.startDate) ?? parseIsoDateOrNull(manualStartDate);
    const endDate = parseIsoDateOrNull(setup.endDate) ?? parseIsoDateOrNull(manualEndDate);
    const totalBudgetHours =
      setup.totalBudgetHours ?? parsePositiveNumberOrNull(manualTotalBudgetHours);

    const missingFields = [
      !startDate ? "startdatum" : null,
      !endDate ? "einddatum" : null,
      !totalBudgetHours ? "totaal urenbudget" : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      throw new Error(
        `Gemini kon ${missingFields.join(", ")} niet betrouwbaar afleiden. Vul alleen ${
          missingFields.length === 1 ? "dit veld" : "deze velden"
        } aan in het blok "Ontbrekende gegevens manueel aanvullen" en upload hetzelfde document opnieuw.`,
      );
    }
    if (!startDate || !endDate || !totalBudgetHours) {
      throw new Error("Niet alle verplichte contractgegevens zijn beschikbaar.");
    }

    if (endDate < startDate) {
      throw new Error("De einddatum uit het document ligt voor de startdatum.");
    }

    const fallbackName = fileNameBase(file.name) || "Nieuw contract";
    const contractName = (setup.contractName ?? setup.orderLetterTitle ?? manualName) || fallbackName;
    const contractCode = await uniqueContractCode((setup.contractCode ?? manualCode) || fallbackName);
    createdContractCode = contractCode;

    const existingProfiles = await prisma.profileCategory.findMany();
    const profileByName = new Map(
      existingProfiles.map((profile) => [normalizeName(profile.name), profile]),
    );
    const setupProfiles = setup.profiles;

    for (const profileSuggestion of setupProfiles) {
      const profileName = profileSuggestion.name.trim();
      if (!profileName) continue;
      const key = normalizeName(profileName);
      const existing = profileByName.get(key);
      const defaultAllocationPercentage =
        cleanAllocationPercentage(profileSuggestion.defaultAllocationPercentage) ?? 0;

      if (existing) {
        if (!existing.active) {
          const updated = await prisma.profileCategory.update({
            where: { id: existing.id },
            data: { active: true },
          });
          profileByName.set(key, updated);
        }
        continue;
      }

      const created = await prisma.profileCategory.create({
        data: {
          name: profileName,
          defaultAllocationPercentage,
          active: true,
        },
      });
      profileByName.set(key, created);
    }

    const setupEmployees = setup.employees.filter((employee) => employee.source === "explicit");

    for (const employeeSuggestion of setupEmployees) {
      const profileName = employeeSuggestion.profileName.trim();
      if (!profileByName.has(normalizeName(profileName))) {
        const createdProfile = await prisma.profileCategory.create({
          data: {
            name: profileName,
            defaultAllocationPercentage: 0,
            active: true,
          },
        });
        profileByName.set(normalizeName(profileName), createdProfile);
      }
    }

    const existingEmployees = await prisma.employee.findMany({ select: { name: true } });
    const employeeNames = new Set(existingEmployees.map((employee) => normalizePersonName(employee.name)));
    for (const employeeSuggestion of setupEmployees) {
      const employeeName = employeeSuggestion.name.trim();
      const profile = profileByName.get(normalizeName(employeeSuggestion.profileName));
      if (!employeeName || !profile || employeeNames.has(normalizePersonName(employeeName))) continue;

      await prisma.employee.create({
        data: {
          name: employeeName,
          profileCategoryId: profile.id,
          weeklyCapacityHours: employeeSuggestion.weeklyCapacityHours ?? 40,
          active: true,
        },
      });
      employeeNames.add(normalizePersonName(employeeName));
    }

    const seenTasks = new Set<string>();
    const taskCreates = setup.tasks
      .map((task) => task.name.trim())
      .filter((name) => {
        const key = normalizeName(name);
        if (!key || seenTasks.has(key)) return false;
        seenTasks.add(key);
        return true;
      })
      .map((name) => ({ name }));

    const seenAllocationProfiles = new Set<string>();
    const allocationCreates = setupProfiles
      .map((profileSuggestion) => {
        const profile = profileByName.get(normalizeName(profileSuggestion.name));
        const targetPercentage = cleanAllocationPercentage(
          profileSuggestion.defaultAllocationPercentage,
        );
        if (!profile || targetPercentage === null || seenAllocationProfiles.has(profile.id)) {
          return null;
        }
        seenAllocationProfiles.add(profile.id);
        return {
          profileCategoryId: profile.id,
          targetPercentage,
        };
      })
      .filter((line): line is { profileCategoryId: string; targetPercentage: number } => line !== null);

    const seenRateProfiles = new Set<string>();
    const rateCreates = setupProfiles
      .map((profileSuggestion) => {
        const profile = profileByName.get(normalizeName(profileSuggestion.name));
        if (
          !profile ||
          profileSuggestion.unitPrice === null ||
          profileSuggestion.unitPrice <= 0 ||
          seenRateProfiles.has(profile.id)
        ) {
          return null;
        }
        seenRateProfiles.add(profile.id);
        return {
          profileCategoryId: profile.id,
          unitPrice: profileSuggestion.unitPrice,
        };
      })
      .filter((line): line is { profileCategoryId: string; unitPrice: number } => line !== null);

    const contract = await prisma.contract.create({
      data: {
        code: contractCode,
        name: contractName,
        totalBudgetHours,
        startDate,
        endDate,
        warningThreshold: 85,
        criticalThreshold: 95,
        active: true,
        vatPercentage: setup.vatPercentage ?? 21,
        totalBudgetAmount: setup.totalBudgetAmount,
        specificationCode: setup.specificationCode,
        orderLetterTitle: setup.orderLetterTitle,
        orderLetterReference: setup.orderLetterReference,
        domainManagerName: setup.domainManagerName,
        domainManagerRole: setup.domainManagerRole,
        domainManagerOrg: setup.domainManagerOrg,
        projectLeadNames: setup.projectLeadNames,
        aiInsightsModel: setupModel,
        aiInsightsAt: new Date(),
        aiInsightsStatus: "draft",
        tasks: { create: taskCreates },
        allocationTemplates: { create: allocationCreates },
        profileRates: { create: rateCreates },
      },
    });

    await saveDocumentFile(file, contract.id);

    try {
      const knownProfiles = await prisma.profileCategory.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      const { model, insights } = await runContractInsights({
        contractCode,
        contractName,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        knownProfiles: knownProfiles.map((profile) => ({
          profileCategoryId: profile.id,
          profileName: profile.name,
        })),
        knownTasks: taskCreates.map((task) => task.name),
        file: filePart,
        sourceText,
      });

      await prisma.contract.update({
        where: { id: contract.id },
        data: {
          aiInsightsJson: JSON.stringify(insights),
          aiInsightsModel: model,
          aiInsightsAt: new Date(),
          aiInsightsStatus: "draft",
        },
      });
    } catch (error) {
      console.warn(
        "[admin] Contract aangemaakt, maar AI-inzichten opslaan mislukte:",
        error instanceof Error ? error.message : error,
      );
      await prisma.contract.update({
        where: { id: contract.id },
        data: {
          aiInsightsJson: JSON.stringify({
            allocation: [],
            allocationStatus: allocationCreates.length > 0 ? "inferred" : "not_found",
            allocationSource: allocationCreates.length > 0 ? "inferred" : "none",
            allocationNote:
              allocationCreates.length > 0
                ? "Contract werd aangemaakt met AI-voorgestelde verdeelsleutel. Controleer deze manueel."
                : "Geen verdeelsleutel gevonden bij automatische contractaanmaak.",
            suggestedProfiles: setup.profiles,
            suggestedEmployees: setupEmployees,
            suggestedTasks: setup.tasks,
            suggestedTotalHours: totalBudgetHours,
            pv: {
              orderLetterTitle: setup.orderLetterTitle,
              orderLetterReference: setup.orderLetterReference,
              specificationCode: setup.specificationCode,
              domainManagerName: setup.domainManagerName,
              projectLeadNames: setup.projectLeadNames,
            },
            phases: [],
            overallRationale: setup.overallRationale,
          }),
        },
      });
    }
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Contract automatisch aanmaken is mislukt.",
      "error",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/simulations");
  revalidatePath("/planning");
  return go(
    `Contract ${createdContractCode} automatisch aangemaakt. Controleer de opgeslagen AI-inzichten voor velden die Gemini heeft voorgesteld.`,
  );
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

export async function deleteContract(formData: FormData) {
  const id = String(formData.get("id") ?? "");

  // Verwijder in volgorde: records zonder Cascade-regel op Contract worden eerst
  // handmatig opgeruimd; de rest verwijdert Prisma automatisch via onDelete: Cascade.
  await prisma.$transaction([
    prisma.invoice.deleteMany({ where: { contractId: id } }),
    prisma.deliveryReport.deleteMany({ where: { contractId: id } }),
    prisma.simulationLine.deleteMany({ where: { simulation: { contractId: id } } }),
    prisma.simulation.deleteMany({ where: { contractId: id } }),
    prisma.timeEntry.deleteMany({ where: { contractId: id } }),
    prisma.contract.delete({ where: { id } }),
  ]);

  revalidatePath("/admin");
  go("Contract en alle bijbehorende gegevens zijn permanent verwijderd.");
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
    const canApplyAllocation = allocationStatus === "complete" || allocationStatus === "inferred";

    const suggestedProfiles = insights.suggestedProfiles ?? [];
    const suggestedEmployees = (insights.suggestedEmployees ?? []).filter(
      (employee) => employee.source === "explicit",
    );
    const suggestedTasks = insights.suggestedTasks ?? [];
    const profileNames = new Set<string>();
    for (const profile of suggestedProfiles) {
      if (profile.name.trim()) profileNames.add(profile.name.trim());
    }
    for (const employee of suggestedEmployees) {
      if (employee.profileName.trim()) profileNames.add(employee.profileName.trim());
    }

    const existingProfiles = await prisma.profileCategory.findMany();
    const profileByName = new Map(
      existingProfiles.map((profile) => [normalizeName(profile.name), profile]),
    );

    for (const profileName of profileNames) {
      const key = normalizeName(profileName);
      const existing = profileByName.get(key);
      const suggestion = suggestedProfiles.find((profile) => normalizeName(profile.name) === key);
      const defaultAllocationPercentage =
        suggestion?.defaultAllocationPercentage ??
        insights.allocation.find((line) => normalizeName(line.profileName) === key)?.suggestedPercentage ??
        0;

      if (existing) {
        if (!existing.active) {
          const updated = await prisma.profileCategory.update({
            where: { id: existing.id },
            data: { active: true },
          });
          profileByName.set(key, updated);
        }
        continue;
      }

      const created = await prisma.profileCategory.create({
        data: {
          name: profileName,
          defaultAllocationPercentage,
          active: true,
        },
      });
      profileByName.set(key, created);
    }

    const existingEmployees = await prisma.employee.findMany();
    const employeeNames = new Set(existingEmployees.map((employee) => normalizePersonName(employee.name)));
    for (const employee of suggestedEmployees) {
      const employeeName = employee.name.trim();
      const profile = profileByName.get(normalizeName(employee.profileName));
      if (!employeeName || !profile || employeeNames.has(normalizePersonName(employeeName))) continue;

      await prisma.employee.create({
        data: {
          name: employeeName,
          profileCategoryId: profile.id,
          weeklyCapacityHours: employee.weeklyCapacityHours ?? 40,
          active: true,
        },
      });
      employeeNames.add(normalizePersonName(employeeName));
    }

    const existingTasks = await prisma.task.findMany({ where: { contractId } });
    const taskByName = new Map(existingTasks.map((task) => [normalizeName(task.name), task]));
    for (const taskSuggestion of suggestedTasks) {
      const taskName = taskSuggestion.name.trim();
      if (!taskName) continue;
      const key = normalizeName(taskName);
      const existing = taskByName.get(key);
      if (existing) {
        if (!existing.active) {
          ops.push(
            prisma.task.update({
              where: { id: existing.id },
              data: { active: true },
            }),
          );
        }
        continue;
      }

      ops.push(
        prisma.task.create({
          data: {
            contractId,
            name: taskName,
            active: true,
          },
        }),
      );
    }

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
    const allocationProfileIds = new Set(insights.allocation.map((line) => line.profileCategoryId));
    for (const profileSuggestion of suggestedProfiles) {
      if (
        profileSuggestion.defaultAllocationPercentage === null ||
        profileSuggestion.defaultAllocationPercentage <= 0
      ) {
        continue;
      }
      const profile = profileByName.get(normalizeName(profileSuggestion.name));
      if (!profile || allocationProfileIds.has(profile.id)) continue;

      ops.push(
        prisma.contractAllocationTemplate.upsert({
          where: {
            contractId_profileCategoryId: {
              contractId,
              profileCategoryId: profile.id,
            },
          },
          create: {
            contractId,
            profileCategoryId: profile.id,
            targetPercentage: profileSuggestion.defaultAllocationPercentage,
          },
          update: { targetPercentage: profileSuggestion.defaultAllocationPercentage },
        }),
      );
    }

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

    const pvTextFields: (keyof typeof insights.pv)[] = [
      "specificationCode",
      "orderLetterTitle",
      "orderLetterReference",
      "domainManagerName",
      "domainManagerRole",
      "domainManagerOrg",
      "projectLeadNames",
    ];

    for (const insightKey of pvTextFields) {
      const value = insights.pv[insightKey];
      if (typeof value === "string" && value.trim() !== "") {
        scalarUpdate[insightKey] = value;
      }
    }

    if (insights.pv.vatPercentage !== null && insights.pv.vatPercentage !== undefined) {
      scalarUpdate.vatPercentage = insights.pv.vatPercentage;
    }
    if (insights.pv.totalBudgetAmount !== null && insights.pv.totalBudgetAmount !== undefined && insights.pv.totalBudgetAmount > 0) {
      scalarUpdate.totalBudgetAmount = insights.pv.totalBudgetAmount;
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
  return go("AI-inzichten toegepast. AI-voorgestelde verdeelsleutels zijn overgenomen met duidelijke markering in het voorstel.");
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
