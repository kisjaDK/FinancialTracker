import "server-only";

import { getAiConfig } from "@/lib/ai/config";
import { getOllamaProvider } from "@/lib/ai/providers/ollama";

export type AnalysisTestResult = {
	ok: boolean;
	status: "connected" | "not-configured" | "failed";
	model: string;
	baseUrl: string;
	prompt: string;
	answer: string | null;
	error: string | null;
};

export async function runAnalysisTest(): Promise<AnalysisTestResult> {
	const config = getAiConfig();
	if (!config.isConfigured) {
		return {
			ok: false,
			status: "not-configured",
			model: config.ollamaModel || "Not configured",
			baseUrl: config.ollamaBaseUrl || "Not configured",
			prompt: config.analysisPrompt,
			answer: null,
			error: `AI provider is not configured. Missing env vars: ${config.missingEnvVars.join(", ")}`,
		};
	}

	try {
		const result = await getOllamaProvider().generateText({
			prompt: config.analysisPrompt,
			model: config.ollamaModel ?? undefined,
		});

		return {
			ok: true,
			status: "connected",
			model: result.model,
			baseUrl: config.ollamaBaseUrl || "Not configured",
			prompt: config.analysisPrompt,
			answer: result.text.trim() || null,
			error: null,
		};
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown Ollama error";

		return {
			ok: false,
			status: "failed",
			model: config.ollamaModel || "Not configured",
			baseUrl: config.ollamaBaseUrl || "Not configured",
			prompt: config.analysisPrompt,
			answer: null,
			error: message,
		};
	}
}
