import { describe, expect, it } from "vitest";
import { buildPvDocx } from "../../lib/domain/pv-docx";
import { extractDocxText } from "../../lib/domain/docx-text";

describe("PV Word-export", () => {
  it("plaatst beschrijvingen van toegevoegde documenten onder Ter realisatie van", async () => {
    const buffer = await buildPvDocx({
      contractCode: "AVSA24",
      contractName: "Jaarlijkse werklast",
      periodStart: "01/01/2026",
      periodEnd: "28/02/2026",
      orderLetterReference: "",
      bestelbon: "",
      financieleEmail: "",
      effort: [{ profileName: "Expert/Senior", days: 1 }],
      deliverables: [
        "Concept rapport ‘Administratieve lasten Pakjeswet’;",
        "Interne nota ‘Discrepantie tussen UBO- en KBO-register en risicobenadering profielen’;",
        "Doorlichting van het Vlaams Regelrecht-programma;",
      ],
      orderLetterSentence: "Alle opdrachten zijn uitgevoerd volgens de opdrachtbrief.",
      transmissionSentence: "De gepresteerde uren werden overgemaakt.",
      facturatie: {
        lines: [],
        totals: { hours: 0, days: 0, amountExclVat: 0, vatAmount: 0, amountInclVat: 0 },
      },
      alreadyInvoiced: 0,
      totalBudgetAmount: 0,
      date: "28/02/2026",
      domainManagerName: "Domeinmanager",
      domainManagerRole: "Domeinmanager",
      domainManagerOrg: "FOD BOSA",
      projectLeadNames: "Projectleider",
      projectLeadRole: "Projectleider(s)",
      projectLeadOrg: "FOD BOSA",
    });

    const text = await extractDocxText(buffer);
    const headingIndex = text.indexOf("Ter realisatie van:");
    expect(headingIndex).toBeGreaterThan(-1);
    expect(text.indexOf("Administratieve lasten Pakjeswet", headingIndex)).toBeGreaterThan(headingIndex);
    expect(text.indexOf("Discrepantie tussen UBO- en KBO-register", headingIndex)).toBeGreaterThan(headingIndex);
    expect(text.indexOf("Vlaams Regelrecht-programma", headingIndex)).toBeGreaterThan(headingIndex);
  });
});
