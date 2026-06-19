import {
  calculateContractSummary,
  calculateProfileActuals,
  getStatusLabel,
} from "./calculations";

export type AiReportDraft = {
  managementSummary: string;
  risks: string[];
  deviationExplanation: string;
  deliveryText: string;
  followUpActions: string[];
};

type ReportSnapshotInput = {
  reportId: string;
  contract: {
    code: string;
    name: string;
    totalBudgetHours: number;
    warningThreshold: number;
    criticalThreshold: number;
    timeEntries: Array<{
      hours: number;
      profileCategoryId: string;
      task: { name: string };
      profileCategory: { name: string };
    }>;
    allocationTemplates: Array<{
      profileCategoryId: string;
      targetPercentage: number;
      profileCategory: { name: string };
    }>;
  };
  simulation: {
    inputTotalHours: number;
    status: string;
    lines: Array<{
      proposedHours: number;
      finalHours: number;
      targetPercentage: number;
      profileCategory: { name: string };
    }>;
  };
};

export function buildAiReportSnapshot(input: ReportSnapshotInput) {
  const summary = calculateContractSummary({
    budgetHours: input.contract.totalBudgetHours,
    entries: input.contract.timeEntries,
    warningThreshold: input.contract.warningThreshold,
    criticalThreshold: input.contract.criticalThreshold,
  });
  const profileActuals = calculateProfileActuals(
    input.contract.timeEntries,
    input.contract.allocationTemplates.map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      targetPercentage: line.targetPercentage,
    })),
  );
  const taskTotals = input.contract.timeEntries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.task.name] = Math.round(((acc[entry.task.name] ?? 0) + entry.hours) * 10) / 10;
    return acc;
  }, {});

  return {
    reportId: input.reportId,
    contract: {
      code: input.contract.code,
      name: input.contract.name,
      budgetHours: input.contract.totalBudgetHours,
      performedHours: summary.totalHours,
      remainingHours: summary.remainingHours,
      usagePercentage: summary.usagePercentage,
      budgetStatus: getStatusLabel(summary.status),
    },
    profileActuals: profileActuals.map((profile) => ({
      profile: profile.profileName,
      targetPercentage: profile.targetPercentage,
      actualPercentage: profile.actualPercentage,
      actualHours: profile.actualHours,
      deviationPercentage: profile.deviation,
      needsAttention: profile.isDeviation,
    })),
    taskTotals,
    simulation: {
      inputTotalHours: input.simulation.inputTotalHours,
      status: input.simulation.status,
      lines: input.simulation.lines.map((line) => ({
        profile: line.profileCategory.name,
        targetPercentage: line.targetPercentage,
        proposedHours: line.proposedHours,
        finalHours: line.finalHours,
      })),
    },
  };
}

function renderDraft(draft: AiReportDraft) {
  return [
    "Managementsamenvatting",
    draft.managementSummary,
    "",
    "Risico's en aandachtspunten",
    ...draft.risks.map((risk) => `- ${risk}`),
    "",
    "Toelichting profielafwijkingen",
    draft.deviationExplanation,
    "",
    "Voorsteltekst PV",
    draft.deliveryText,
    "",
    "Aanbevolen opvolging",
    ...draft.followUpActions.map((action) => `- ${action}`),
  ].join("\n");
}

export async function generateAiReportDraft(snapshot: unknown) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-5.5";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ontbreekt. Voeg deze toe aan je lokale environment om AI-concepten te genereren.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions:
        "Je schrijft Nederlandstalige conceptteksten voor interne PV's en contractrapporten. Gebruik uitsluitend de aangeleverde cijfers. Verzin geen uren, percentages, datums of statussen. Formuleer zakelijk, compact en actiegericht.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Genereer een concept voor dit PV/rapport op basis van deze gevalideerde data:\n${JSON.stringify(
                snapshot,
                null,
                2,
              )}`,
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "delivery_report_draft",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              managementSummary: { type: "string" },
              risks: {
                type: "array",
                items: { type: "string" },
              },
              deviationExplanation: { type: "string" },
              deliveryText: { type: "string" },
              followUpActions: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "managementSummary",
              "risks",
              "deviationExplanation",
              "deliveryText",
              "followUpActions",
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI response failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = data.output_text ?? data.output?.[0]?.content?.[0]?.text;

  if (!text) {
    throw new Error("OpenAI response bevatte geen bruikbare concepttekst.");
  }

  const draft = JSON.parse(text) as AiReportDraft;

  return {
    model,
    draft,
    renderedText: renderDraft(draft),
  };
}
