-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "InstrumentKind" AS ENUM ('CASH', 'CHEQUE', 'RTGS', 'NEFT', 'IMPS', 'UPI', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "InstrumentStatus" AS ENUM ('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('LUBRICANT', 'ADBLUE', 'ACCESSORY', 'SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductUnit" AS ENUM ('LITRE', 'PIECE', 'KG', 'SERVICE');

-- CreateEnum
CREATE TYPE "ProductMovementKind" AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "CashLocation" AS ENUM ('ATTENDANT', 'CASHIER', 'OFFICE_SAFE', 'OWNER', 'BANK', 'VENDOR', 'OTHER');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'CLEARED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('EXPECTED', 'SETTLED', 'SHORT', 'DISPUTED');

-- CreateEnum
CREATE TYPE "TxnDirection" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "LicenceKind" AS ENUM ('PESO_EXPLOSIVE', 'WEIGHTS_MEASURES_STAMPING', 'FIRE_NOC', 'POLLUTION_NOC', 'TRADE_LICENCE', 'SHOP_ESTABLISHMENT', 'GST_REGISTRATION', 'VAT_REGISTRATION', 'INSURANCE', 'DEALERSHIP_AGREEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'WEEKLY_OFF');

-- CreateEnum
CREATE TYPE "AdvanceKind" AS ENUM ('ADVANCE', 'REPAYMENT');

-- AlterTable
ALTER TABLE "TankerReceipt" ADD COLUMN     "claimAmountPaise" BIGINT,
ADD COLUMN     "claimRaised" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "decantedAt" TIMESTAMP(3),
ADD COLUMN     "decantedById" TEXT,
ADD COLUMN     "densityAtLoading" INTEGER,
ADD COLUMN     "densityAtReceipt" INTEGER,
ADD COLUMN     "dipAfterMm" INTEGER,
ADD COLUMN     "dipBeforeMm" INTEGER,
ADD COLUMN     "invoiceQtyMl" BIGINT,
ADD COLUMN     "receivedByDipMl" BIGINT,
ADD COLUMN     "sealIntact" BOOLEAN,
ADD COLUMN     "temperatureC" INTEGER,
ADD COLUMN     "transitLossMl" BIGINT;

-- CreateTable
CREATE TABLE "TankDipChartPoint" (
    "id" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "dipMm" INTEGER NOT NULL,
    "volumeMl" BIGINT NOT NULL,

    CONSTRAINT "TankDipChartPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TankDipReading" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "tankId" TEXT NOT NULL,
    "dipMm" INTEGER NOT NULL,
    "volumeFromChartMl" BIGINT,
    "densityKgM3" INTEGER,
    "temperatureC" INTEGER,
    "densityAt15CKgM3" INTEGER,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "TankDipReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasureTest" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "nozzleId" TEXT NOT NULL,
    "measureMl" BIGINT NOT NULL DEFAULT 5000,
    "deliveredMl" BIGINT NOT NULL,
    "varianceMl" BIGINT NOT NULL,
    "withinTolerance" BOOLEAN NOT NULL DEFAULT true,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "testedById" TEXT,
    "notes" TEXT,

    CONSTRAINT "MeasureTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRevision" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "oldRatePaise" BIGINT NOT NULL,
    "newRatePaise" BIGINT NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "stockAtRevisionMl" BIGINT NOT NULL DEFAULT 0,
    "stockGainLossPaise" BIGINT NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerStatement" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "statementNo" TEXT NOT NULL,
    "periodFrom" DATE NOT NULL,
    "periodTo" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "openingBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "salesPaise" BIGINT NOT NULL DEFAULT 0,
    "receiptsPaise" BIGINT NOT NULL DEFAULT 0,
    "closingBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "status" "StatementStatus" NOT NULL DEFAULT 'DRAFT',
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentInstrument" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "InstrumentKind" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "receivedOn" DATE NOT NULL,
    "chequeNo" TEXT,
    "chequeDate" DATE,
    "bankName" TEXT,
    "utrNo" TEXT,
    "status" "InstrumentStatus" NOT NULL DEFAULT 'PENDING',
    "clearedOn" DATE,
    "bouncedOn" DATE,
    "bounceReason" TEXT,
    "bounceChargePaise" BIGINT,
    "outstandingReceiptId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentInstrument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL DEFAULT 'LUBRICANT',
    "unit" "ProductUnit" NOT NULL DEFAULT 'PIECE',
    "packSizeMl" BIGINT,
    "purchasePricePaise" BIGINT NOT NULL DEFAULT 0,
    "sellingPricePaise" BIGINT NOT NULL DEFAULT 0,
    "gstRateBp" INTEGER NOT NULL DEFAULT 1800,
    "hsnCode" TEXT,
    "reorderLevelQty" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shiftReportId" TEXT,
    "kind" "ProductMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" BIGINT NOT NULL,
    "totalPaise" BIGINT NOT NULL,
    "gstPaise" BIGINT NOT NULL DEFAULT 0,
    "customerId" TEXT,
    "reference" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "ProductMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductStockState" (
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "valuePaise" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductStockState_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "CashMovement" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "shiftReportId" TEXT,
    "fromLocation" "CashLocation" NOT NULL,
    "fromEmployeeId" TEXT,
    "toLocation" "CashLocation" NOT NULL,
    "toEmployeeId" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashDepositId" TEXT,
    "purpose" TEXT,
    "reference" TEXT,
    "journalEntryId" TEXT,
    "recordedById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDenominationCount" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "note500" INTEGER NOT NULL DEFAULT 0,
    "note200" INTEGER NOT NULL DEFAULT 0,
    "note100" INTEGER NOT NULL DEFAULT 0,
    "note50" INTEGER NOT NULL DEFAULT 0,
    "note20" INTEGER NOT NULL DEFAULT 0,
    "note10" INTEGER NOT NULL DEFAULT 0,
    "coin20" INTEGER NOT NULL DEFAULT 0,
    "coin10" INTEGER NOT NULL DEFAULT 0,
    "coin5" INTEGER NOT NULL DEFAULT 0,
    "coin2" INTEGER NOT NULL DEFAULT 0,
    "coin1" INTEGER NOT NULL DEFAULT 0,
    "countedTotalPaise" BIGINT NOT NULL DEFAULT 0,
    "countedById" TEXT,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "CashDenominationCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNoLast4" TEXT NOT NULL,
    "ifsc" TEXT,
    "nickname" TEXT,
    "openingBalancePaise" BIGINT NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDeposit" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "shiftReportId" TEXT,
    "amountPaise" BIGINT NOT NULL,
    "depositedOn" DATE NOT NULL,
    "slipNo" TEXT,
    "depositedByEmployeeId" TEXT,
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SettlementBatch" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "expectedPaise" BIGINT NOT NULL DEFAULT 0,
    "settledPaise" BIGINT NOT NULL DEFAULT 0,
    "mdrPaise" BIGINT NOT NULL DEFAULT 0,
    "differencePaise" BIGINT NOT NULL DEFAULT 0,
    "settledOn" DATE,
    "bankAccountId" TEXT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'EXPECTED',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "txnDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "direction" "TxnDirection" NOT NULL,
    "balancePaise" BIGINT,
    "reference" TEXT,
    "importBatch" TEXT,
    "matchedKind" TEXT,
    "matchedId" TEXT,
    "isMatched" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Licence" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "kind" "LicenceKind" NOT NULL,
    "label" TEXT,
    "number" TEXT,
    "issuedBy" TEXT,
    "issuedOn" DATE,
    "expiresOn" DATE NOT NULL,
    "reminderDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "documentRef" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Licence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "shiftType" "ShiftType",
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "shiftReportId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeAdvance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" "AdvanceKind" NOT NULL,
    "amountPaise" BIGINT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "journalEntryId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TankDipChartPoint_tankId_idx" ON "TankDipChartPoint"("tankId");

-- CreateIndex
CREATE UNIQUE INDEX "TankDipChartPoint_tankId_dipMm_key" ON "TankDipChartPoint"("tankId", "dipMm");

-- CreateIndex
CREATE INDEX "TankDipReading_tankId_idx" ON "TankDipReading"("tankId");

-- CreateIndex
CREATE UNIQUE INDEX "TankDipReading_shiftReportId_tankId_key" ON "TankDipReading"("shiftReportId", "tankId");

-- CreateIndex
CREATE INDEX "MeasureTest_shiftReportId_idx" ON "MeasureTest"("shiftReportId");

-- CreateIndex
CREATE INDEX "MeasureTest_nozzleId_idx" ON "MeasureTest"("nozzleId");

-- CreateIndex
CREATE INDEX "PriceRevision_pumpId_fuelType_effectiveAt_idx" ON "PriceRevision"("pumpId", "fuelType", "effectiveAt");

-- CreateIndex
CREATE INDEX "CustomerStatement_customerId_periodTo_idx" ON "CustomerStatement"("customerId", "periodTo");

-- CreateIndex
CREATE INDEX "CustomerStatement_status_idx" ON "CustomerStatement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerStatement_customerId_statementNo_key" ON "CustomerStatement"("customerId", "statementNo");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentInstrument_outstandingReceiptId_key" ON "PaymentInstrument"("outstandingReceiptId");

-- CreateIndex
CREATE INDEX "PaymentInstrument_customerId_status_idx" ON "PaymentInstrument"("customerId", "status");

-- CreateIndex
CREATE INDEX "PaymentInstrument_status_chequeDate_idx" ON "PaymentInstrument"("status", "chequeDate");

-- CreateIndex
CREATE INDEX "Product_pumpId_category_idx" ON "Product"("pumpId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Product_pumpId_sku_key" ON "Product"("pumpId", "sku");

-- CreateIndex
CREATE INDEX "ProductMovement_productId_occurredAt_idx" ON "ProductMovement"("productId", "occurredAt");

-- CreateIndex
CREATE INDEX "ProductMovement_shiftReportId_idx" ON "ProductMovement"("shiftReportId");

-- CreateIndex
CREATE UNIQUE INDEX "CashMovement_cashDepositId_key" ON "CashMovement"("cashDepositId");

-- CreateIndex
CREATE INDEX "CashMovement_pumpId_occurredAt_idx" ON "CashMovement"("pumpId", "occurredAt");

-- CreateIndex
CREATE INDEX "CashMovement_fromEmployeeId_idx" ON "CashMovement"("fromEmployeeId");

-- CreateIndex
CREATE INDEX "CashMovement_toEmployeeId_idx" ON "CashMovement"("toEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CashDenominationCount_shiftReportId_key" ON "CashDenominationCount"("shiftReportId");

-- CreateIndex
CREATE INDEX "BankAccount_pumpId_isActive_idx" ON "BankAccount"("pumpId", "isActive");

-- CreateIndex
CREATE INDEX "CashDeposit_pumpId_depositedOn_idx" ON "CashDeposit"("pumpId", "depositedOn");

-- CreateIndex
CREATE INDEX "CashDeposit_bankAccountId_status_idx" ON "CashDeposit"("bankAccountId", "status");

-- CreateIndex
CREATE INDEX "SettlementBatch_pumpId_businessDate_idx" ON "SettlementBatch"("pumpId", "businessDate");

-- CreateIndex
CREATE INDEX "SettlementBatch_status_idx" ON "SettlementBatch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SettlementBatch_channelId_businessDate_key" ON "SettlementBatch"("channelId", "businessDate");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_txnDate_idx" ON "BankTransaction"("bankAccountId", "txnDate");

-- CreateIndex
CREATE INDEX "BankTransaction_isMatched_idx" ON "BankTransaction"("isMatched");

-- CreateIndex
CREATE INDEX "Licence_pumpId_expiresOn_idx" ON "Licence"("pumpId", "expiresOn");

-- CreateIndex
CREATE INDEX "Attendance_attendanceDate_idx" ON "Attendance"("attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_employeeId_attendanceDate_shiftType_key" ON "Attendance"("employeeId", "attendanceDate", "shiftType");

-- CreateIndex
CREATE INDEX "EmployeeAdvance_employeeId_occurredOn_idx" ON "EmployeeAdvance"("employeeId", "occurredOn");

-- AddForeignKey
ALTER TABLE "TankDipChartPoint" ADD CONSTRAINT "TankDipChartPoint_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankDipReading" ADD CONSTRAINT "TankDipReading_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankDipReading" ADD CONSTRAINT "TankDipReading_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankDipReading" ADD CONSTRAINT "TankDipReading_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasureTest" ADD CONSTRAINT "MeasureTest_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasureTest" ADD CONSTRAINT "MeasureTest_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "Nozzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasureTest" ADD CONSTRAINT "MeasureTest_testedById_fkey" FOREIGN KEY ("testedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRevision" ADD CONSTRAINT "PriceRevision_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerStatement" ADD CONSTRAINT "CustomerStatement_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CreditCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstrument" ADD CONSTRAINT "PaymentInstrument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CreditCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentInstrument" ADD CONSTRAINT "PaymentInstrument_outstandingReceiptId_fkey" FOREIGN KEY ("outstandingReceiptId") REFERENCES "OutstandingReceipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovement" ADD CONSTRAINT "ProductMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMovement" ADD CONSTRAINT "ProductMovement_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductStockState" ADD CONSTRAINT "ProductStockState_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_fromEmployeeId_fkey" FOREIGN KEY ("fromEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_toEmployeeId_fkey" FOREIGN KEY ("toEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashMovement" ADD CONSTRAINT "CashMovement_cashDepositId_fkey" FOREIGN KEY ("cashDepositId") REFERENCES "CashDeposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDenominationCount" ADD CONSTRAINT "CashDenominationCount_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashDeposit" ADD CONSTRAINT "CashDeposit_depositedByEmployeeId_fkey" FOREIGN KEY ("depositedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SettlementBatch" ADD CONSTRAINT "SettlementBatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Licence" ADD CONSTRAINT "Licence_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeAdvance" ADD CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

