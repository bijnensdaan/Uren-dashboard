/**
 * Importeert de data uit prisma/postgres/data-export.json (gemaakt met
 * `npm run db:export`) in de dán actieve database, met behoud van de
 * originele id's.
 *
 * Gebruik: npm run db:import
 *
 * LET OP: dit script draait tegen de dán actieve Prisma-client. Het is
 * bedoeld als stap 6 van de PostgreSQL-migratie (zie docs/POSTGRES_MIGRATIE.md):
 * pas draaien NADAT je bent omgeschakeld naar PostgreSQL (provider aangepast,
 * DATABASE_URL naar postgres, `npx prisma generate` en `npm run db:pg:deploy`
 * gedraaid). Zolang de app op SQLite draait, hoort dit script niet gedraaid
 * te worden; het kan dan ook pas ná de omschakeling live getest worden.
 *
 * De tabellen worden in dependency-volgorde gevuld zodat foreign keys kloppen:
 * ProfileCategory → Employee → Contract → Task → ProfileRate →
 * ContractAllocationTemplate → TimeEntry → Simulation → SimulationLine →
 * AllocationSuggestion → DeliveryReport → Invoice → ProjectPlan → Document.
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const EXPORT_PATH = path.join(process.cwd(), "prisma", "postgres", "data-export.json");

/**
 * Zet ISO-datumstrings uit de JSON-export om naar Date-objecten.
 * De export is untyped JSON; de rijen worden 1-op-1 doorgegeven aan
 * Prisma's createMany, dat de velden zelf valideert.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function reviveDates(rows: Array<Record<string, unknown>>, dateFields: string[]): any[] {
  return rows.map((row) => {
    const copy: Record<string, unknown> = { ...row };
    for (const field of dateFields) {
      const value = copy[field];
      if (typeof value === "string") {
        copy[field] = new Date(value);
      }
    }
    return copy;
  });
}

async function main() {
  if (!existsSync(EXPORT_PATH)) {
    throw new Error(
      `Exportbestand niet gevonden: ${EXPORT_PATH}. Draai eerst \`npm run db:export\` (vóór de omschakeling).`
    );
  }

  const payload = JSON.parse(readFileSync(EXPORT_PATH, "utf8"));
  const data = payload.data;
  console.log(`Import van export gemaakt op ${payload.meta?.exportedAt ?? "(onbekend)"}`);

  // Veiligheidscheck: importeer alleen in een lege database, anders botsen
  // unieke velden en id's. Leegmaken kan met `npm run db:pg:deploy` op een
  // verse database (of handmatig TRUNCATE).
  const existing = await prisma.profileCategory.count();
  if (existing > 0) {
    throw new Error(
      "De doel-database is niet leeg. Importeer alleen in een verse database (direct na `npm run db:pg:deploy`)."
    );
  }

  // Dependency-volgorde: eerst tabellen zonder verwijzingen, daarna de rest.
  const steps: Array<{ name: string; run: () => Promise<{ count: number }> }> = [
    {
      name: "ProfileCategory",
      run: () => prisma.profileCategory.createMany({ data: data.profileCategories }),
    },
    {
      name: "Employee",
      run: () => prisma.employee.createMany({ data: data.employees }),
    },
    {
      name: "Contract",
      run: () =>
        prisma.contract.createMany({
          data: reviveDates(data.contracts, ["startDate", "endDate", "aiInsightsAt"]),
        }),
    },
    {
      name: "Task",
      run: () => prisma.task.createMany({ data: data.tasks }),
    },
    {
      name: "ProfileRate",
      run: () => prisma.profileRate.createMany({ data: data.profileRates }),
    },
    {
      name: "ContractAllocationTemplate",
      run: () =>
        prisma.contractAllocationTemplate.createMany({ data: data.contractAllocationTemplates }),
    },
    {
      name: "TimeEntry",
      run: () =>
        prisma.timeEntry.createMany({
          data: reviveDates(data.timeEntries, ["date", "createdAt"]),
        }),
    },
    {
      name: "Simulation",
      run: () =>
        prisma.simulation.createMany({
          data: reviveDates(data.simulations, ["createdAt"]),
        }),
    },
    {
      name: "SimulationLine",
      run: () => prisma.simulationLine.createMany({ data: data.simulationLines }),
    },
    {
      name: "AllocationSuggestion",
      run: () =>
        prisma.allocationSuggestion.createMany({
          data: reviveDates(data.allocationSuggestions, ["createdAt", "acceptedAt"]),
        }),
    },
    {
      name: "DeliveryReport",
      run: () =>
        prisma.deliveryReport.createMany({
          data: reviveDates(data.deliveryReports, ["generatedAt", "aiGeneratedAt"]),
        }),
    },
    {
      name: "Invoice",
      run: () =>
        prisma.invoice.createMany({
          data: reviveDates(data.invoices, ["periodStart", "periodEnd", "createdAt"]),
        }),
    },
    {
      name: "ProjectPlan",
      run: () =>
        prisma.projectPlan.createMany({
          data: reviveDates(data.projectPlans, ["createdAt", "approvedAt"]),
        }),
    },
    {
      name: "Document",
      run: () =>
        prisma.document.createMany({
          data: reviveDates(data.documents, ["uploadedAt"]),
        }),
    },
  ];

  for (const step of steps) {
    const result = await step.run();
    console.log(`  ${step.name}: ${result.count} rijen geïmporteerd`);
  }

  console.log("Import afgerond.");
}

main()
  .catch((error) => {
    console.error("Import mislukt:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
