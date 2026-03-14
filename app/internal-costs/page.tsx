import { FinanceAppShell } from "@/components/finance/app-shell";
import { InternalCostsBrowser } from "@/components/finance/internal-costs-browser";
import { getInternalCostsPageData } from "@/lib/finance/queries";
import { requirePageAccess } from "@/lib/authz";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
  }>;
};

export default async function InternalCostsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("ADMIN");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getInternalCostsPageData(year);

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/internal-costs"
    >
      <InternalCostsBrowser
        key={data.activeYear}
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        assumptions={data.assumptions}
        internalActualsMessage={data.internalActualsMessage}
      />
    </FinanceAppShell>
  );
}
