-- AlterTable
ALTER TABLE "UserPermission" ADD COLUMN     "canManageEmployees" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "pumpId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftEmployeeAssignment" (
    "id" TEXT NOT NULL,
    "shiftReportId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "nozzleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShiftEmployeeAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Employee_pumpId_isActive_idx" ON "Employee"("pumpId", "isActive");

-- CreateIndex
CREATE INDEX "ShiftEmployeeAssignment_shiftReportId_employeeId_idx" ON "ShiftEmployeeAssignment"("shiftReportId", "employeeId");

-- CreateIndex
CREATE INDEX "ShiftEmployeeAssignment_employeeId_idx" ON "ShiftEmployeeAssignment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftEmployeeAssignment_shiftReportId_nozzleId_key" ON "ShiftEmployeeAssignment"("shiftReportId", "nozzleId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_pumpId_fkey" FOREIGN KEY ("pumpId") REFERENCES "Pump"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftEmployeeAssignment" ADD CONSTRAINT "ShiftEmployeeAssignment_shiftReportId_fkey" FOREIGN KEY ("shiftReportId") REFERENCES "ShiftReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftEmployeeAssignment" ADD CONSTRAINT "ShiftEmployeeAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftEmployeeAssignment" ADD CONSTRAINT "ShiftEmployeeAssignment_nozzleId_fkey" FOREIGN KEY ("nozzleId") REFERENCES "Nozzle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

