ALTER TABLE "Contract" ALTER COLUMN "hoursPerDay" SET DEFAULT 8;

UPDATE "Contract"
SET "hoursPerDay" = 8
WHERE "hoursPerDay" = 7.6;
