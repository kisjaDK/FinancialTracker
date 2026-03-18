import "server-only";

import { generateText } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import { getAiConfig } from "@/lib/ai/config";
import type {
	GenerateTextInput,
	GenerateTextResult,
	LlmProvider,
} from "@/lib/ai/providers/types";

export class OllamaProvider implements LlmProvider {
	private readonly modelFactory;

	constructor() {
		const config = getAiConfig();
		if (!config.isConfigured || !config.ollamaBaseUrl) {
			throw new Error(
				`AI provider is not configured. Missing env vars: ${config.missingEnvVars.join(", ")}`
			);
		}

		this.modelFactory = createOllama({
			baseURL: config.ollamaBaseUrl,
			compatibility: "strict",
		});
	}

	async generateText({
		prompt,
		model,
	}: GenerateTextInput): Promise<GenerateTextResult> {
		const config = getAiConfig();
		if (!config.isConfigured || !config.ollamaModel) {
			throw new Error(
				`AI provider is not configured. Missing env vars: ${config.missingEnvVars.join(", ")}`
			);
		}

		const resolvedModel = model || config.ollamaModel;

		const abortController = new AbortController();
		const timeout = setTimeout(
			() => abortController.abort("Ollama request timed out"),
			config.analysisTimeoutMs,
		);

		try {
			const result = await generateText({
				model: this.modelFactory(resolvedModel),
				prompt,
				abortSignal: abortController.signal,
			});

			return {
				text: result.text,
				model: resolvedModel,
			};
		} finally {
			clearTimeout(timeout);
		}
	}
}

let ollamaProvider: OllamaProvider | undefined;

export function getOllamaProvider() {
	if (!ollamaProvider) {
		ollamaProvider = new OllamaProvider();
	}

	return ollamaProvider;
}
