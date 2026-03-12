import { signOut } from "@/auth"
import { AuditLogBrowser } from "@/components/finance/audit-log-browser"
import { getAuditPageData } from "@/lib/finance/queries"
import { requirePageAccess } from "@/lib/authz"

type SearchParamValue = string | string[] | undefined

type PageProps = {
  searchParams?: Promise<{
    year?: string
    search?: SearchParamValue
    user?: SearchParamValue
    from?: string
    to?: string
  }>
}

function firstValue(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value
}

export default async function AuditLogPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getAuditPageData({
    year,
    search: firstValue(resolvedSearchParams?.search),
    user: firstValue(resolvedSearchParams?.user),
    from: resolvedSearchParams?.from,
    to: resolvedSearchParams?.to,
  }, viewer)

  return (
    <>
      <AuditLogBrowser
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        logs={data.logs}
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
