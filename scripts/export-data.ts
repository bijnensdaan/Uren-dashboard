/**
 * Exporteert ALLE data uit de actieve database naar één JSON-bestand:
 * prisma/postgres/data-export.json
 *
 * Gebruik: npm run db:export
 *
 * Dit script draait tegen de dán actieve Prisma-client (nu: SQLite).
 * Het is stap 3 van de PostgreSQL-migratie (zie docs/POSTGRES_MIGRATIE.md):
 * draai dit VÓÓR de omschakeling om de data veilig te stellen, en zet de
 * data daarna terug met `npm run db:import`.
 *
 * Het exportbestand bevat bedrijfsgegevens en staat daarom in .gitignore.
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const EXPORT_PATH = path.join(process.cwd(), "prisma", "postgres", "data-export.json");

async function main() {
  // Volgorde is bij export niet kritisch (alles komt in één JSON),
  // maar we hanteren dezelfde dependency-volgorde als de import voor leesbaarheid.
  const [
    profileCategories,
    employees,
    contracts,
    tasks,
    profileRates,
    contractAllocationTemplates,
    timeEntries,
    simulations,
    simulationLines,
    allocationSuggestions,
    deliveryReports,
    invoices,
    projectPlans,
    documents,
  ] = await Promise.all([
    prisma.profileCategory.findMany(),
    prisma.employee.findMany(),
    prisma.contract.findMany(),
    prisma.task.findMany(),
    prisma.profileRate.findMany(),
    prisma.contractAllocationTemplate.findMany(),
    prisma.timeEntry.findMany(),
    prisma.simulation.findMany(),
    prisma.simulationLine.findMany(),
    prisma.allocationSuggestion.findMany(),
    prisma.deliveryReport.findMany(),
    prisma.invoice.findMany(),
    prisma.projectPlan.findMany(),
    prisma.document.findMany(),
  ]);

  const payload = {
    meta: {
      exportedAt: new Date().toISOString(),
      databaseUrl: process.env.DATABASE_URL ?? "(onbekend)",
      counts: {
        profileCategories: profileCategories.length,
        employees: employees.length,
        contracts: contracts.length,
        tasks: tasks.length,
        profileRates: profileRates.length,
        contractAllocationTemplates: contractAllocationTemplates.length,
        timeEntries: timeEntries.length,
        simulations: simulations.length,
        simulationLines: simulationLines.length,
        allocationSuggestions: allocationSuggestions.length,
        deliveryReports: deliveryReports.length,
        invoices: invoices.length,
        projectPlans: projectPlans.length,
        documents: documents.length,
      },
    },
    data: {
      profileCategories,
      employees,
      contracts,
      tasks,
      profileRates,
      contractAllocationTemplates,
      timeEntries,
      simulations,
      simulationLines,
      allocationSuggestions,
      deliveryReports,
      invoices,
      projectPlans,
      documents,
    },
  };

  mkdirSync(path.dirname(EXPORT_PATH), { recursive: true });
  // Date-objecten worden door JSON.stringify als ISO-strings geschreven;
  // het importscript zet ze weer om naar Date.
  writeFileSync(EXPORT_PATH, JSON.stringify(payload, null, 2), "utf8");

  console.log(`Export geschreven naar ${EXPORT_PATH}`);
  console.table(payload.meta.counts);
}

main()
  .catch((error) => {
    console.error("Export mislukt:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
