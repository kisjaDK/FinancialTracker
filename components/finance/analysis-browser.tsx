import { CircleAlert, CircleCheckBig } from "lucide-react";
import { FinancePageIntro } from "@/components/finance/page-intro";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { AnalysisTestResult } from "@/lib/ai/tasks/run-analysis-test";

type AnalysisBrowserProps = {
	result: AnalysisTestResult;
};

export function AnalysisBrowser({ result }: AnalysisBrowserProps) {
	const isConfigured = result.status !== "not-configured";
	const badgeLabel = result.ok
		? "Connected"
		: isConfigured
			? "Failed"
			: "Not configured";
	const badgeVariant = result.ok
		? "default"
		: isConfigured
			? "destructive"
			: "secondary";

	return (
		<div className="space-y-6">
			<FinancePageIntro
				title="Analysis"
				subtitle="Minimal server-side connectivity check for the configured AI analysis provider."
			/>

			<Card>
				<CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-1">
						<CardTitle>Ollama connection test</CardTitle>
						<CardDescription>
							The page runs a server-side Vercel AI SDK request when the AI provider is configured and otherwise shows the missing configuration state.
						</CardDescription>
					</div>
					<Badge
						variant={badgeVariant}
						className="inline-flex items-center gap-1.5"
					>
						{result.ok ? (
							<CircleCheckBig className="size-3.5" />
						) : (
							<CircleAlert className="size-3.5" />
						)}
						{badgeLabel}
					</Badge>
				</CardHeader>
				<CardContent className="space-y-5">
					<div className="grid gap-3 text-sm sm:grid-cols-3">
						<Metadata label="Base URL" value={result.baseUrl} />
						<Metadata label="Model" value={result.model} />
						<Metadata label="Prompt" value={result.prompt} />
					</div>

					<div className="space-y-2">
						<p className="text-sm font-medium text-foreground">
							{result.ok ? "Answer" : isConfigured ? "Error" : "Configuration"}
						</p>
						<div className="whitespace-pre-wrap rounded-xl border border-border/70 bg-muted/40 p-4 text-sm leading-6 text-foreground">
							{result.ok
								? result.answer || "The model returned an empty response."
								: result.error ||
									(isConfigured
										? "The request failed without an error message."
										: "The AI provider is not configured.")}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

type MetadataProps = {
	label: string;
	value: string;
};

function Metadata({ label, value }: MetadataProps) {
	return (
		<div className="rounded-xl border border-border/60 bg-background px-4 py-3">
			<p className="text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
				{label}
			</p>
			<p className="mt-2 break-all text-sm text-foreground">{value}</p>
		</div>
	);
}
