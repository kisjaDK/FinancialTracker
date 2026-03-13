import { signOut } from "@/auth"
import { ForecastsBrowser } from "@/components/finance/forecasts-browser"
import { requirePageAccess } from "@/lib/authz"
import { getForecastsPageData } from "@/lib/finance/queries"

type PageProps = {
  searchParams?: Promise<{
    year?: string
    subDomain?: string
    team?: string
    seatId?: string
    name?: string
    status?: string
    selectedSeatId?: string
  }>
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
      subDomain: resolvedSearchParams?.subDomain,
      team: resolvedSearchParams?.team,
      seatId: resolvedSearchParams?.seatId,
      name: resolvedSearchParams?.name,
      status: resolvedSearchParams?.status,
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
