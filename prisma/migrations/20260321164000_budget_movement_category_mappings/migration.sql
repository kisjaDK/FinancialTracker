-- CreateEnum
CREATE TYPE "BudgetMovementBucket" AS ENUM ('PERM', 'EXT', 'CLOUD', 'AMS', 'LICENSES');

-- CreateTable
CREATE TABLE "BudgetMovementCategoryMapping" (
    "id" TEXT NOT NULL,
    "trackingYearId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "bucket" "BudgetMovementBucket" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetMovementCategoryMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BudgetMovementCategoryMapping_trackingYearId_category_key" ON "BudgetMovementCategoryMapping"("trackingYearId", "category");

-- CreateIndex
CREATE INDEX "BudgetMovementCategoryMapping_trackingYearId_category_idx" ON "BudgetMovementCategoryMapping"("trackingYearId", "category");

-- AddForeignKey
ALTER TABLE "BudgetMovementCategoryMapping" ADD CONSTRAINT "BudgetMovementCategoryMapping_trackingYearId_fkey" FOREIGN KEY ("trackingYearId") REFERENCES "TrackingYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;
