import { FinanceAppShell } from "@/components/finance/app-shell";
import { AdminBrowser } from "@/components/finance/admin-browser";
import { getAdminPageData } from "@/lib/finance/queries";
import { requirePageAccess } from "@/lib/authz";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
  }>;
};

export default async function AdminPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("ADMIN");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getAdminPageData(year);

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/admin"
    >
      <AdminBrowser
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        statuses={data.statuses}
        departmentMappings={data.departmentMappings}
        accrualAccountMappings={data.accrualAccountMappings}
        rosterResourceTypes={data.rosterResourceTypes}
        exchangeRates={data.exchangeRates}
        seatReferenceValues={data.seatReferenceValues}
        budgetMovementCategoryMappings={data.budgetMovementCategoryMappings}
        budgetMovementCategories={data.budgetMovementCategories}
      />
    </FinanceAppShell>
  );
}
