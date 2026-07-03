-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "weeklyCapacityHours" DOUBLE PRECISION NOT NULL DEFAULT 40,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultAllocationPercentage" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProfileCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileRate" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ProfileRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalBudgetHours" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "warningThreshold" DOUBLE PRECISION NOT NULL DEFAULT 85,
    "criticalThreshold" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "vatPercentage" DOUBLE PRECISION NOT NULL DEFAULT 21,
    "totalBudgetAmount" DOUBLE PRECISION,
    "specificationCode" TEXT,
    "orderLetterTitle" TEXT,
    "orderLetterReference" TEXT,
    "domainManagerName" TEXT,
    "domainManagerRole" TEXT,
    "domainManagerOrg" TEXT,
    "projectLeadNames" TEXT,
    "projectLeadOrg" TEXT,
    "aiInsightsJson" TEXT,
    "aiInsightsStatus" TEXT NOT NULL DEFAULT 'none',
    "aiInsightsModel" TEXT,
    "aiInsightsAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DOUBLE PRECISION NOT NULL,
    "taskId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "notes" TEXT,
    "clockIn" TEXT,
    "clockOut" TEXT,
    "pauseMinutes" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAllocationTemplate" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "targetPercentage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ContractAllocationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "inputTotalHours" DOUBLE PRECISION NOT NULL,
    "sourceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Simulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SimulationLine" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "profileCategoryId" TEXT NOT NULL,
    "proposedHours" DOUBLE PRECISION NOT NULL,
    "adjustedHours" DOUBLE PRECISION,
    "finalHours" DOUBLE PRECISION NOT NULL,
    "targetPercentage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SimulationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AllocationSuggestion" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "suggestedJson" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "AllocationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryReport" (
    "id" TEXT NOT NULL,
    "simulationId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "htmlContent" TEXT NOT NULL,
    "aiDraftStatus" TEXT NOT NULL DEFAULT 'not_requested',
    "aiDraftText" TEXT,
    "aiModel" TEXT,
    "aiGeneratedAt" TIMESTAMP(3),
    "aiSourceSnapshot" TEXT,
    "pvNarrativeJson" TEXT,
    "pvDataJson" TEXT,

    CONSTRAINT "DeliveryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectPlan" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'concept',
    "model" TEXT,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "phasesJson" TEXT NOT NULL,
    "assignmentsJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "deliveryReportId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "amountExclVat" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL,
    "amountInclVat" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'opdrachtbrief',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_profileCategoryId_idx" ON "Employee"("profileCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileCategory_name_key" ON "ProfileCategory"("name");

-- CreateIndex
CREATE INDEX "ProfileRate_profileCategoryId_idx" ON "ProfileRate"("profileCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileRate_contractId_profileCategoryId_key" ON "ProfileRate"("contractId", "profileCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_code_key" ON "Contract"("code");

-- CreateIndex
CREATE INDEX "Contract_active_idx" ON "Contract"("active");

-- CreateIndex
CREATE INDEX "Task_contractId_idx" ON "Task"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_contractId_name_key" ON "Task"("contractId", "name");

-- CreateIndex
CREATE INDEX "TimeEntry_contractId_date_idx" ON "TimeEntry"("contractId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_idx" ON "TimeEntry"("taskId");

-- CreateIndex
CREATE INDEX "TimeEntry_employeeId_idx" ON "TimeEntry"("employeeId");

-- CreateIndex
CREATE INDEX "TimeEntry_profileCategoryId_idx" ON "TimeEntry"("profileCategoryId");

-- CreateIndex
CREATE INDEX "ContractAllocationTemplate_profileCategoryId_idx" ON "ContractAllocationTemplate"("profileCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAllocationTemplate_contractId_profileCategoryId_key" ON "ContractAllocationTemplate"("contractId", "profileCategoryId");

-- CreateIndex
CREATE INDEX "Simulation_contractId_idx" ON "Simulation"("contractId");

-- CreateIndex
CREATE INDEX "SimulationLine_profileCategoryId_idx" ON "SimulationLine"("profileCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "SimulationLine_simulationId_profileCategoryId_key" ON "SimulationLine"("simulationId", "profileCategoryId");

-- CreateIndex
CREATE INDEX "AllocationSuggestion_contractId_idx" ON "AllocationSuggestion"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReport_simulationId_key" ON "DeliveryReport"("simulationId");

-- CreateIndex
CREATE INDEX "DeliveryReport_contractId_idx" ON "DeliveryReport"("contractId");

-- CreateIndex
CREATE INDEX "ProjectPlan_contractId_idx" ON "ProjectPlan"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_deliveryReportId_key" ON "Invoice"("deliveryReportId");

-- CreateIndex
CREATE INDEX "Invoice_contractId_idx" ON "Invoice"("contractId");

-- CreateIndex
CREATE INDEX "Document_contractId_idx" ON "Document"("contractId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileRate" ADD CONSTRAINT "ProfileRate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileRate" ADD CONSTRAINT "ProfileRate_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAllocationTemplate" ADD CONSTRAINT "ContractAllocationTemplate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAllocationTemplate" ADD CONSTRAINT "ContractAllocationTemplate_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Simulation" ADD CONSTRAINT "Simulation_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationLine" ADD CONSTRAINT "SimulationLine_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SimulationLine" ADD CONSTRAINT "SimulationLine_profileCategoryId_fkey" FOREIGN KEY ("profileCategoryId") REFERENCES "ProfileCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AllocationSuggestion" ADD CONSTRAINT "AllocationSuggestion_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReport" ADD CONSTRAINT "DeliveryReport_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryReport" ADD CONSTRAINT "DeliveryReport_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectPlan" ADD CONSTRAINT "ProjectPlan_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_deliveryReportId_fkey" FOREIGN KEY ("deliveryReportId") REFERENCES "DeliveryReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

