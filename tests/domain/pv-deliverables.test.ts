import { describe, expect, it } from "vitest";
import {
  descriptionFromFileName,
  mergePvDeliverables,
  pvDocumentDescriptions,
} from "../../lib/domain/pv-deliverables";

describe("pvDocumentDescriptions", () => {
  it("neemt de opdrachtbrief zelf nooit op als realisatie", () => {
    expect(
      pvDocumentDescriptions([
        { fileName: "Opdrachtbrief.docx", kind: "opdrachtbrief", description: "Jaarlijkse werklast" },
      ]),
    ).toEqual([]);
  });

  it("neemt de PV-beschrijving van projecten en rapporten over", () => {
    expect(
      pvDocumentDescriptions([
        {
          fileName: "SKM_Analyse_Pakjeswet_FINAAL_21 Jan 2026.pdf",
          kind: "rapport",
          description: "Concept rapport ‘Administratieve lasten Pakjeswet’",
        },
      ]),
    ).toEqual(["Concept rapport ‘Administratieve lasten Pakjeswet’"]);
  });

  it("maakt voor oude records zonder beschrijving een leesbare terugvaltekst", () => {
    expect(descriptionFromFileName("N2024 08 01_Nota_Pseudonimisatie.pdf")).toBe("Nota Pseudonimisatie");
    expect(descriptionFromFileName("Rapport_Regelrecht_VF.docx")).toBe("Rapport Regelrecht");
  });
});

describe("mergePvDeliverables", () => {
  it("verwijdert doublures die alleen in leestekens verschillen", () => {
    expect(
      mergePvDeliverables(
        ["Interne nota “Discrepantie tussen UBO- en KBO-register”;"],
        ["Interne nota Discrepantie tussen UBO- en KBO-register"],
      ),
    ).toEqual(["Interne nota “Discrepantie tussen UBO- en KBO-register”;"]);
  });
});
