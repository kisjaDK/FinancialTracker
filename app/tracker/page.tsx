import { signOut } from "@/auth"
import { FinanceWorkspace } from "@/components/finance/workspace"
import { getFinanceWorkspaceData } from "@/lib/finance/queries"
import { requirePageAccess } from "@/lib/authz"

type SearchParamValue = string | string[] | undefined

type PageProps = {
  searchParams?: Promise<{
    year?: string
    budgetAreaId?: string
    team?: SearchParamValue
    missingActualMonth?: SearchParamValue
    openSeatsOnly?: string
    seatSortField?: string
    seatSortDirection?: string
  }>
}

function toArray(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value
  }

  return value ? [value] : []
}

export default async function TrackerPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("GUEST")
  const resolvedSearchParams = await searchParams
  const selectedYear = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const workspace = await getFinanceWorkspaceData(
    selectedYear,
    resolvedSearchParams?.budgetAreaId,
    toArray(resolvedSearchParams?.team),
    toArray(resolvedSearchParams?.missingActualMonth),
    resolvedSearchParams?.openSeatsOnly === "true",
    viewer
  )

  return (
    <>
      <FinanceWorkspace
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={workspace.activeYear}
        trackingYears={workspace.trackingYears}
        summary={workspace.summary}
        seats={workspace.seats}
        budgetAreas={workspace.budgetAreas.map((area) => ({
          ...area,
          displayName:
            area.displayName ||
            `${area.subDomain || area.pillar || area.projectCode} · ${area.costCenter}`,
        }))}
        selectedAreaId={workspace.selectedAreaId}
        statusDefinitions={workspace.statusDefinitions}
        trackerTeamFilters={workspace.trackerTeamFilters}
        trackerTeamOptions={workspace.trackerTeamOptions}
        missingActualMonthFilters={workspace.missingActualMonthFilters}
        missingActualMonthOptions={workspace.missingActualMonthOptions}
        openSeatsOnly={workspace.openSeatsOnly}
        seatSortField={resolvedSearchParams?.seatSortField}
        seatSortDirection={resolvedSearchParams?.seatSortDirection}
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
