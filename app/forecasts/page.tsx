import { FinanceAppShell } from "@/components/finance/app-shell";
import { ForecastsBrowser } from "@/components/finance/forecasts-browser";
import { requirePageAccess } from "@/lib/authz";
import { getForecastsPageData } from "@/lib/finance/queries";

type SearchParamValue = string | string[] | undefined;

type PageProps = {
  searchParams?: Promise<{
    year?: string;
    domain?: SearchParamValue;
    subDomain?: SearchParamValue;
    projectCode?: SearchParamValue;
    team?: SearchParamValue;
    seatId?: SearchParamValue;
    name?: SearchParamValue;
    status?: SearchParamValue;
    forecastBucket?: string;
    hideInactiveStatuses?: string;
    nonMonthStart?: string;
    nonMonthEnd?: string;
    reducedOnLeaveForecast?: string;
    selectedSeatId?: string;
  }>;
};

function toArray(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

export default async function ForecastsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;

  const data = await getForecastsPageData(
    {
      year,
      domains: toArray(resolvedSearchParams?.domain),
      subDomains: toArray(resolvedSearchParams?.subDomain),
      projectCodes: toArray(resolvedSearchParams?.projectCode),
      teams: toArray(resolvedSearchParams?.team),
      seatIds: toArray(resolvedSearchParams?.seatId),
      names: toArray(resolvedSearchParams?.name),
      statuses: toArray(resolvedSearchParams?.status),
      forecastBucket:
        resolvedSearchParams?.forecastBucket === "perm" ||
        resolvedSearchParams?.forecastBucket === "ext" ||
        resolvedSearchParams?.forecastBucket === "cloud"
          ? resolvedSearchParams.forecastBucket
          : undefined,
      hideInactiveStatuses:
        resolvedSearchParams?.hideInactiveStatuses !== "false",
      nonMonthStart: resolvedSearchParams?.nonMonthStart === "true",
      nonMonthEnd: resolvedSearchParams?.nonMonthEnd === "true",
      reducedOnLeaveForecast:
        resolvedSearchParams?.reducedOnLeaveForecast === "true",
      selectedSeatId: resolvedSearchParams?.selectedSeatId,
    },
    viewer,
  );

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/forecasts"
    >
      <ForecastsBrowser
        key={[
          data.activeYear,
          data.filters.domains.join("|"),
          data.filters.subDomains.join("|"),
          data.filters.teams.join("|"),
        ].join(":")}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        seats={data.seats}
        totalSeatCount={data.totalSeatCount}
        selectedSeatId={data.selectedSeatId}
        filters={data.filters}
        filterOptions={data.filterOptions}
        internalCostServiceMessage={data.internalCostServiceMessage}
      />
    </FinanceAppShell>
  );
}
