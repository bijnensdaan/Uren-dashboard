"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { documentToGeminiInput } from "@/lib/documents-server";
import {
  extractContractInsights as runContractInsights,
  parseContractInsights,
} from "@/lib/domain/contract-insights";
import { normalizePersonName } from "@/lib/domain/name-normalization";
import { go, normalizeName } from "./helpers";

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
