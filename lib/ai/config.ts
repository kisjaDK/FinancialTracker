import "server-only";

const DEFAULT_ANALYSIS_PROMPT = "hello";
const DEFAULT_ANALYSIS_TIMEOUT_MS = 30_000;

function parseTimeout(value: string | undefined) {
	if (!value) {
		return DEFAULT_ANALYSIS_TIMEOUT_MS;
	}

	const parsed = Number(value);

	if (!Number.isFinite(parsed) || parsed <= 0) {
		return DEFAULT_ANALYSIS_TIMEOUT_MS;
	}

	return parsed;
}

export function getAiConfig() {
	const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || null;
	const ollamaModel = process.env.OLLAMA_MODEL?.trim() || null;
	const missingEnvVars = [
		!ollamaBaseUrl ? "OLLAMA_BASE_URL" : null,
		!ollamaModel ? "OLLAMA_MODEL" : null,
	].filter(Boolean) as string[];

	return {
		ollamaBaseUrl,
		ollamaModel,
		analysisPrompt:
			process.env.ANALYSIS_TEST_PROMPT?.trim() || DEFAULT_ANALYSIS_PROMPT,
		analysisTimeoutMs: parseTimeout(process.env.OLLAMA_TIMEOUT_MS),
		isConfigured: missingEnvVars.length === 0,
		missingEnvVars,
	};
}
