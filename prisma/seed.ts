import { PrismaClient } from "@prisma/client";
import { createSimulationProposal } from "../lib/domain/simulation";
import { buildDeliveryReportHtml } from "../lib/domain/report";

const prisma = new PrismaClient();

async function main() {
  await prisma.invoice.deleteMany();
  await prisma.allocationSuggestion.deleteMany();
  await prisma.deliveryReport.deleteMany();
  await prisma.simulationLine.deleteMany();
  await prisma.simulation.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.contractAllocationTemplate.deleteMany();
  await prisma.profileRate.deleteMany();
  await prisma.task.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.contract.deleteMany();
  await prisma.profileCategory.deleteMany();

  const manager = await prisma.profileCategory.create({
    data: { name: "Manager", defaultAllocationPercentage: 3 },
  });
  const senior = await prisma.profileCategory.create({
    data: { name: "Expert/Senior", defaultAllocationPercentage: 31 },
  });
  const junior = await prisma.profileCategory.create({
    data: { name: "Junior", defaultAllocationPercentage: 66 },
  });

  const employees = await Promise.all([
    prisma.employee.create({ data: { name: "Theo Vermeulen", profileCategoryId: manager.id } }),
    prisma.employee.create({ data: { name: "Sara Peeters", profileCategoryId: senior.id } }),
    prisma.employee.create({ data: { name: "Milan De Smet", profileCategoryId: senior.id } }),
    prisma.employee.create({ data: { name: "Noah Janssens", profileCategoryId: junior.id } }),
    prisma.employee.create({ data: { name: "Emma Claes", profileCategoryId: junior.id } }),
  ]);

  const contracts = await Promise.all([
    prisma.contract.create({
      data: {
        code: "C-2026-001",
        name: "Digitaal loket optimalisatie",
        totalBudgetHours: 480,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        vatPercentage: 21,
        totalBudgetAmount: 339644.9,
        specificationCode: "AVSA24",
        orderLetterTitle: "AVSA24: jaarlijkse werklast",
        orderLetterReference: "2025-02",
        domainManagerName: "Manu Breynaert",
        domainManagerRole: "Domeinmanager",
        domainManagerOrg: "FOD Beleid & Ondersteuning\nDG Vereenvoudiging & Digitalisering",
        projectLeadNames: "Lies Segerink - Nick De Meyst",
        projectLeadOrg: "FOD Beleid & Ondersteuning\nDG Vereenvoudiging & Digitalisering",
      },
    }),
    prisma.contract.create({
      data: {
        code: "C-2026-014",
        name: "Datawarehouse rapportering",
        totalBudgetHours: 320,
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-10-31"),
      },
    }),
    prisma.contract.create({
      data: {
        code: "C-2026-022",
        name: "Procesautomatisatie HR",
        totalBudgetHours: 220,
        startDate: new Date("2026-03-01"),
        endDate: new Date("2026-09-30"),
      },
    }),
  ]);

  for (const contract of contracts) {
    await prisma.contractAllocationTemplate.createMany({
      data: [
        { contractId: contract.id, profileCategoryId: manager.id, targetPercentage: 3 },
        { contractId: contract.id, profileCategoryId: senior.id, targetPercentage: 31 },
        { contractId: contract.id, profileCategoryId: junior.id, targetPercentage: 66 },
      ],
    });
    // Demo-eenheidsprijzen per profiel (excl. btw, per uur) zodat de PV-facturatie
    // automatisch ingevuld is. Waarden zoals in de AVSA24-referentiebestanden.
    await prisma.profileRate.createMany({
      data: [
        { contractId: contract.id, profileCategoryId: manager.id, unitPrice: 154.13 },
        { contractId: contract.id, profileCategoryId: senior.id, unitPrice: 126.61 },
        { contractId: contract.id, profileCategoryId: junior.id, unitPrice: 82.57 },
      ],
    });
  }

  const taskData = [
    ["Analyse", "Implementatie", "Projectopvolging"],
    ["Datamodellering", "Dashboarding", "Validatie"],
    ["Procesanalyse", "Automatisatie", "Nazorg"],
  ];

  const tasks = [];
  for (const [index, contract] of contracts.entries()) {
    for (const name of taskData[index]) {
      tasks.push(await prisma.task.create({ data: { name, contractId: contract.id } }));
    }
  }

  const employeeByName = Object.fromEntries(employees.map((employee) => [employee.name, employee]));
  const taskByName = Object.fromEntries(tasks.map((task) => [`${task.contractId}:${task.name}`, task]));
  const profileByName = {
    Manager: manager,
    "Expert/Senior": senior,
    Junior: junior,
  };

  const rows = [
    ["C-2026-001", "Analyse", "Sara Peeters", "Expert/Senior", "2026-05-04", 38],
    ["C-2026-001", "Implementatie", "Noah Janssens", "Junior", "2026-05-11", 121.6],
    ["C-2026-001", "Implementatie", "Emma Claes", "Junior", "2026-05-18", 98.8],
    ["C-2026-001", "Projectopvolging", "Theo Vermeulen", "Manager", "2026-06-01", 15.2],
    ["C-2026-001", "Analyse", "Milan De Smet", "Expert/Senior", "2026-06-08", 53.2],
    ["C-2026-014", "Datamodellering", "Sara Peeters", "Expert/Senior", "2026-04-06", 83.6],
    ["C-2026-014", "Dashboarding", "Noah Janssens", "Junior", "2026-04-13", 95],
    ["C-2026-014", "Validatie", "Milan De Smet", "Expert/Senior", "2026-05-04", 57],
    ["C-2026-014", "Projectopvolging", "Theo Vermeulen", "Manager", "2026-05-18", 38],
    ["C-2026-022", "Procesanalyse", "Sara Peeters", "Expert/Senior", "2026-04-20", 72.2],
    ["C-2026-022", "Automatisatie", "Noah Janssens", "Junior", "2026-05-04", 83.6],
    ["C-2026-022", "Automatisatie", "Emma Claes", "Junior", "2026-05-18", 45.6],
    ["C-2026-022", "Nazorg", "Theo Vermeulen", "Manager", "2026-06-08", 15.2],
  ] as const;

  for (const [contractCode, taskName, employeeName, profileName, date, hours] of rows) {
    const contract = contracts.find((item) => item.code === contractCode);
    if (!contract) {
      continue;
    }

    await prisma.timeEntry.create({
      data: {
        employeeId: employeeByName[employeeName].id,
        contractId: contract.id,
        taskId: taskByName[`${contract.id}:${taskName}`]?.id ?? tasks.find((task) => task.contractId === contract.id)!.id,
        profileCategoryId: profileByName[profileName].id,
        date: new Date(date),
        hours,
        notes: "Demo seed data",
      },
    });
  }

  const contract = contracts[0];
  const allocations = await prisma.contractAllocationTemplate.findMany({
    where: { contractId: contract.id },
    include: { profileCategory: true },
    orderBy: { targetPercentage: "asc" },
  });
  const proposal = createSimulationProposal(
    contract.totalBudgetHours,
    allocations.map((line) => ({
      profileCategoryId: line.profileCategoryId,
      profileName: line.profileCategory.name,
      targetPercentage: line.targetPercentage,
    })),
  );

  const simulation = await prisma.simulation.create({
    data: {
      contractId: contract.id,
      inputTotalHours: contract.totalBudgetHours,
      sourceType: "manual",
      status: "approved",
      lines: {
        create: proposal.map((line) => ({
          profileCategoryId: line.profileCategoryId,
          proposedHours: line.proposedHours,
          finalHours: line.finalHours,
          targetPercentage: line.targetPercentage,
        })),
      },
    },
    include: { lines: { include: { profileCategory: true } }, contract: true },
  });

  await prisma.deliveryReport.create({
    data: {
      simulationId: simulation.id,
      contractId: contract.id,
      htmlContent: buildDeliveryReportHtml({
        contractCode: simulation.contract.code,
        contractName: simulation.contract.name,
        generatedAt: new Date(),
        inputTotalHours: simulation.inputTotalHours,
        lines: simulation.lines.map((line) => ({
          profileName: line.profileCategory.name,
          targetPercentage: line.targetPercentage,
          finalHours: line.finalHours,
        })),
      }),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
