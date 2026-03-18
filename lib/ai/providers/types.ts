import "server-only";

export type GenerateTextInput = {
	prompt: string;
	model?: string;
};

export type GenerateTextResult = {
	text: string;
	model: string;
	raw?: unknown;
};

export interface LlmProvider {
	generateText(input: GenerateTextInput): Promise<GenerateTextResult>;
}
