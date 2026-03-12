import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import { BudgetMovementsBrowser } from "@/components/finance/budget-movements-browser"
import { getBudgetMovementsPageData } from "@/lib/finance/queries"

type PageProps = {
  searchParams?: Promise<{
    year?: string
    search?: string
    category?: string
    receivingFunding?: string
    givingPillar?: string
  }>
}

export default async function BudgetMovementsPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const user = session.user
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getBudgetMovementsPageData({
    year,
    search: resolvedSearchParams?.search,
    category: resolvedSearchParams?.category,
    receivingFunding: resolvedSearchParams?.receivingFunding,
    givingPillar: resolvedSearchParams?.givingPillar,
  })

  return (
    <>
      <BudgetMovementsBrowser
        userName={user?.name || "Pandora user"}
        userEmail={user?.email || "Not available"}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        filterOptions={data.filterOptions}
        movements={data.movements}
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
