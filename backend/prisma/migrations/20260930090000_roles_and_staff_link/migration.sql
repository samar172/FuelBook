-- Role-based access, and a link from a login to a staff record.
--
-- The Role enum gains ACCOUNTANT, CASHIER, ATTENDANT and AUDITOR. STAFF is kept so
-- existing logins keep working; it behaves like ATTENDANT.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CASHIER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ATTENDANT';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'AUDITOR';

-- Permissions for the areas added since the first release. All default to false:
-- an existing non-owner account gains nothing until someone grants it.
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "canViewBooks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "canPostJournalEntries" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "canManageBankAndSettlement" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "canManageProducts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "UserPermission" ADD COLUMN IF NOT EXISTS "canManageLicences" BOOLEAN NOT NULL DEFAULT false;

-- A login can point at one staff record, and a staff record has at most one login.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_employeeId_key" ON "User"("employeeId");
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Anyone already viewing reports keeps an equivalent view of the books.
UPDATE "UserPermission" SET "canViewBooks" = true WHERE "canViewReports" = true;
