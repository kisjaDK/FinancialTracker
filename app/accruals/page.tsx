import { FinanceAppShell } from "@/components/finance/app-shell"
import { AccrualsBrowser } from "@/components/finance/accruals-browser"
import { requirePageAccess } from "@/lib/authz"
import { getAccrualsPageData } from "@/lib/finance/queries"

type SearchParamValue = string | string[] | undefined

type PageProps = {
  searchParams?: Promise<{
    year?: string
    domain?: string
    pillar?: string
    month?: SearchParamValue
  }>
}

function toArray(value: SearchParamValue) {
  if (Array.isArray(value)) {
    return value
  }

  return value ? [value] : []
}

export default async function AccrualsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("MEMBER")
  const resolvedSearchParams = await searchParams
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined

  const data = await getAccrualsPageData(
    {
      year,
      domain: resolvedSearchParams?.domain,
      pillar: resolvedSearchParams?.pillar,
      months: toArray(resolvedSearchParams?.month),
    },
    viewer
  )

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/accruals"
    >
      <AccrualsBrowser
        key={[
          data.activeYear,
          data.filters.domain,
          data.filters.pillar,
          data.filters.months.join("|"),
        ].join(":")}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        filterOptions={data.filterOptions}
        rows={data.rows}
        totals={data.totals}
      />
    </FinanceAppShell>
  )
}
