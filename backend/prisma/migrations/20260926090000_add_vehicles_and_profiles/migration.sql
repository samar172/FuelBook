-- Multi-vehicle credit customers + richer customer/staff profiles.
--
-- CreditCustomer.vehicleNo (single free-text vehicle) is replaced by the Vehicle
-- table. Existing numbers are copied across as each customer's primary vehicle
-- BEFORE the old column is dropped, and past credit sales are linked to the
-- matching vehicle where the typed number lines up.

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('TRUCK', 'BUS', 'CAR', 'TRACTOR', 'TWO_WHEELER', 'GENSET', 'OTHER');

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "vehicleNo" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL DEFAULT 'OTHER',
    "makeModel" TEXT,
    "fuelType" "FuelType",
    "capacityMl" BIGINT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vehicle_customerId_isActive_idx" ON "Vehicle"("customerId", "isActive");

-- CreateIndex
CREATE INDEX "Vehicle_vehicleNo_idx" ON "Vehicle"("vehicleNo");

-- CreateIndex
CREATE UNIQUE INDEX "Vehicle_customerId_vehicleNo_key" ON "Vehicle"("customerId", "vehicleNo");

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CreditCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CreditSale" ADD COLUMN     "vehicleId" TEXT;

-- Backfill: one primary Vehicle per customer that had a vehicleNo.
-- gen_random_uuid() is pgcrypto/PG13+ builtin; ids need only be unique, not cuids.
INSERT INTO "Vehicle" ("id", "customerId", "vehicleNo", "type", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       c."id",
       upper(btrim(c."vehicleNo")),
       'OTHER',
       true,
       true,
       COALESCE(c."createdAt", CURRENT_TIMESTAMP),
       CURRENT_TIMESTAMP
FROM "CreditCustomer" c
WHERE c."vehicleNo" IS NOT NULL AND btrim(c."vehicleNo") <> '';

-- Backfill: link historical credit sales to the vehicle they named.
UPDATE "CreditSale" s
SET "vehicleId" = v."id"
FROM "Vehicle" v
WHERE v."customerId" = s."customerId"
  AND s."vehicleNo" IS NOT NULL
  AND upper(btrim(s."vehicleNo")) = v."vehicleNo"
  AND s."vehicleId" IS NULL;

-- AlterTable — drop the old single-vehicle column now that it has been migrated.
ALTER TABLE "CreditCustomer" DROP COLUMN "vehicleNo",
ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "altPhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "contactPerson" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "paymentTermsDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "altPhone" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "dateOfBirth" TIMESTAMP(3),
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "exitDate" TIMESTAMP(3),
ADD COLUMN     "joiningDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateIndex
CREATE INDEX "CreditCustomer_pumpId_name_idx" ON "CreditCustomer"("pumpId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCustomer_pumpId_code_key" ON "CreditCustomer"("pumpId", "code");

-- CreateIndex
CREATE INDEX "CreditSale_vehicleId_idx" ON "CreditSale"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_pumpId_code_key" ON "Employee"("pumpId", "code");

-- AddForeignKey
ALTER TABLE "CreditSale" ADD CONSTRAINT "CreditSale_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
