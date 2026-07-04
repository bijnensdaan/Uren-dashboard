"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  contractBillingFormSchema,
  contractFormSchema,
  parseAllocationLines,
  parseTaskNames,
  validateAllocationPercentages,
} from "@/lib/domain/admin";
import { saveDocumentFile, fileToGeminiInput } from "@/lib/documents-server";
import { extractContractInsights as runContractInsights } from "@/lib/domain/contract-insights";
import { extractContractSetup } from "@/lib/domain/contract-setup-extraction";
import { normalizePersonName } from "@/lib/domain/name-normalization";
import {
  activeFromForm,
  cleanAllocationPercentage,
  fileNameBase,
  formText,
  go,
  normalizeName,
  parseIsoDateOrNull,
  parsePositiveNumberOrNull,
  uniqueContractCode,
} from "./helpers";

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
    const hasFile = file instanceof File && file.size > 0;

    // Gemeenschappelijke formuliervelden (gebruikt in beide paden)
    const formCode = formText(formData, "code");
    const formName = formText(formData, "name");
    const formStartDate = formText(formData, "startDate");
    const formEndDate = formText(formData, "endDate");
    const formTotalBudgetHours = formText(formData, "totalBudgetHours");
    const warningThreshold = parsePositiveNumberOrNull(formText(formData, "warningThreshold")) ?? 85;
    const criticalThreshold = parsePositiveNumberOrNull(formText(formData, "criticalThreshold")) ?? 95;
    const profileIds = formData.getAll("profileId").map(String);

    // ── PAD A: geen bestand → puur manueel aanmaken ────────────────────────
    if (!hasFile) {
      const parsed = contractFormSchema.parse({
        code: formCode,
        name: formName,
        totalBudgetHours: formTotalBudgetHours,
        startDate: formStartDate,
        endDate: formEndDate,
        warningThreshold: formText(formData, "warningThreshold") || "85",
        criticalThreshold: formText(formData, "criticalThreshold") || "95",
        active: true,
      });
      const allocationLines = parseAllocationLines(formData, profileIds);
      validateAllocationPercentages(allocationLines);
      const taskNames = parseTaskNames(formData.get("tasks"));
      const code = await uniqueContractCode(parsed.code);
      await prisma.contract.create({
        data: {
          code,
          name: parsed.name,
          totalBudgetHours: parsed.totalBudgetHours,
          startDate: parsed.startDate,
          endDate: parsed.endDate,
          warningThreshold: parsed.warningThreshold,
          criticalThreshold: parsed.criticalThreshold,
          active: true,
          tasks: { create: taskNames.map((name) => ({ name })) },
          allocationTemplates: {
            create: allocationLines.map((line) => ({
              profileCategoryId: line.profileCategoryId,
              targetPercentage: line.targetPercentage,
            })),
          },
        },
      });
      revalidatePath("/admin");
      return go("Opdrachtbrief aangemaakt.");
    }

    // ── PAD B: bestand aanwezig → Gemini uitlezen + form als override ───────
    const activeProfiles = await prisma.profileCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });

    const { filePart, sourceText } = await fileToGeminiInput(file as File);
    const { model: setupModel, setup } = await extractContractSetup({
      knownProfileNames: activeProfiles.map((profile) => profile.name),
      file: filePart,
      sourceText,
    });

    // Formuliervelden winnen altijd van Gemini; Gemini dient als fallback.
    const startDate = parseIsoDateOrNull(formStartDate) ?? parseIsoDateOrNull(setup.startDate);
    const endDate = parseIsoDateOrNull(formEndDate) ?? parseIsoDateOrNull(setup.endDate);
    const totalBudgetHours =
      parsePositiveNumberOrNull(formTotalBudgetHours) ?? setup.totalBudgetHours;

    const missingFields = [
      !startDate ? "startdatum" : null,
      !endDate ? "einddatum" : null,
      !totalBudgetHours ? "totaal urenbudget" : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      throw new Error(
        `Gemini kon ${missingFields.join(", ")} niet betrouwbaar afleiden. Vul ${
          missingFields.length === 1 ? "dit veld" : "deze velden"
        } in het formulier in en probeer opnieuw.`,
      );
    }
    if (!startDate || !endDate || !totalBudgetHours) {
      throw new Error("Niet alle verplichte gegevens zijn beschikbaar.");
    }

    if (endDate < startDate) {
      throw new Error("De einddatum ligt voor de startdatum.");
    }

    const fallbackName = fileNameBase((file as File).name) || "Nieuwe opdrachtbrief";
    const contractName = formName || (setup.contractName ?? setup.orderLetterTitle) || fallbackName;
    const contractCode = await uniqueContractCode(formCode || setup.contractCode || fallbackName);
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
        warningThreshold,
        criticalThreshold,
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

    await saveDocumentFile(file as File, contract.id);

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
