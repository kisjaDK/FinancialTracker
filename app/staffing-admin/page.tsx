import { signOut } from "@/auth"
import { StaffingAdminBrowser } from "@/components/finance/staffing-admin-browser"
import { requirePageAccess } from "@/lib/authz"
import { getStaffingAdminPageData } from "@/lib/finance/queries"

type PageProps = {
  searchParams?: Promise<{
    year?: string
  }>
}

export default async function StaffingAdminPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("ADMIN")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getStaffingAdminPageData(year, viewer)

  return (
    <>
      <StaffingAdminBrowser
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        targets={data.targets}
        hierarchyOptions={data.hierarchyOptions}
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
