import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import { ExternalActualsBrowser } from "@/components/finance/external-actuals-browser"
import { getExternalActualImportsPageData } from "@/lib/finance/queries"

type PageProps = {
  searchParams?: Promise<{
    year?: string
    user?: string
    fileName?: string
    seatId?: string
    team?: string
    importedFrom?: string
    importedTo?: string
  }>
}

export default async function ExternalActualsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const user = session.user
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getExternalActualImportsPageData({
    year,
    user: resolvedSearchParams?.user,
    fileName: resolvedSearchParams?.fileName,
    seatId: resolvedSearchParams?.seatId,
    team: resolvedSearchParams?.team,
    importedFrom: resolvedSearchParams?.importedFrom,
    importedTo: resolvedSearchParams?.importedTo,
  })

  return (
    <>
      <ExternalActualsBrowser
        userName={user?.name || "Pandora user"}
        userEmail={user?.email || "Not available"}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        filterOptions={data.filterOptions}
        imports={data.imports}
        entries={data.entries}
        totals={data.totals}
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
