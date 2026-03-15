import { FinanceAppShell } from "@/components/finance/app-shell";
import { PeopleRosterBrowser } from "@/components/finance/people-roster-browser";
import { getPeopleRosterPageData } from "@/lib/finance/queries";
import { requirePageAccess } from "@/lib/authz";

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams?: Promise<{
    year?: string;
    seatId?: SearchParamValue;
    name?: SearchParamValue;
    email?: SearchParamValue;
    domain?: SearchParamValue;
    team?: SearchParamValue;
    subDomain?: SearchParamValue;
    projectCode?: SearchParamValue;
    vendor?: SearchParamValue;
    location?: SearchParamValue;
    status?: SearchParamValue;
    role?: SearchParamValue;
    band?: SearchParamValue;
    month?: string;
    staffingBucket?: string;
    validation?: string;
  }>;
};

function toArray(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

export default async function PeopleRosterPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getPeopleRosterPageData(
    {
      year,
      seatIds: toArray(resolvedSearchParams?.seatId),
      names: toArray(resolvedSearchParams?.name),
      emails: toArray(resolvedSearchParams?.email),
      domains: toArray(resolvedSearchParams?.domain),
      teams: toArray(resolvedSearchParams?.team),
      subDomains: toArray(resolvedSearchParams?.subDomain),
      projectCodes: toArray(resolvedSearchParams?.projectCode),
      vendors: toArray(resolvedSearchParams?.vendor),
      locations: toArray(resolvedSearchParams?.location),
      statuses: toArray(resolvedSearchParams?.status),
      roles: toArray(resolvedSearchParams?.role),
      bands: toArray(resolvedSearchParams?.band),
      month: resolvedSearchParams?.month,
      staffingBucket: resolvedSearchParams?.staffingBucket,
      validation: resolvedSearchParams?.validation,
    },
    viewer,
  );

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/people-roster"
    >
      <PeopleRosterBrowser
        key={[
          data.activeYear,
          data.filters.domains.join("|"),
          data.filters.subDomains.join("|"),
          data.filters.teams.join("|"),
        ].join(":")}
        userRole={viewer.role}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        filterOptions={data.filterOptions}
        people={data.people}
        totals={data.totals}
        rosterImports={data.rosterImports}
        budgetAreas={data.budgetAreas.map((area) => ({
          ...area,
          displayName:
            area.displayName ||
            `${area.subDomain || area.pillar || area.projectCode} · ${area.costCenter}`,
        }))}
      />
    </FinanceAppShell>
  );
}
