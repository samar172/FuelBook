-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('HSD', 'MS', 'MS_POWER', 'CNG');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('DAY', 'NIGHT');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'LOCKED');

-- CreateTable
CREATE TABLE "Pump" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "discrepancyMlThreshold" BIGINT NOT NULL DEFAULT 500,
    "discrepancyPaiseThreshold" BIGINT NOT NULL DEFAULT 5000,

    CONSTRAINT "Pump_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tank" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "capacityMl" BIGINT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nozzle" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Nozzle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelRate" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "ratePaise" BIGINT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "FuelRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MANAGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canCreateShift" BOOLEAN NOT NULL DEFAULT true,
    "canEditNozzleReadings" BOOLEAN NOT NULL DEFAULT true,
    "canEditStock" BOOLEAN NOT NULL DEFAULT true,
    "canEditTankerReceipts" BOOLEAN NOT NULL DEFAULT true,
    "canEditCollections" BOOLEAN NOT NULL DEFAULT true,
    "canEditOutstanding" BOOLEAN NOT NULL DEFAULT true,
    "canEditExpenses" BOOLEAN NOT NULL DEFAULT true,
    "canEditCreditSales" BOOLEAN NOT NULL DEFAULT true,
    "canSubmitShift" BOOLEAN NOT NULL DEFAULT true,
    "canLockShift" BOOLEAN NOT NULL DEFAULT false,
    "canEditFuelRates" BOOLEAN NOT NULL DEFAULT false,
    "canManageCreditCustomers" BOOLEAN NOT NULL DEFAULT false,
    "canManageExpenseCategories" BOOLEAN NOT NULL DEFAULT false,
    "canManageUsers" BOOLEAN NOT NULL DEFAULT false,
    "canManagePump" BOOLEAN NOT NULL DEFAULT false,
    "canViewReports" BOOLEAN NOT NULL DEFAULT true,
    "canExportReports" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftReport" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "status" "ShiftStatus" NOT NULL DEFAULT 'DRAFT',
    "openingCashPaise" BIGINT NOT NULL DEFAULT 0,
    "totalSalesPaise" BIGINT NOT NULL DEFAULT 0,
    "totalCreditIssuedPaise" BIGINT NOT NULL DEFAULT 0,
    "totalCashFromCreditSalesPaise" BIGINT NOT NULL DEFAULT 0,
    "totalOutstandingReceivedPaise" BIGINT NOT NULL DEFAULT 0,
    "totalCollectionsPaise" BIGINT NOT NULL DEFAULT 0,
    "totalExpensesPaise" BIGINT NOT NULL DEFAULT 0,
    "closingCashPaise" BIGINT NOT NULL DEFAULT 0,
    "totalSaleMlByMeter" BIGINT NOT NULL DEFAULT 0,
    "totalSaleMlByStock" BIGINT NOT NULL DEFAULT 0,
    "discrepancyMl" BIGINT NOT NULL DEFAULT 0,
    "discrepancyFlag" BOOLEAN NOT NULL DEFAULT false,
    "cashFlowDifferencePaise" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,

    CONSTRAINT "ShiftReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NozzleReading" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "nozzleId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "openingReadingMl" BIGINT NOT NULL,
    "closingReadingMl" BIGINT NOT NULL,
    "testingMl" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "NozzleReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockEntry" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "openingStockMl" BIGINT NOT NULL,
    "closingStockMl" BIGINT NOT NULL,

    CONSTRAINT "StockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TankerReceipt" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "shiftReportId" TEXT,
    "tankId" TEXT NOT NULL,
    "receivedMl" BIGINT NOT NULL,
    "ratePaise" BIGINT,
    "totalCostPaise" BIGINT,
    "billNo" TEXT,
    "vendorName" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "TankerReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentChannel" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTimeSlot" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentTimeSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentModeCollection" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "timeSlotId" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "reference" TEXT,

    CONSTRAINT "PaymentModeCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCustomer" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "vehicleNo" TEXT,
    "creditLimitPaise" BIGINT NOT NULL DEFAULT 0,
    "currentBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditSale" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "quantityMl" BIGINT NOT NULL,
    "ratePaise" BIGINT NOT NULL,
    "totalAmountPaise" BIGINT NOT NULL,
    "amountPaidPaise" BIGINT NOT NULL DEFAULT 0,
    "amountCreditPaise" BIGINT NOT NULL,
    "paidViaChannelId" TEXT,
    "vehicleNo" TEXT,
    "reference" TEXT,
    "saleAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutstandingReceipt" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerNameRaw" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "channelId" TEXT,
    "reference" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutstandingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseEntry" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "ref" TEXT,
    "lastBillDate" DATE,
    "openingBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "dayExpensePaise" BIGINT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ExpenseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pump_code_key" ON "Pump"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Tank_pumpId_name_key" ON "Tank"("pumpId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Nozzle_pumpId_code_key" ON "Nozzle"("pumpId", "code");

-- CreateIndex
CREATE INDEX "FuelRate_pumpId_fuelType_effectiveFrom_idx" ON "FuelRate"("pumpId", "fuelType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermission_userId_key" ON "UserPermission"("userId");

-- CreateIndex
CREATE INDEX "ShiftReport_pumpId_reportDate_idx" ON "ShiftReport"("pumpId", "reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftReport_pumpId_reportDate_shiftType_key" ON "ShiftReport"("pumpId", "reportDate", "shiftType");

-- CreateIndex
CREATE UNIQUE INDEX "NozzleReading_shiftReportId_nozzleId_key" ON "NozzleReading"("shiftReportId", "nozzleId");

-- CreateIndex
CREATE UNIQUE INDEX "StockEntry_shiftReportId_tankId_key" ON "StockEntry"("shiftReportId", "tankId");

-- CreateIndex
CREATE INDEX "TankerReceipt_pumpId_receivedAt_idx" ON "TankerReceipt"("pumpId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentChannel_pumpId_name_key" ON "PaymentChannel"("pumpId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTimeSlot_pumpId_name_key" ON "PaymentTimeSlot"("pumpId", "name");

-- CreateIndex
CREATE INDEX "PaymentModeCollection_shiftReportId_channelId_idx" ON "PaymentModeCollection"("shiftReportId", "channelId");

-- CreateIndex
CREATE INDEX "CreditCustomer_pumpId_isActive_idx" ON "CreditCustomer"("pumpId", "isActive");

-- CreateIndex
CREATE INDEX "CreditSale_shiftReportId_idx" ON "CreditSale"("shiftReportId");

-- CreateIndex
CREATE INDEX "CreditSale_customerId_idx" ON "CreditSale"("customerId");

-- CreateIndex
CREATE INDEX "OutstandingReceipt_shiftReportId_idx" ON "OutstandingReceipt"("shiftReportId");

-- CreateIndex
CREATE INDEX "OutstandingReceipt_customerId_idx" ON "OutstandingReceipt"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_pumpId_name_key" ON "ExpenseCategory"("pumpId", "name");

-- CreateIndex
CREATE INDEX "ExpenseEntry_shiftReportId_categoryId_idx" ON "ExpenseEntry"("shiftReportId", "categoryId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Tank" ADD CONSTRAINT "Tank_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nozzle" ADD CONSTRAINT "Nozzle_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nozzle" ADD CONSTRAINT "Nozzle_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FuelRate" ADD CONSTRAINT "FuelRate_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NozzleReading" ADD CONSTRAINT "NozzleReading_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NozzleReading" ADD CONSTRAINT "NozzleReading_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "Nozzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockEntry" ADD CONSTRAINT "StockEntry_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankerReceipt" ADD CONSTRAINT "TankerReceipt_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankerReceipt" ADD CONSTRAINT "TankerReceipt_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankerReceipt" ADD CONSTRAINT "TankerReceipt_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentChannel" ADD CONSTRAINT "PaymentChannel_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTimeSlot" ADD CONSTRAINT "PaymentTimeSlot_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentModeCollection" ADD CONSTRAINT "PaymentModeCollection_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentModeCollection" ADD CONSTRAINT "PaymentModeCollection_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentModeCollection" ADD CONSTRAINT "PaymentModeCollection_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "PaymentTimeSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCustomer" ADD CONSTRAINT "CreditCustomer_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CreditCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutstandingReceipt" ADD CONSTRAINT "OutstandingReceipt_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutstandingReceipt" ADD CONSTRAINT "OutstandingReceipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CreditCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
