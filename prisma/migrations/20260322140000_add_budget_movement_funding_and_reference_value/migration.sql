ALTER TYPE "SeatReferenceValueType" ADD VALUE 'FUNDING';

ALTER TABLE "BudgetMovement"
ADD COLUMN "funding" TEXT;

CREATE INDEX "BudgetMovement_trackingYearId_funding_idx"
ON "BudgetMovement"("trackingYearId", "funding");
