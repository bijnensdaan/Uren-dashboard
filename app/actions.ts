"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  suggestAllocationPercentages,
  type AllocationSuggestion,
} from "@/lib/domain/allocation-suggestion";
import { extractOfferDetails } from "@/lib/domain/offer-extraction";
import { extractDocxText } from "@/lib/domain/docx-text";
import { generatePvNarrative, type PvNarrative } from "@/lib/domain/pv-narrative";
import { buildPvFacturatie, hoursToDays, parsePvData, type PvData } from "@/lib/domain/pv";
import { buildDeliveryReportHtml } from "@/lib/domain/report";
import { createSimulationProposal, type AllocationInput } from "@/lib/domain/simulation";
import {
  acceptAllocationFormSchema,
  simulationFormSchema,
  suggestAllocationFormSchema,
  timeEntryFormSchema,
} from "@/lib/validators";

/**
 * Gedeelde persistentie van een simulatie. De urenverdeling komt altijd uit
 * `createSimulationProposal` (lib/domain) — alleen de bron van de percentages
 * verschilt: standaard de contract-template, of een (AI-)suggestie.
 */
async function persistSimulation(
  contractId: string,
  inputTotalHours: number,
  allocationLines: AllocationInput[],
  sourceType: "manual" | "ai_suggestion",
) {
  const proposal = createSimulationProposal(inputTotalHours, allocationLines);

  return prisma.simulation.create({
    data: {
      contractId,
      inputTotalHours,
      sourceType,
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
}

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

  // Optioneel: een expliciete set percentages (bv. uit een geaccepteerd
  // AI-voorstel) in plaats van de standaard contract-template.
  const explicit = parseAllocationsJson(formData.get("allocationsJson"));

  const allocationLines =
    explicit ??
    (
      await prisma.contractAllocationTemplate.findMany({
        where: { contractId: parsed.contractId },
        include: { profileCategory: true },
        orderBy: { targetPercentage: "asc" },
      })
    ).map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      targetPercentage: line.targetPercentage,
    }));

  const simulation = await persistSimulation(
    parsed.contractId,
    parsed.inputTotalHours,
    allocationLines,
    explicit ? "ai_suggestion" : "manual",
  );

  revalidatePath("/simulations");
  redirect(`/simulations?selected=${simulation.id}`);
}

function parseAllocationsJson(value: FormDataEntryValue | null): AllocationInput[] | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    const lines = parsed
      .map((item) => {
        const record = item as Record<string, unknown>;
        return {
          profileCategoryId: String(record.profileCategoryId ?? ""),
          profileName: String(record.profileName ?? ""),
          targetPercentage: Number(record.targetPercentage),
        };
      })
      .filter((line) => line.profileCategoryId && Number.isFinite(line.targetPercentage));

    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  }
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

export async function generateReportAiDraft(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");
  const taskNotesOverride = String(formData.get("taskNotes") ?? "").trim();

  const report = await prisma.deliveryReport.findUnique({
    where: { id: reportId },
    include: {
      contract: {
        include: {
          timeEntries: { include: { task: true } },
        },
      },
      simulation: {
        include: { lines: { include: { profileCategory: true } } },
      },
    },
  });

  if (!report) {
    throw new Error("Rapport niet gevonden.");
  }

  const pvData = parsePvData(report.pvDataJson);

  // taskNotes: expliciete invoer van de gebruiker, of afgeleid uit de taaknamen
  // en notities van de time entries van het contract (geen AI, enkel data).
  const derivedNotes = (() => {
    const taskNames = Array.from(
      new Set(report.contract.timeEntries.map((entry) => entry.task.name)),
    );
    const notes = report.contract.timeEntries
      .map((entry) => entry.notes?.trim())
      .filter((note): note is string => Boolean(note));
    return [...taskNames, ...notes].join("\n");
  })();

  const effort = report.simulation.lines.map((line) => ({
    profileName: line.profileCategory.name,
    days: hoursToDays(line.finalHours),
    hours: Math.round(line.finalHours * 10) / 10,
  }));

  try {
    await prisma.deliveryReport.update({
      where: { id: report.id },
      data: { aiDraftStatus: "generating" },
    });

    const { model, narrative } = await generatePvNarrative({
      contractCode: report.contract.code,
      contractName: report.contract.name,
      periodStart: pvData.periodStart,
      periodEnd: pvData.periodEnd,
      orderLetterTitle: pvData.orderLetterTitle,
      orderLetterReference: pvData.orderLetterReference,
      specificationCode: pvData.specificationCode,
      effort,
      taskNotes: taskNotesOverride || derivedNotes,
    });

    await prisma.deliveryReport.update({
      where: { id: report.id },
      data: {
        aiDraftStatus: "draft",
        aiDraftText: null,
        pvNarrativeJson: JSON.stringify(narrative),
        aiModel: model,
        aiGeneratedAt: new Date(),
      },
    });
  } catch (error) {
    await prisma.deliveryReport.update({
      where: { id: report.id },
      data: {
        aiDraftStatus: "failed",
        aiDraftText: error instanceof Error ? error.message : "AI-generatie is mislukt.",
      },
    });
  }

  revalidatePath(`/reports/${report.id}`);
}

export async function saveReportAiDraft(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");

  const deliverablesBullets = String(formData.get("deliverablesBullets") ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const orderLetterSentence = String(formData.get("orderLetterSentence") ?? "").trim();
  const transmissionSentence = String(formData.get("transmissionSentence") ?? "").trim();

  if (deliverablesBullets.length === 0) {
    throw new Error("De lijst 'Ter realisatie van' mag niet leeg zijn.");
  }

  const narrative: PvNarrative = {
    deliverablesBullets,
    orderLetterSentence,
    transmissionSentence,
  };

  await prisma.deliveryReport.update({
    where: { id: reportId },
    data: {
      pvNarrativeJson: JSON.stringify(narrative),
      aiDraftStatus: "approved",
      aiGeneratedAt: new Date(),
    },
  });

  revalidatePath(`/reports/${reportId}`);
}

export async function finalizePvInvoice(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");

  const report = await prisma.deliveryReport.findUnique({
    where: { id: reportId },
    include: {
      contract: { include: { profileRates: true } },
      simulation: { include: { lines: { include: { profileCategory: true } } } },
    },
  });

  if (!report) {
    throw new Error("Rapport niet gevonden.");
  }

  const pvData = parsePvData(report.pvDataJson);

  // Eenheidsprijzen: voorkeur voor de (mogelijk aangepaste) PV-gegevens, anders
  // de tarieven op contractniveau.
  const unitPriceByProfile: Record<string, number> = { ...pvData.unitPriceByProfile };
  for (const rate of report.contract.profileRates) {
    if (!Number.isFinite(unitPriceByProfile[rate.profileCategoryId])) {
      unitPriceByProfile[rate.profileCategoryId] = rate.unitPrice;
    }
  }

  const profileHours = report.simulation.lines
    .filter((line) => line.finalHours > 0)
    .map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      finalHours: line.finalHours,
    }));

  const vat = pvData.vatPercentage || report.contract.vatPercentage;
  const facturatie = buildPvFacturatie(profileHours, unitPriceByProfile, vat);

  const periodStart = pvData.periodStart ? new Date(pvData.periodStart) : null;
  const periodEnd = pvData.periodEnd ? new Date(pvData.periodEnd) : null;

  // Idempotent: één Invoice per PV (deliveryReportId is uniek). Zo telt deze PV
  // automatisch mee in "reeds gefactureerd" bij de volgende PV van het contract.
  await prisma.invoice.upsert({
    where: { deliveryReportId: report.id },
    create: {
      contractId: report.contractId,
      deliveryReportId: report.id,
      periodStart,
      periodEnd,
      amountExclVat: facturatie.totals.amountExclVat,
      vatAmount: facturatie.totals.vatAmount,
      amountInclVat: facturatie.totals.amountInclVat,
    },
    update: {
      periodStart,
      periodEnd,
      amountExclVat: facturatie.totals.amountExclVat,
      vatAmount: facturatie.totals.vatAmount,
      amountInclVat: facturatie.totals.amountInclVat,
    },
  });

  revalidatePath(`/reports/${report.id}`);
}

export async function savePvData(formData: FormData) {
  const reportId = String(formData.get("reportId") ?? "");

  const report = await prisma.deliveryReport.findUnique({
    where: { id: reportId },
    include: { simulation: { include: { lines: true } } },
  });

  if (!report) {
    throw new Error("Rapport niet gevonden.");
  }

  const existing = parsePvData(report.pvDataJson);

  const num = (key: string, fallback: number) => {
    const value = Number(formData.get(key));
    return Number.isFinite(value) ? value : fallback;
  };
  const str = (key: string, fallback: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : fallback;
  };

  const unitPriceByProfile: Record<string, number> = { ...existing.unitPriceByProfile };
  for (const line of report.simulation.lines) {
    const value = Number(formData.get(`unit-${line.profileCategoryId}`));
    if (Number.isFinite(value)) {
      unitPriceByProfile[line.profileCategoryId] = value;
    }
  }

  const pvData: PvData = {
    periodStart: str("periodStart", existing.periodStart),
    periodEnd: str("periodEnd", existing.periodEnd),
    vatPercentage: num("vatPercentage", existing.vatPercentage),
    alreadyInvoiced: num("alreadyInvoiced", existing.alreadyInvoiced),
    totalBudgetAmount: num("totalBudgetAmount", existing.totalBudgetAmount),
    specificationCode: str("specificationCode", existing.specificationCode),
    orderLetterTitle: str("orderLetterTitle", existing.orderLetterTitle),
    orderLetterReference: str("orderLetterReference", existing.orderLetterReference),
    date: str("date", existing.date),
    domainManagerName: str("domainManagerName", existing.domainManagerName),
    domainManagerRole: str("domainManagerRole", existing.domainManagerRole),
    domainManagerOrg: str("domainManagerOrg", existing.domainManagerOrg),
    projectLeadNames: str("projectLeadNames", existing.projectLeadNames),
    projectLeadOrg: str("projectLeadOrg", existing.projectLeadOrg),
    unitPriceByProfile,
  };

  await prisma.deliveryReport.update({
    where: { id: reportId },
    data: { pvDataJson: JSON.stringify(pvData) },
  });

  revalidatePath(`/reports/${reportId}`);
}

export async function suggestAllocation(formData: FormData) {
  const parsed = suggestAllocationFormSchema.parse({
    contractId: formData.get("contractId"),
    sourceText: formData.get("sourceText"),
  });

  let redirectTo: string;

  try {
    const contract = await prisma.contract.findUnique({
      where: { id: parsed.contractId },
    });

    if (!contract) {
      throw new Error("Contract niet gevonden.");
    }

    const knownProfiles = (
      await prisma.profileCategory.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      })
    ).map((profile) => ({ profileCategoryId: profile.id, profileName: profile.name }));

    if (knownProfiles.length === 0) {
      throw new Error("Er zijn geen actieve profielen om een verdeling over te maken.");
    }

    const comparableContractRows = await prisma.contract.findMany({
      where: { active: true, id: { not: parsed.contractId } },
      include: {
        allocationTemplates: {
          include: { profileCategory: true },
          orderBy: { targetPercentage: "desc" },
        },
      },
      orderBy: { code: "asc" },
    });

    const comparableContracts = comparableContractRows
      .filter((row) => row.allocationTemplates.length > 0)
      .map((row) => ({
        contractCode: row.code,
        allocations: row.allocationTemplates.map((line) => ({
          profileName: line.profileCategory.name,
          targetPercentage: line.targetPercentage,
        })),
      }));

    const { model, suggestion } = await suggestAllocationPercentages({
      contractCode: contract.code,
      contractName: contract.name,
      sourceText: parsed.sourceText,
      knownProfiles,
      comparableContracts,
    });

    const record = await prisma.allocationSuggestion.create({
      data: {
        contractId: parsed.contractId,
        sourceText: parsed.sourceText,
        suggestedJson: JSON.stringify(suggestion),
        model,
      },
    });

    redirectTo = `/simulations?suggestion=${record.id}`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI-voorstel genereren is mislukt.";
    redirectTo = `/simulations?suggestError=${encodeURIComponent(message)}`;
  }

  revalidatePath("/simulations");
  redirect(redirectTo);
}

const MAX_UPLOAD_BYTES = 18 * 1024 * 1024; // ~18MB, ruim onder de Gemini inline-limiet

function inferOfferUploadMimeType(file: File) {
  const fileName = file.name.toLowerCase();

  if (file.type === "application/pdf" || fileName.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.endsWith(".docx")
  ) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }

  if (file.type === "text/plain" || fileName.endsWith(".txt")) {
    return "text/plain";
  }

  throw new Error("Upload een PDF, DOCX of TXT-bestand.");
}

export async function extractAllocationFromFile(formData: FormData) {
  const contractId = String(formData.get("contractId") ?? "");
  const file = formData.get("file");

  let redirectTo: string;

  try {
    if (!contractId) {
      throw new Error("Kies eerst een contract.");
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Geen bestand geüpload.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("Bestand is te groot (max 18 MB).");
    }

    const contract = await prisma.contract.findUnique({ where: { id: contractId } });
    if (!contract) {
      throw new Error("Contract niet gevonden.");
    }

    const knownProfiles = (
      await prisma.profileCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    ).map((profile) => ({ profileCategoryId: profile.id, profileName: profile.name }));

    if (knownProfiles.length === 0) {
      throw new Error("Er zijn geen actieve profielen om een verdeling over te maken.");
    }

    const fileName = file.name.toLowerCase();
    const isPdf  = file.type === "application/pdf" || fileName.endsWith(".pdf");
    const isDocx =
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx");
    const isTxt  = file.type === "text/plain" || fileName.endsWith(".txt");

    if (!isPdf && !isDocx && !isTxt) {
      throw new Error("Upload een PDF, DOCX of TXT-bestand.");
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    let filePart: { mimeType: string; dataBase64: string } | undefined;
    let sourceText: string | undefined;

    if (isPdf) {
      filePart = { mimeType: "application/pdf", dataBase64: fileBuffer.toString("base64") };
    } else if (isDocx) {
      sourceText = await extractDocxText(fileBuffer);
    } else {
      // .txt
      sourceText = fileBuffer.toString("utf-8");
    }

    const { model, suggestion } = await extractOfferDetails({
      contractCode: contract.code,
      contractName: contract.name,
      knownProfiles,
      file: filePart,
      sourceText,
    });

    const record = await prisma.allocationSuggestion.create({
      data: {
        contractId,
        sourceText: `Geüpload bestand: ${file.name}`,
        suggestedJson: JSON.stringify(suggestion),
        model,
      },
    });

    redirectTo = `/simulations?suggestion=${record.id}`;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document uitlezen is mislukt.";
    redirectTo = `/simulations?suggestError=${encodeURIComponent(message)}`;
  }

  revalidatePath("/simulations");
  redirect(redirectTo);
}

export async function applyExtractedContractData(formData: FormData) {
  const suggestionId = String(formData.get("suggestionId") ?? "");

  const record = await prisma.allocationSuggestion.findUnique({ where: { id: suggestionId } });
  if (!record) {
    throw new Error("AI-voorstel niet gevonden.");
  }

  const suggestion = JSON.parse(record.suggestedJson) as AllocationSuggestion;
  const extracted = suggestion.extractedContract;
  if (!extracted) {
    throw new Error("Dit voorstel bevat geen contractgegevens om over te nemen.");
  }

  // Alleen niet-lege velden overschrijven; cijfers/tarieven blijven onaangeroerd.
  const data: Record<string, string> = {};
  if (extracted.orderLetterTitle) data.orderLetterTitle = extracted.orderLetterTitle;
  if (extracted.orderLetterReference) data.orderLetterReference = extracted.orderLetterReference;
  if (extracted.specificationCode) data.specificationCode = extracted.specificationCode;
  if (extracted.domainManagerName) data.domainManagerName = extracted.domainManagerName;
  if (extracted.projectLeadNames) data.projectLeadNames = extracted.projectLeadNames;

  if (Object.keys(data).length > 0) {
    await prisma.contract.update({ where: { id: record.contractId }, data });
  }

  revalidatePath("/simulations");
  revalidatePath("/admin");
  redirect(`/simulations?suggestion=${record.id}&applied=1`);
}

export async function acceptAllocationSuggestion(formData: FormData) {
  const parsed = acceptAllocationFormSchema.parse({
    suggestionId: formData.get("suggestionId"),
    inputTotalHours: formData.get("inputTotalHours"),
  });

  const record = await prisma.allocationSuggestion.findUnique({
    where: { id: parsed.suggestionId },
  });

  if (!record) {
    throw new Error("AI-voorstel niet gevonden.");
  }

  const suggestion = JSON.parse(record.suggestedJson) as AllocationSuggestion;

  // Lees per profiel de (mogelijk door de gebruiker aangepaste) percentages.
  const allocationLines: AllocationInput[] = suggestion.lines.map((line) => {
    const override = formData.get(`pct-${line.profileCategoryId}`);
    const overrideValue = typeof override === "string" ? Number(override) : NaN;
    return {
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileName,
      targetPercentage: Number.isFinite(overrideValue)
        ? overrideValue
        : line.suggestedPercentage,
    };
  });

  await prisma.allocationSuggestion.update({
    where: { id: record.id },
    data: { acceptedAt: new Date() },
  });

  // createSimulationProposal normaliseert de percentages en berekent de uren;
  // de AI levert hier enkel de bron van de targetPercentage-waarden.
  const simulation = await persistSimulation(
    record.contractId,
    parsed.inputTotalHours,
    allocationLines,
    "ai_suggestion",
  );

  revalidatePath("/simulations");
  redirect(`/simulations?selected=${simulation.id}`);
}
