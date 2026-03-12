import { signOut } from "@/auth"
import { PeopleRosterBrowser } from "@/components/finance/people-roster-browser"
import { getPeopleRosterPageData } from "@/lib/finance/queries"
import { requirePageAccess } from "@/lib/authz"

type SearchParamValue = string | string[] | undefined

type PageProps = {
  searchParams?: Promise<{
    year?: string
    seatId?: SearchParamValue
    name?: SearchParamValue
    email?: SearchParamValue
    team?: SearchParamValue
    subDomain?: SearchParamValue
    vendor?: SearchParamValue
    location?: SearchParamValue
    status?: SearchParamValue
    role?: SearchParamValue
    band?: SearchParamValue
    validation?: string
  }>
}

function toArray(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value
  }

  return value ? [value] : []
}

export default async function PeopleRosterPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getPeopleRosterPageData({
    year,
    seatIds: toArray(resolvedSearchParams?.seatId),
    names: toArray(resolvedSearchParams?.name),
    emails: toArray(resolvedSearchParams?.email),
    teams: toArray(resolvedSearchParams?.team),
    subDomains: toArray(resolvedSearchParams?.subDomain),
    vendors: toArray(resolvedSearchParams?.vendor),
    locations: toArray(resolvedSearchParams?.location),
    statuses: toArray(resolvedSearchParams?.status),
    roles: toArray(resolvedSearchParams?.role),
    bands: toArray(resolvedSearchParams?.band),
    validation: resolvedSearchParams?.validation,
  }, viewer)

  return (
    <>
      <PeopleRosterBrowser
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        filterOptions={data.filterOptions}
        people={data.people}
        totals={data.totals}
        rosterImports={data.rosterImports}
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
