import { FinanceAppShell } from "@/components/finance/app-shell";
import { StaffingAdminBrowser } from "@/components/finance/staffing-admin-browser";
import { requirePageAccess } from "@/lib/authz";
import { getStaffingAdminPageData } from "@/lib/finance/queries";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
  }>;
};

export default async function StaffingAdminPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("ADMIN");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getStaffingAdminPageData(year, viewer);

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/staffing-admin"
    >
      <StaffingAdminBrowser
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        targets={data.targets}
        hierarchyOptions={data.hierarchyOptions}
      />
    </FinanceAppShell>
  );
}
