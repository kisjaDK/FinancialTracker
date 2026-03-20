-- AlterTable
ALTER TABLE "DepartmentMapping" ADD COLUMN     "teams" TEXT[] DEFAULT ARRAY[]::TEXT[];
