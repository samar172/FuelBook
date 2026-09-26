-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalSource" AS ENUM ('SHIFT_LOCK', 'REVERSAL', 'MANUAL', 'OPENING_BALANCE');

-- CreateEnum
CREATE TYPE "CashHandoverMode" AS ENUM ('PER_ATTENDANT', 'POOLED_CASHIER');

-- AlterTable
ALTER TABLE "CreditSale" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "ExpenseEntry" ADD COLUMN     "paidByEmployeeId" TEXT;

-- AlterTable
ALTER TABLE "PaymentModeCollection" ADD COLUMN     "employeeId" TEXT;

-- AlterTable
ALTER TABLE "Pump" ADD COLUMN     "cashHandoverMode" "CashHandoverMode" NOT NULL DEFAULT 'PER_ATTENDANT';

-- AlterTable
ALTER TABLE "ShiftReport" ADD COLUMN     "cashierEmployeeId" TEXT,
ADD COLUMN     "ledgerPostedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LedgerAccount" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "entryDate" DATE NOT NULL,
    "narration" TEXT NOT NULL,
    "source" "JournalSource" NOT NULL,
    "shiftReportId" TEXT,
    "reversalOfId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debitPaise" BIGINT NOT NULL DEFAULT 0,
    "creditPaise" BIGINT NOT NULL DEFAULT 0,
    "customerId" TEXT,
    "employeeId" TEXT,
    "channelId" TEXT,
    "expenseCategoryId" TEXT,
    "tankId" TEXT,
    "fuelType" "FuelType",
    "quantityMl" BIGINT,
    "memo" TEXT,
    "paymentTimeSlotId" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCashHandover" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "expectedCashPaise" BIGINT NOT NULL DEFAULT 0,
    "receivedCashPaise" BIGINT NOT NULL DEFAULT 0,
    "variancePaise" BIGINT NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCashHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TankInventoryState" (
    "tankId" TEXT NOT NULL,
    "quantityMl" BIGINT NOT NULL DEFAULT 0,
    "valuePaise" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TankInventoryState_pkey" PRIMARY KEY ("tankId")
);

-- CreateIndex
CREATE INDEX "LedgerAccount_pumpId_type_idx" ON "LedgerAccount"("pumpId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerAccount_pumpId_code_key" ON "LedgerAccount"("pumpId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_reversalOfId_key" ON "JournalEntry"("reversalOfId");

-- CreateIndex
CREATE INDEX "JournalEntry_pumpId_entryDate_idx" ON "JournalEntry"("pumpId", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_shiftReportId_idx" ON "JournalEntry"("shiftReportId");

-- CreateIndex
CREATE INDEX "JournalEntry_pumpId_source_idx" ON "JournalEntry"("pumpId", "source");

-- CreateIndex
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_customerId_idx" ON "JournalLine"("customerId");

-- CreateIndex
CREATE INDEX "JournalLine_employeeId_idx" ON "JournalLine"("employeeId");

-- CreateIndex
CREATE INDEX "JournalLine_channelId_idx" ON "JournalLine"("channelId");

-- CreateIndex
CREATE INDEX "JournalLine_tankId_idx" ON "JournalLine"("tankId");

-- CreateIndex
CREATE INDEX "EmployeeCashHandover_employeeId_idx" ON "EmployeeCashHandover"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCashHandover_shiftReportId_employeeId_key" ON "EmployeeCashHandover"("shiftReportId", "employeeId");

-- CreateIndex
CREATE INDEX "PaymentModeCollection_employeeId_idx" ON "PaymentModeCollection"("employeeId");

-- AddForeignKey
ALTER TABLE "ShiftReport" ADD CONSTRAINT "ShiftReport_cashierEmployeeId_fkey" FOREIGN KEY ("cashierEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentModeCollection" ADD CONSTRAINT "PaymentModeCollection_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseEntry" ADD CONSTRAINT "ExpenseEntry_paidByEmployeeId_fkey" FOREIGN KEY ("paidByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "JournalEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LedgerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CreditCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "PaymentChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "ExpenseCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_paymentTimeSlotId_fkey" FOREIGN KEY ("paymentTimeSlotId") REFERENCES "PaymentTimeSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCashHandover" ADD CONSTRAINT "EmployeeCashHandover_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCashHandover" ADD CONSTRAINT "EmployeeCashHandover_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TankInventoryState" ADD CONSTRAINT "TankInventoryState_tankId_fkey" FOREIGN KEY ("tankId") REFERENCES "Tank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

