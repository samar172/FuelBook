-- Give stock movements a real direction column.
--
-- ADJUSTMENT and RETURN can add or remove stock. That was previously encoded as a
-- "[OUT] " marker inside the free-text reference, which is invisible to queries
-- and easy to corrupt. The direction now has its own column; existing rows are
-- backfilled from the marker (and from `kind` for sales), and the markers are
-- stripped out of the reference text.

-- CreateEnum
CREATE TYPE "StockDirection" AS ENUM ('IN', 'OUT');

-- AlterTable
ALTER TABLE "ProductMovement" ADD COLUMN "direction" "StockDirection" NOT NULL DEFAULT 'IN';

-- Backfill: sales always leave stock.
UPDATE "ProductMovement" SET "direction" = 'OUT' WHERE "kind" = 'SALE';

-- Backfill: adjustments/returns that carried the legacy marker.
UPDATE "ProductMovement" SET "direction" = 'OUT'
WHERE "reference" IS NOT NULL AND upper(btrim("reference")) LIKE '[OUT]%';

-- Clean the markers out of the human-readable reference.
UPDATE "ProductMovement"
SET "reference" = NULLIF(btrim(regexp_replace("reference", '^\s*\[(IN|OUT)\]\s*', '', 'i')), '')
WHERE "reference" IS NOT NULL AND btrim("reference") ~* '^\[(IN|OUT)\]';
