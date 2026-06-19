import { prisma } from "../lib/db";

const statements = [
  `PRAGMA foreign_keys = OFF`,
  `DROP TABLE IF EXISTS "Invoice"`,
  `DROP TABLE IF EXISTS "AllocationSuggestion"`,
  `DROP TABLE IF EXISTS "ProfileRate"`,
  `DROP TABLE IF EXISTS "DeliveryReport"`,
  `DROP TABLE IF EXISTS "SimulationLine"`,
  `DROP TABLE IF EXISTS "Simulation"`,
  `DROP TABLE IF EXISTS "TimeEntry"`,
  `DROP TABLE IF EXISTS "ContractAllocationTemplate"`,
  `DROP TABLE IF EXISTS "Task"`,
  `DROP TABLE IF EXISTS "Employee"`,
  `DROP TABLE IF EXISTS "Contract"`,
  `DROP TABLE IF EXISTS "ProfileCategory"`,
  `PRAGMA foreign_keys = ON`,
  `CREATE TABLE "ProfileCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "defaultAllocationPercentage" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true
  )`,
  `CREATE UNIQUE INDEX "ProfileCategory_name_key" ON "ProfileCategory"("name")`,
  `CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Employee_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX "Employee_profileCategoryId_idx" ON "Employee"("profileCategoryId")`,
  `CREATE TABLE "Contract" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalBudgetHours" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "warningThreshold" REAL NOT NULL DEFAULT 85,
    "criticalThreshold" REAL NOT NULL DEFAULT 95,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vatPercentage" REAL NOT NULL DEFAULT 21,
    "totalBudgetAmount" REAL,
    "specificationCode" TEXT,
    "orderLetterTitle" TEXT,
    "orderLetterReference" TEXT,
    "domainManagerName" TEXT,
    "domainManagerRole" TEXT,
    "domainManagerOrg" TEXT,
    "projectLeadNames" TEXT,
    "projectLeadOrg" TEXT
  )`,
  `CREATE UNIQUE INDEX "Contract_code_key" ON "Contract"("code")`,
  `CREATE INDEX "Contract_active_idx" ON "Contract"("active")`,
  `CREATE TABLE "ProfileRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "unitPrice" REAL NOT NULL,
    CONSTRAINT "ProfileRate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProfileRate_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "ProfileRate_contractId_profileCategoryId_key" ON "ProfileRate"("contractId", "profileCategoryId")`,
  `CREATE INDEX "ProfileRate_profileCategoryId_idx" ON "ProfileRate"("profileCategoryId")`,
  `CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Task_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "Task_contractId_name_key" ON "Task"("contractId", "name")`,
  `CREATE INDEX "Task_contractId_idx" ON "Task"("contractId")`,
  `CREATE TABLE "ContractAllocationTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "targetPercentage" REAL NOT NULL,
    CONSTRAINT "ContractAllocationTemplate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ContractAllocationTemplate_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "ContractAllocationTemplate_contractId_profileCategoryId_key" ON "ContractAllocationTemplate"("contractId", "profileCategoryId")`,
  `CREATE INDEX "ContractAllocationTemplate_profileCategoryId_idx" ON "ContractAllocationTemplate"("profileCategoryId")`,
  `CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "hours" REAL NOT NULL,
    "taskId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX "TimeEntry_contractId_date_idx" ON "TimeEntry"("contractId", "date")`,
  `CREATE INDEX "TimeEntry_taskId_idx" ON "TimeEntry"("taskId")`,
  `CREATE INDEX "TimeEntry_employeeId_idx" ON "TimeEntry"("employeeId")`,
  `CREATE INDEX "TimeEntry_profileCategoryId_idx" ON "TimeEntry"("profileCategoryId")`,
  `CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "inputTotalHours" REAL NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Simulation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE INDEX "Simulation_contractId_idx" ON "Simulation"("contractId")`,
  `CREATE TABLE "SimulationLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "proposedHours" REAL NOT NULL,
    "adjustedHours" REAL,
    "finalHours" REAL NOT NULL,
    "targetPercentage" REAL NOT NULL,
    CONSTRAINT "SimulationLine_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SimulationLine_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "SimulationLine_simulationId_profileCategoryId_key" ON "SimulationLine"("simulationId", "profileCategoryId")`,
  `CREATE INDEX "SimulationLine_profileCategoryId_idx" ON "SimulationLine"("profileCategoryId")`,
  `CREATE TABLE "DeliveryReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "htmlContent" TEXT NOT NULL,
    "aiDraftStatus" TEXT NOT NULL DEFAULT 'not_requested',
    "aiDraftText" TEXT,
    "aiModel" TEXT,
    "aiGeneratedAt" DATETIME,
    "aiSourceSnapshot" TEXT,
    "pvNarrativeJson" TEXT,
    "pvDataJson" TEXT,
    CONSTRAINT "DeliveryReport_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReport_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "DeliveryReport_simulationId_key" ON "DeliveryReport"("simulationId")`,
  `CREATE INDEX "DeliveryReport_contractId_idx" ON "DeliveryReport"("contractId")`,
  `CREATE TABLE "AllocationSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "suggestedJson" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" DATETIME,
    CONSTRAINT "AllocationSuggestion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX "AllocationSuggestion_contractId_idx" ON "AllocationSuggestion"("contractId")`,
  `CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contractId" TEXT NOT NULL,
    "deliveryReportId" TEXT NOT NULL,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "amountExclVat" REAL NOT NULL,
    "vatAmount" REAL NOT NULL,
    "amountInclVat" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_deliveryReportId_fkey" FOREIGN KEY ("deliveryReportId") REFERENCES "DeliveryReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX "Invoice_deliveryReportId_key" ON "Invoice"("deliveryReportId")`,
  `CREATE INDEX "Invoice_contractId_idx" ON "Invoice"("contractId")`,
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

main()
  .then(async () => {
    console.log("sqlite-schema-ready");
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
