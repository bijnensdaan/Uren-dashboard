"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { feedbackUrl } from "@/lib/feedback";
import {
  deleteContractDraft,
  draftToFile,
  loadContractDraft,
  saveContractDraft,
} from "@/lib/contract-draft-server";
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

/**
 * Stap 1 van de upload-flow: lees de opdrachtbrief uit met Gemini en sla het
 * resultaat op als CONCEPT (uploads/drafts). Er wordt hier nog NIETS aan het
 * dashboard toegevoegd — de gebruiker controleert en bevestigt eerst.
 */
export async function prepareContractDraft(formData: FormData) {
  let draftId = "";
  try {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Kies eerst een bestand (PDF, Word of tekst).");
    }

    const activeProfiles = await prisma.profileCategory.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });

    const { filePart, sourceText } = await fileToGeminiInput(file);
    const { model, setup } = await extractContractSetup({
      knownProfileNames: activeProfiles.map((profile) => profile.name),
      file: filePart,
      sourceText,
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const draft = await saveContractDraft({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileBase64: buffer.toString("base64"),
      model,
      setup,
    });
    draftId = draft.id;
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Opdrachtbrief uitlezen is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  redirect(
    feedbackUrl(
      `/admin?draft=${draftId}`,
      "admin",
      "success",
      "Opdrachtbrief uitgelezen. Controleer de gegevens hieronder, pas aan waar nodig en klik daarna op 'Toevoegen aan dashboard'.",
    ),
  );
}

/**
 * Stap 2 van de upload-flow: maak het contract aan op basis van de
 * GECONTROLEERDE formulierwaarden (niet blind de AI-uitlezing) en verwijder
 * daarna het concept. Het originele bestand wordt als document gekoppeld.
 */
export async function confirmContractDraft(formData: FormData) {
  let createdContractCode = "";
  try {
    const draftId = formText(formData, "draftId");
    const draft = await loadContractDraft(draftId);
    if (!draft) {
      throw new Error("Concept niet gevonden of verlopen. Upload de opdrachtbrief opnieuw.");
    }

    const round2 = (value: number) => Math.round(value * 100) / 100;
    const name = formText(formData, "name");
    const startDate = parseIsoDateOrNull(formText(formData, "startDate"));
    const endDate = parseIsoDateOrNull(formText(formData, "endDate"));
    const totalBudgetHours = parsePositiveNumberOrNull(formText(formData, "totalBudgetHours"));
    const warningThreshold = parsePositiveNumberOrNull(formText(formData, "warningThreshold")) ?? 85;
    const criticalThreshold = parsePositiveNumberOrNull(formText(formData, "criticalThreshold")) ?? 95;

    if (!name) throw new Error("Vul een naam in voor de opdrachtbrief.");
    if (!startDate) throw new Error("Vul een geldige startdatum in.");
    if (!endDate) throw new Error("Vul een geldige einddatum in.");
    if (endDate < startDate) throw new Error("De einddatum ligt voor de startdatum.");
    if (!totalBudgetHours) throw new Error("Vul een urenbudget groter dan 0 in.");

    const contractCode = await uniqueContractCode(
      formText(formData, "code") || name || fileNameBase(draft.fileName),
    );
    createdContractCode = contractCode;

    // Profielregels uit het controle-formulier (alleen aangevinkte rijen).
    const profileIndexes = formData.getAll("profileIndex").map(String);
    const profileLines: Array<{ name: string; percentage: number | null; unitPrice: number | null }> = [];
    for (const index of profileIndexes) {
      if (formData.get(`profile-include-${index}`) !== "on") continue;
      const profileName = formText(formData, `profile-name-${index}`);
      if (!profileName) continue;
      const pct = Number(formData.get(`profile-pct-${index}`));
      const rate = Number(formData.get(`profile-rate-${index}`));
      profileLines.push({
        name: profileName,
        percentage: Number.isFinite(pct) && pct > 0 ? pct : null,
        unitPrice: Number.isFinite(rate) && rate > 0 ? rate : null,
      });
    }

    // Medewerkerregels uit het controle-formulier (alleen aangevinkte rijen).
    const employeeIndexes = formData.getAll("employeeIndex").map(String);
    const employeeLines: Array<{ name: string; profileName: string; weeklyCapacityHours: number | null }> = [];
    for (const index of employeeIndexes) {
      if (formData.get(`employee-include-${index}`) !== "on") continue;
      const employeeName = formText(formData, `employee-name-${index}`);
      const profileName = formText(formData, `employee-profile-${index}`);
      if (!employeeName || !profileName) continue;
      const capacity = Number(formData.get(`employee-capacity-${index}`));
      employeeLines.push({
        name: employeeName,
        profileName,
        weeklyCapacityHours: Number.isFinite(capacity) && capacity > 0 ? capacity : null,
      });
    }

    const taskNames = parseTaskNames(formData.get("tasks"));

    // Profielen aanmaken of heractiveren.
    const existingProfiles = await prisma.profileCategory.findMany();
    const profileByName = new Map(
      existingProfiles.map((profile) => [normalizeName(profile.name), profile]),
    );
    const neededProfileNames = new Set([
      ...profileLines.map((line) => line.name),
      ...employeeLines.map((line) => line.profileName),
    ]);
    for (const profileName of neededProfileNames) {
      const key = normalizeName(profileName);
      const existing = profileByName.get(key);
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
      const pct = profileLines.find((line) => normalizeName(line.name) === key)?.percentage ?? 0;
      const created = await prisma.profileCategory.create({
        data: { name: profileName, defaultAllocationPercentage: pct, active: true },
      });
      profileByName.set(key, created);
    }

    // Medewerkers aanmaken; bestaande personen (op naam) worden overgeslagen.
    const existingEmployees = await prisma.employee.findMany({ select: { name: true } });
    const employeeNames = new Set(
      existingEmployees.map((employee) => normalizePersonName(employee.name)),
    );
    for (const line of employeeLines) {
      const profile = profileByName.get(normalizeName(line.profileName));
      if (!profile || employeeNames.has(normalizePersonName(line.name))) continue;
      await prisma.employee.create({
        data: {
          name: line.name,
          profileCategoryId: profile.id,
          weeklyCapacityHours: line.weeklyCapacityHours ?? 40,
          active: true,
        },
      });
      employeeNames.add(normalizePersonName(line.name));
    }

    // Verdeelsleutel: percentages herschalen naar exact 100%.
    const allocationSource = profileLines.filter(
      (line) => line.percentage !== null && line.percentage > 0,
    );
    const pctTotal = allocationSource.reduce((sum, line) => sum + (line.percentage ?? 0), 0);
    const seenAllocation = new Set<string>();
    const allocationCreates: Array<{ profileCategoryId: string; targetPercentage: number }> = [];
    for (const line of allocationSource) {
      const profile = profileByName.get(normalizeName(line.name));
      if (!profile || seenAllocation.has(profile.id)) continue;
      seenAllocation.add(profile.id);
      allocationCreates.push({
        profileCategoryId: profile.id,
        targetPercentage: round2(((line.percentage ?? 0) / pctTotal) * 100),
      });
    }

    const seenRates = new Set<string>();
    const rateCreates: Array<{ profileCategoryId: string; unitPrice: number }> = [];
    for (const line of profileLines) {
      const profile = profileByName.get(normalizeName(line.name));
      if (!profile || line.unitPrice === null || seenRates.has(profile.id)) continue;
      seenRates.add(profile.id);
      rateCreates.push({ profileCategoryId: profile.id, unitPrice: line.unitPrice });
    }

    const textOrNull = (field: string) => formText(formData, field) || null;
    const contract = await prisma.contract.create({
      data: {
        code: contractCode,
        name,
        totalBudgetHours,
        startDate,
        endDate,
        warningThreshold,
        criticalThreshold,
        active: true,
        vatPercentage: parsePositiveNumberOrNull(formText(formData, "vatPercentage")) ?? 21,
        totalBudgetAmount: parsePositiveNumberOrNull(formText(formData, "totalBudgetAmount")),
        specificationCode: textOrNull("specificationCode"),
        orderLetterTitle: textOrNull("orderLetterTitle"),
        orderLetterReference: textOrNull("orderLetterReference"),
        domainManagerName: textOrNull("domainManagerName"),
        domainManagerRole: textOrNull("domainManagerRole"),
        domainManagerOrg: textOrNull("domainManagerOrg"),
        projectLeadNames: textOrNull("projectLeadNames"),
        aiInsightsModel: draft.model,
        aiInsightsAt: new Date(),
        aiInsightsStatus: "draft",
        tasks: { create: taskNames.map((taskName) => ({ name: taskName })) },
        allocationTemplates: { create: allocationCreates },
        profileRates: { create: rateCreates },
      },
    });

    // Origineel bestand koppelen als document van dit contract.
    const draftFile = draftToFile(draft);
    await saveDocumentFile(draftFile, contract.id);

    // Best-effort: volledige AI-inzichten (incl. fasering) ophalen voor Planning.
    try {
      const knownProfiles = await prisma.profileCategory.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      const { filePart, sourceText } = await fileToGeminiInput(draftFile);
      const { model, insights } = await runContractInsights({
        contractCode,
        contractName: name,
        startDate: startDate.toISOString().slice(0, 10),
        endDate: endDate.toISOString().slice(0, 10),
        knownProfiles: knownProfiles.map((profile) => ({
          profileCategoryId: profile.id,
          profileName: profile.name,
        })),
        knownTasks: taskNames,
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
                ? "Contract aangemaakt via de gecontroleerde upload-flow."
                : "Geen verdeelsleutel ingevuld bij de gecontroleerde upload-flow.",
            suggestedProfiles: draft.setup.profiles,
            suggestedEmployees: employeeLines.map((line) => ({
              name: line.name,
              profileName: line.profileName,
              weeklyCapacityHours: line.weeklyCapacityHours,
              source: "explicit",
              rationale: "Bevestigd door de gebruiker in de controle-stap.",
            })),
            suggestedTasks: taskNames.map((taskName) => ({
              name: taskName,
              source: "explicit",
              rationale: "Bevestigd door de gebruiker in de controle-stap.",
            })),
            suggestedTotalHours: totalBudgetHours,
            pv: {
              orderLetterTitle: textOrNull("orderLetterTitle"),
              orderLetterReference: textOrNull("orderLetterReference"),
              specificationCode: textOrNull("specificationCode"),
              domainManagerName: textOrNull("domainManagerName"),
              projectLeadNames: textOrNull("projectLeadNames"),
            },
            phases: [],
            overallRationale: draft.setup.overallRationale,
          }),
        },
      });
    }

    await deleteContractDraft(draft.id);
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Opdrachtbrief toevoegen is mislukt.",
      "error",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/simulations");
  revalidatePath("/planning");
  return go(
    `Opdrachtbrief ${createdContractCode} toegevoegd aan het dashboard, inclusief taken, verdeelsleutel en medewerkers.`,
  );
}

/** Annuleert een concept: verwijdert het draft-bestand zonder iets toe te voegen. */
export async function discardContractDraft(formData: FormData) {
  try {
    const draftId = formText(formData, "draftId");
    if (draftId) await deleteContractDraft(draftId);
  } catch (error) {
    return go(
      error instanceof Error ? error.message : "Concept annuleren is mislukt.",
      "error",
    );
  }
  revalidatePath("/admin");
  return go("Concept geannuleerd. Er is niets aan het dashboard toegevoegd.");
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
    const hoursPerDay = Number(formData.get("hoursPerDay") ?? 7.6);
    if (!Number.isFinite(hoursPerDay) || hoursPerDay <= 0 || hoursPerDay > 24) {
      throw new Error("Uren per werkdag moet groter zijn dan 0 en maximaal 24 zijn.");
    }
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
        hoursPerDay,
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
