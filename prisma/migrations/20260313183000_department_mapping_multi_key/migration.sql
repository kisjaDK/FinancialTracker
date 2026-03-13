DROP INDEX IF EXISTS "DepartmentMapping_trackingYearId_codeType_sourceCode_key";
CREATE UNIQUE INDEX "DepartmentMapping_trackingYearId_codeType_sourceCode_subDomain_projectCode_key"
ON "DepartmentMapping"("trackingYearId", "codeType", "sourceCode", "subDomain", "projectCode");
