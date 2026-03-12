import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import { AuditLogBrowser } from "@/components/finance/audit-log-browser"
import { getAuditPageData } from "@/lib/finance/queries"

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
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const user = session.user
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
  })

  return (
    <>
      <AuditLogBrowser
        userName={user?.name || "Pandora user"}
        userEmail={user?.email || "Not available"}
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
