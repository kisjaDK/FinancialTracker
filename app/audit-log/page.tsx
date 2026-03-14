import { FinanceAppShell } from "@/components/finance/app-shell";
import { AuditLogBrowser } from "@/components/finance/audit-log-browser";
import { getAuditPageData } from "@/lib/finance/queries";
import { requirePageAccess } from "@/lib/authz";

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams?: Promise<{
    year?: string;
    search?: SearchParamValue;
    user?: SearchParamValue;
    from?: string;
    to?: string;
  }>;
};

function firstValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getAuditPageData(
    {
      year,
      search: firstValue(resolvedSearchParams?.search),
      user: firstValue(resolvedSearchParams?.user),
      from: resolvedSearchParams?.from,
      to: resolvedSearchParams?.to,
    },
    viewer,
  );

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/audit-log"
    >
      <AuditLogBrowser
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        logs={data.logs}
      />
    </FinanceAppShell>
  );
}
