import { FinanceAppShell } from "@/components/finance/app-shell";
import { StaffingBrowser } from "@/components/finance/staffing-browser";
import { requirePageAccess } from "@/lib/authz";
import { getStaffingPageData } from "@/lib/finance/queries";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
    domain?: string;
  }>;
};

export default async function StaffingPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getStaffingPageData(
    year,
    resolvedSearchParams?.domain,
    viewer,
  );

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/staffing"
    >
      <StaffingBrowser
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        domains={data.domains}
        selectedDomain={data.selectedDomain}
        domainTarget={data.domainTarget}
        domainMonths={data.domainMonths}
        groups={data.groups}
      />
    </FinanceAppShell>
  );
}
