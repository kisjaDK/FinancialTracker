import { signOut } from "@/auth"
import { ForecastsBrowser } from "@/components/finance/forecasts-browser"
import { requirePageAccess } from "@/lib/authz"
import { getForecastsPageData } from "@/lib/finance/queries"

type SearchParamValue = string | string[] | undefined

type PageProps = {
  searchParams?: Promise<{
    year?: string
    subDomain?: SearchParamValue
    team?: SearchParamValue
    seatId?: SearchParamValue
    name?: SearchParamValue
    status?: SearchParamValue
    hideInactiveStatuses?: string
    nonMonthStart?: string
    nonMonthEnd?: string
    reducedOnLeaveForecast?: string
    selectedSeatId?: string
  }>
}

function toArray(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value
  }

  return value ? [value] : []
}

export default async function ForecastsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined

  const data = await getForecastsPageData(
    {
      year,
      subDomains: toArray(resolvedSearchParams?.subDomain),
      teams: toArray(resolvedSearchParams?.team),
      seatIds: toArray(resolvedSearchParams?.seatId),
      names: toArray(resolvedSearchParams?.name),
      statuses: toArray(resolvedSearchParams?.status),
      hideInactiveStatuses:
        resolvedSearchParams?.hideInactiveStatuses !== "false",
      nonMonthStart: resolvedSearchParams?.nonMonthStart === "true",
      nonMonthEnd: resolvedSearchParams?.nonMonthEnd === "true",
      reducedOnLeaveForecast:
        resolvedSearchParams?.reducedOnLeaveForecast === "true",
      selectedSeatId: resolvedSearchParams?.selectedSeatId,
    },
    viewer
  )

  return (
    <>
      <ForecastsBrowser
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        seats={data.seats}
        totalSeatCount={data.totalSeatCount}
        selectedSeatId={data.selectedSeatId}
        filters={data.filters}
        filterOptions={data.filterOptions}
        internalCostServiceMessage={data.internalCostServiceMessage}
      />

      <form
        action={async () => {
          "use server"
          await signOut({ redirectTo: "/login" })
        }}
        className="fixed right-6 bottom-6"
      >
        <button
          type="submit"
          className="inline-flex h-10 items-center rounded-full border border-border bg-background/90 px-4 text-sm font-medium shadow-sm backdrop-blur transition-colors hover:bg-accent"
        >
          Sign out
        </button>
      </form>
    </>
  )
}
