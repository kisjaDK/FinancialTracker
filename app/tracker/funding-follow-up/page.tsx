import { FinanceAppShell } from "@/components/finance/app-shell"
import { FundingFollowUpBrowser } from "@/components/finance/funding-follow-up-browser"
import { requirePageAccess } from "@/lib/authz"
import { getFundingFollowUpPageData } from "@/lib/finance/queries"

type PageProps = {
  searchParams?: Promise<{
    year?: string
    domain?: string
    subDomain?: string
    projectCode?: string
    funding?: string
  }>
}

export default async function FundingFollowUpPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("GUEST")
  const resolvedSearchParams = await searchParams
  const data = await getFundingFollowUpPageData(
    {
      year: resolvedSearchParams?.year ? Number(resolvedSearchParams.year) : undefined,
      domain: resolvedSearchParams?.domain,
      subDomain: resolvedSearchParams?.subDomain,
      projectCode: resolvedSearchParams?.projectCode,
      funding: resolvedSearchParams?.funding,
    },
    viewer
  )

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/tracker"
    >
      <FundingFollowUpBrowser
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        selectedDomain={data.selectedDomain}
        selectedSubDomain={data.selectedSubDomain}
        selectedProjectCode={data.selectedProjectCode}
        filterOptions={data.filterOptions}
        selectedFunding={data.selectedFunding}
        fundingOptions={data.fundingOptions}
        summaries={data.summaries}
        seats={data.seats}
      />
    </FinanceAppShell>
  )
}
