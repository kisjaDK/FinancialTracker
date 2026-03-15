import { FinanceAppShell } from "@/components/finance/app-shell"
import { FeatureRequestsBrowser } from "@/components/finance/feature-requests-browser"
import { requirePageAccess } from "@/lib/authz"
import { getFeatureRequestsPageData } from "@/lib/feature-requests"

export default async function FeatureRequestsPage() {
  const viewer = await requirePageAccess("GUEST")
  const data = await getFeatureRequestsPageData({
    id: viewer.id,
    name: viewer.name,
    email: viewer.email,
    role: viewer.role,
  })

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/feature-requests"
    >
      <FeatureRequestsBrowser featureRequests={data.featureRequests} />
    </FinanceAppShell>
  )
}
