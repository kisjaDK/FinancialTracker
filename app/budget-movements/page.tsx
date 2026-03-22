import { FinanceAppShell } from "@/components/finance/app-shell";
import { BudgetMovementsBrowser } from "@/components/finance/budget-movements-browser";
import { getBudgetMovementsPageData } from "@/lib/finance/queries";
import { requirePageAccess } from "@/lib/authz";

type PageProps = {
  searchParams?: Promise<{
    year?: string;
    search?: string;
    category?: string;
    funding?: string;
    receivingFunding?: string;
    givingPillar?: string;
  }>;
};

export default async function BudgetMovementsPage({ searchParams }: PageProps) {
  const viewer = await requirePageAccess("ADMIN");
  const resolvedSearchParams = await searchParams;
  const year = resolvedSearchParams?.year
    ? Number(resolvedSearchParams.year)
    : undefined;
  const data = await getBudgetMovementsPageData(
    {
      year,
      search: resolvedSearchParams?.search,
      category: resolvedSearchParams?.category,
      funding: resolvedSearchParams?.funding,
      receivingFunding: resolvedSearchParams?.receivingFunding,
      givingPillar: resolvedSearchParams?.givingPillar,
    },
    viewer,
  );

  return (
    <FinanceAppShell
      userName={viewer.name}
      userRole={viewer.role}
      activeYear={data.activeYear}
      currentPath="/budget-movements"
    >
      <BudgetMovementsBrowser
        activeYear={data.activeYear}
        trackingYears={data.trackingYears}
        filters={data.filters}
        filterOptions={data.filterOptions}
        fundingValues={data.fundingValues}
        fundingSummaries={data.fundingSummaries}
        movements={data.movements}
        totals={data.totals}
        imports={data.imports}
      />
    </FinanceAppShell>
  );
}
