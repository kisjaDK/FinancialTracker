import type { DeterministicBudgetOutlookFacts } from "@/lib/finance/analysis"

export const BUDGET_OUTLOOK_SYSTEM_PROMPT = `
You are a finance analysis assistant for an internal budgeting tool.
Use only the supplied facts.
Do not invent numbers, causes, teams, or actions not supported by the facts.
Respond with valid JSON only.
Keep the summary concise and executive in tone.
If the facts indicate uncertainty or partial coverage, reflect that in coverageNotes or confidence.
`.trim()

export function buildBudgetOutlookPrompt(
  facts: DeterministicBudgetOutlookFacts
) {
  return `
Generate a budget outlook response for the selected tracker summary row.

Required JSON shape:
{
  "outlook": "on_track" | "watch" | "off_track",
  "summary": "string",
  "keyDrivers": [
    {
      "title": "string",
      "direction": "favorable" | "unfavorable" | "neutral",
      "explanation": "string"
    }
  ],
  "watchouts": ["string"],
  "actions": ["string"],
  "confidence": "low" | "medium" | "high",
  "coverageNotes": ["string"]
}

Facts:
${JSON.stringify(facts, null, 2)}
`.trim()
}
