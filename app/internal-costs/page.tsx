import { signOut } from "@/auth"
import { InternalCostsBrowser } from "@/components/finance/internal-costs-browser"
import { getInternalCostsPageData } from "@/lib/finance/queries"
import { requirePageAccess } from "@/lib/authz"

type PageProps = {
  searchParams?: Promise<{
    year?: string
  }>
}

export default async function InternalCostsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("ADMIN")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getInternalCostsPageData(year)

  return (
    <>
      <InternalCostsBrowser
        key={data.activeYear}
        userName={viewer.name}
        userEmail={viewer.email}
        userRole={viewer.role}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        assumptions={data.assumptions}
        internalActualsMessage={data.internalActualsMessage}
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
