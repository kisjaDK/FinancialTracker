import { AnalysisBrowser } from "@/components/finance/analysis-browser";
import { FinanceAppShell } from "@/components/finance/app-shell";
import { requirePageAccess } from "@/lib/authz";
import { runAnalysisTest } from "@/lib/ai/tasks/run-analysis-test";

type PageProps = {
	searchParams?: Promise<{
		year?: string;
	}>;
};

export const dynamic = "force-dynamic";

export default async function AnalysisPage({ searchParams }: PageProps) {
	const viewer = await requirePageAccess("SUPER_ADMIN");
	const resolvedSearchParams = await searchParams;
	const selectedYear = resolvedSearchParams?.year
		? Number(resolvedSearchParams.year)
		: Number.NaN;
	const activeYear = Number.isFinite(selectedYear)
		? selectedYear
		: new Date().getFullYear();
	const result = await runAnalysisTest();

	return (
		<FinanceAppShell
			userName={viewer.name}
			userRole={viewer.role}
			activeYear={activeYear}
			currentPath="/analysis"
		>
			<AnalysisBrowser result={result} />
		</FinanceAppShell>
	);
}
