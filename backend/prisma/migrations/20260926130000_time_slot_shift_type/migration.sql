-- Tie a collection time slot to a shift.
--
-- A pump typically names its slots after the shift hours ("6 Am - 6 PM", "6 PM - 6 Am"),
-- but both were offered on every shift because the slot had no shift type. It is
-- nullable and left NULL here: NULL means "applies to both", so existing pumps keep
-- working exactly as before until someone tags their slots. Names are deliberately
-- NOT parsed to guess the shift — free text is not a reliable signal.
ALTER TABLE "PaymentTimeSlot" ADD COLUMN "shiftType" "ShiftType";
