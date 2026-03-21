import { AnalysisBrowser } from "@/components/finance/analysis-browser"
import { FinanceAppShell } from "@/components/finance/app-shell"
import { requirePageAccess } from "@/lib/authz"
import { getAiConfig } from "@/lib/ai/config"
import { getBudgetOutlookPageData } from "@/lib/finance/analysis"

type PageProps = {
	searchParams?: Promise<{
		year?: string;
		summaryKey?: string;
	}>;
};

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ searchParams }: PageProps) {
	const viewer = await requirePageAccess("SUPER_ADMIN");
	const resolvedSearchParams = await searchParams;
	const selectedYear = resolvedSearchParams?.year
		? Number(resolvedSearchParams.year)
		: undefined;
	const pageData = await getBudgetOutlookPageData(
		selectedYear,
		resolvedSearchParams?.summaryKey,
		viewer,
	);
	const aiConfig = getAiConfig();

	return (
		<FinanceAppShell
			userName={viewer.name}
			userRole={viewer.role}
			activeYear={pageData.activeYear}
			currentPath="/analysis"
		>
			<AnalysisBrowser
				activeYear={pageData.activeYear}
				trackingYears={pageData.trackingYears}
				summaryOptions={pageData.summaryOptions}
				selectedSummaryKey={pageData.selectedSummaryKey}
				initialFacts={pageData.initialFacts}
				aiConfig={aiConfig}
			/>
		</FinanceAppShell>
	);
}
