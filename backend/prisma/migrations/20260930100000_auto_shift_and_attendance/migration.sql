-- Opening the day's shift by itself, and marking attendance against it.
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'LOGIN', 'ROSTER');

ALTER TABLE "Pump"
  ADD COLUMN "autoStartShift" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "dayShiftStartsAtMin" INTEGER NOT NULL DEFAULT 360,    -- 06:00 local
  ADD COLUMN "nightShiftStartsAtMin" INTEGER NOT NULL DEFAULT 1080, -- 18:00 local
  ADD COLUMN "autoMarkAttendance" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Attendance"
  ADD COLUMN "checkInAt" TIMESTAMP(3),
  ADD COLUMN "checkOutAt" TIMESTAMP(3),
  ADD COLUMN "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "markedById" TEXT;
