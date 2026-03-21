import type { LlmProvider } from "@/lib/ai/providers/types"
import { buildBudgetOutlookPrompt, BUDGET_OUTLOOK_SYSTEM_PROMPT } from "@/lib/ai/prompts/budget-outlook"
import {
  budgetOutlookOutputSchema,
  type BudgetOutlookOutput,
} from "@/lib/ai/schemas/budget-outlook"
import {
  getBudgetOutlookFacts,
  type DeterministicBudgetOutlookFacts,
} from "@/lib/finance/analysis"
import type { AppViewer } from "@/lib/authz"

export type BudgetOutlookStatusCode =
  | "idle"
  | "success"
  | "not-configured"
  | "provider-error"
  | "timeout"
  | "invalid-json"
  | "schema-error"
  | "empty-response"

export type BudgetOutlookStatus = {
  code: BudgetOutlookStatusCode
  provider: "ollama"
  model: string | null
  message: string
}

export type BudgetOutlookRunResult = {
  facts: DeterministicBudgetOutlookFacts
  ai: BudgetOutlookOutput | null
  status: BudgetOutlookStatus
}

type AiTaskConfig = {
  ollamaBaseUrl: string | null
  ollamaModel: string | null
  analysisPrompt: string
  analysisTimeoutMs: number
  isConfigured: boolean
  missingEnvVars: string[]
}

function parseJsonText(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error("EMPTY_RESPONSE")
  }

  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()

  return JSON.parse(withoutFence)
}

function buildStatus(
  code: BudgetOutlookStatusCode,
  message: string,
  model: string | null
): BudgetOutlookStatus {
  return {
    code,
    provider: "ollama",
    model,
    message,
  }
}

function classifyProviderError(error: unknown, model: string | null) {
  const message = error instanceof Error ? error.message : "Unknown AI provider error"
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes("timed out") ||
    normalizedMessage.includes("abort") ||
    normalizedMessage.includes("timeout")
  ) {
    return buildStatus("timeout", message, model)
  }

  return buildStatus("provider-error", message, model)
}

export async function generateBudgetOutlookForFacts(
  facts: DeterministicBudgetOutlookFacts,
  options?: {
    provider?: LlmProvider
    config?: AiTaskConfig
  }
): Promise<BudgetOutlookRunResult> {
  const config =
    options?.config ?? (await import("@/lib/ai/config")).getAiConfig()
  const model = config.ollamaModel || null

  if (!config.isConfigured) {
    return {
      facts,
      ai: null,
      status: buildStatus(
        "not-configured",
        `AI provider is not configured. Missing env vars: ${config.missingEnvVars.join(", ")}`,
        model
      ),
    }
  }

  const provider =
    options?.provider ??
    (await import("@/lib/ai/providers/ollama")).getOllamaProvider()

  try {
    const response = await provider.generateText({
      system: BUDGET_OUTLOOK_SYSTEM_PROMPT,
      prompt: buildBudgetOutlookPrompt(facts),
      model: config.ollamaModel ?? undefined,
    })

    if (!response.text.trim()) {
      return {
        facts,
        ai: null,
        status: buildStatus("empty-response", "The AI provider returned an empty response.", response.model),
      }
    }

    let parsed: unknown

    try {
      parsed = parseJsonText(response.text)
    } catch {
      return {
        facts,
        ai: null,
        status: buildStatus("invalid-json", "The AI response was not valid JSON.", response.model),
      }
    }

    const validated = budgetOutlookOutputSchema.safeParse(parsed)

    if (!validated.success) {
      return {
        facts,
        ai: null,
        status: buildStatus("schema-error", "The AI response did not match the required schema.", response.model),
      }
    }

    return {
      facts,
      ai: validated.data,
      status: buildStatus("success", "Budget outlook generated.", response.model),
    }
  } catch (error) {
    return {
      facts,
      ai: null,
      status: classifyProviderError(error, model),
    }
  }
}

export async function runBudgetOutlook(input: {
  year: number
  summaryKey: string
  viewer?: Pick<AppViewer, "role" | "scopes">
  provider?: LlmProvider
}) {
  const facts = await getBudgetOutlookFacts(input.year, input.summaryKey, input.viewer)
  return generateBudgetOutlookForFacts(facts, {
    provider: input.provider,
  })
}
