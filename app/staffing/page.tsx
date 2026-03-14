import { signOut } from "@/auth"
import { StaffingBrowser } from "@/components/finance/staffing-browser"
import { requirePageAccess } from "@/lib/authz"
import { getStaffingPageData } from "@/lib/finance/queries"

type PageProps = {
  searchParams?: Promise<{
    year?: string
    domain?: string
  }>
}

export default async function StaffingPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getStaffingPageData(year, resolvedSearchParams?.domain, viewer)

  return (
    <>
      <StaffingBrowser
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        domains={data.domains}
        selectedDomain={data.selectedDomain}
        domainTarget={data.domainTarget}
        domainMonths={data.domainMonths}
        groups={data.groups}
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
