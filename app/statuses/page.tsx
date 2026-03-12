import { auth, signOut } from "@/auth"
import { redirect } from "next/navigation"
import { StatusesBrowser } from "@/components/finance/statuses-browser"
import { getStatusesPageData } from "@/lib/finance/queries"

type PageProps = {
  searchParams?: Promise<{
    year?: string
  }>
}

export default async function StatusesPage({ searchParams }: PageProps) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  const user = session.user
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined
  const data = await getStatusesPageData(year)

  return (
    <>
      <StatusesBrowser
        userName={user?.name || "Pandora user"}
        userEmail={user?.email || "Not available"}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        statuses={data.statuses}
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
