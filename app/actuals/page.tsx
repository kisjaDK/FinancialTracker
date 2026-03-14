import { signOut } from "@/auth"
import { ActualsBrowser } from "@/components/finance/actuals-browser"
import {
  getExternalActualImportsPageData,
  getFinanceWorkspaceData,
} from "@/lib/finance/queries"
import { requirePageAccess } from "@/lib/authz"

type PageProps = {
  searchParams?: Promise<{
    year?: string
    budgetAreaId?: string
    domain?: string
    subDomain?: string
    projectCode?: string
    view?: string
    user?: string
    fileName?: string
    seatId?: string
    team?: string
    importedFrom?: string
    importedTo?: string
  }>
}

export default async function ActualsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined

  const [internalData, externalData] = await Promise.all([
    getFinanceWorkspaceData(
      year,
      resolvedSearchParams?.budgetAreaId,
      [],
      [],
      false,
      viewer,
      {
        budgetAreaId: resolvedSearchParams?.budgetAreaId,
        domain: resolvedSearchParams?.domain,
        subDomain: resolvedSearchParams?.subDomain,
        projectCode: resolvedSearchParams?.projectCode,
      }
    ),
    getExternalActualImportsPageData(
      {
        year,
        user: resolvedSearchParams?.user,
        fileName: resolvedSearchParams?.fileName,
        seatId: resolvedSearchParams?.seatId,
        team: resolvedSearchParams?.team,
        importedFrom: resolvedSearchParams?.importedFrom,
        importedTo: resolvedSearchParams?.importedTo,
      },
      viewer
    ),
  ])

  return (
    <>
      <ActualsBrowser
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={externalData.activeYear}
        trackingYears={externalData.trackingYears}
        selectedAreaId={internalData.selectedAreaId}
        summary={internalData.summary}
        seats={internalData.seats}
        statusDefinitions={internalData.statusDefinitions}
        internalActualsMessage={internalData.internalActualsMessage}
        filters={externalData.filters}
        filterOptions={externalData.filterOptions}
        imports={externalData.imports}
        entries={externalData.entries}
        totals={externalData.totals}
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
