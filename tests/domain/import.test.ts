import { describe, expect, it } from "vitest";
import { inferColumnMapping, parseCsv, validateImportRows } from "../../lib/domain/import";

const referenceData = {
  employees: [{ id: "employee-1", name: "Sara Peeters", profileCategoryId: "profile-senior" }],
  contracts: [{ id: "contract-1", code: "C-2026-001" }],
  tasks: [{ id: "task-1", name: "Analyse", contractId: "contract-1" }],
  profiles: [{ id: "profile-senior", name: "Expert/Senior" }],
  existingEntries: [],
};

describe("parseCsv en inferColumnMapping", () => {
  it("herkent Nederlandse kolomkoppen", () => {
    const parsed = parseCsv(
      ["medewerker,datum,uren,taak,contract,profiel,opmerkingen", "Sara Peeters,2026-06-01,7.6,Analyse,C-2026-001,Expert/Senior,ok"].join("\n"),
    );
    const mapping = inferColumnMapping(parsed.columns);

    expect(mapping.employee).toBe("medewerker");
    expect(mapping.date).toBe("datum");
    expect(mapping.hours).toBe("uren");
    expect(mapping.task).toBe("taak");
    expect(mapping.contract).toBe("contract");
    expect(mapping.profile).toBe("profiel");
    expect(mapping.notes).toBe("opmerkingen");
  });
});

describe("validateImportRows", () => {
  function validate(dataLines: string[]) {
    const parsed = parseCsv(
      ["medewerker,datum,uren,taak,contract,profiel,opmerkingen", ...dataLines].join("\n"),
    );
    const mapping = inferColumnMapping(parsed.columns);
    return validateImportRows(parsed.rows, mapping, referenceData);
  }

  it("keurt een geldige rij goed en normaliseert de waarden", () => {
    const result = validate(["Sara Peeters,2026-06-01,7.6,Analyse,C-2026-001,Expert/Senior,ok"]);

    expect(result.totalRows).toBe(1);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(0);
    expect(result.rows[0].status).toBe("valid");
    expect(result.rows[0].errors).toEqual([]);
    expect(result.rows[0].normalized).toMatchObject({
      employeeId: "employee-1",
      contractId: "contract-1",
      taskId: "task-1",
      profileCategoryId: "profile-senior",
      date: "2026-06-01",
      hours: 7.6,
    });
  });

  it("wijst een rij met onbekende medewerker af, met veld en reden", () => {
    const result = validate(["Onbekend,2026-06-02,3.8,Analyse,C-2026-001,Expert/Senior,fout"]);

    expect(result.invalidRows).toBe(1);
    expect(result.rows[0].status).toBe("invalid");
    expect(result.rows[0].errors.some((error) => error.includes("Medewerker niet gevonden: Onbekend"))).toBe(true);
  });

  it("wijst een rij met ontbrekende uren af, met veldnaam in de fout", () => {
    const result = validate(["Sara Peeters,2026-06-01,,Analyse,C-2026-001,Expert/Senior,leeg"]);

    expect(result.invalidRows).toBe(1);
    expect(result.rows[0].errors).toContain("hours: Uren ontbreken");
  });

  it("wijst een rij met ongeldige datum en ongeldige uren af", () => {
    const result = validate(["Sara Peeters,geen-datum,nul,Analyse,C-2026-001,Expert/Senior,fout"]);

    expect(result.rows[0].status).toBe("invalid");
    expect(result.rows[0].errors.some((error) => error.includes("Ongeldige datum"))).toBe(true);
    expect(result.rows[0].errors.some((error) => error.includes("Ongeldig aantal uren"))).toBe(true);
  });

  it("telt duplicaten binnen het importbestand", () => {
    const result = validate([
      "Sara Peeters,2026-06-01,7.6,Analyse,C-2026-001,Expert/Senior,ok",
      "Sara Peeters,2026-06-01,7.6,Analyse,C-2026-001,Expert/Senior,dubbel",
      "Onbekend,2026-06-02,3.8,Analyse,C-2026-001,Expert/Senior,fout",
    ]);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(1);
    expect(result.invalidRows).toBe(2);
    expect(result.duplicateRows).toBe(1);
    expect(result.rows[1].errors.some((error) => error.includes("Duplicaat binnen importbestand"))).toBe(true);
  });

  it("telt duplicaten van bestaande time entries", () => {
    const parsed = parseCsv(
      [
        "medewerker,datum,uren,taak,contract,profiel,opmerkingen",
        "Sara Peeters,2026-06-01,7.6,Analyse,C-2026-001,Expert/Senior,ok",
      ].join("\n"),
    );
    const mapping = inferColumnMapping(parsed.columns);
    const result = validateImportRows(parsed.rows, mapping, {
      ...referenceData,
      existingEntries: [
        {
          employeeId: "employee-1",
          contractId: "contract-1",
          taskId: "task-1",
          profileCategoryId: "profile-senior",
          date: "2026-06-01",
          hours: 7.6,
        },
      ],
    });

    expect(result.duplicateRows).toBe(1);
    expect(result.rows[0].errors.some((error) => error.includes("Duplicaat van bestaande time entry"))).toBe(true);
  });
});
