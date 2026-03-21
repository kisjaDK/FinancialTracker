import assert from "node:assert/strict"
import test from "node:test"
import {
  buildBudgetOutlookFactsFromData,
  type BudgetOutlookSeatInput,
  type BudgetOutlookSummaryInput,
} from "@/lib/finance/analysis"
import { budgetOutlookOutputSchema } from "@/lib/ai/schemas/budget-outlook"
import { generateBudgetOutlookForFacts } from "@/lib/ai/tasks/run-budget-outlook"

function createSummary(overrides: Partial<BudgetOutlookSummaryInput> = {}): BudgetOutlookSummaryInput {
  return {
    id: "architecture::l68610001",
    displayName: "Architecture",
    domain: "Data & Analytics",
    subDomain: "Architecture",
    projectCode: "L68610001",
    budget: 1_000_000,
    amountGivenBudget: 980_000,
    financeViewBudget: 1_000_000,
    spentToDate: 400_000,
    remainingBudget: 600_000,
    totalForecast: 1_120_000,
    forecastRemaining: -120_000,
    permForecast: 720_000,
    extForecast: 400_000,
    cloudCostForecast: 220_000,
    seatCount: 4,
    activeSeatCount: 3,
    openSeatCount: 1,
    ...overrides,
  }
}

function createSeat(overrides: Partial<BudgetOutlookSeatInput> = {}): BudgetOutlookSeatInput {
  return {
    seatId: "300127",
    inSeat: "Jane Doe",
    description: "Data Architect",
    team: "Architecture",
    status: "Active",
    resourceType: "Internal",
    totalForecast: 240_000,
    hasForecastAdjustments: false,
    monthlyForecast: Array.from({ length: 12 }, (_, monthIndex) =>
      monthIndex >= 3 ? 30_000 : 0
    ),
    months: Array.from({ length: 12 }, (_, monthIndex) => ({
      monthIndex,
      actualAmountDkk: monthIndex < 3 ? 20_000 : 0,
      actualAmountRaw: null,
    })),
    ...overrides,
  }
}

test("buildBudgetOutlookFactsFromData computes forecast and coverage signals", () => {
  const facts = buildBudgetOutlookFactsFromData({
    year: 2026,
    summary: createSummary(),
    seats: [
      createSeat(),
      createSeat({
        seatId: "300128",
        inSeat: "Vacant",
        status: "Open",
        resourceType: "External",
        totalForecast: 400_000,
        hasForecastAdjustments: true,
      }),
      createSeat({
        seatId: "300129",
        inSeat: "Cloud Budget",
        resourceType: "Cloud",
        totalForecast: 220_000,
      }),
    ],
  })

  assert.equal(facts.scope.year, 2026)
  assert.equal(facts.summary.forecastRemaining, -120_000)
  assert.equal(facts.coverage.seatsWithForecastAdjustments, 1)
  assert.equal(facts.coverage.forecastMonthsWithoutActuals, 27)
  assert.equal(facts.staffing.openSeatForecast, 400_000)
  assert.equal(facts.resourceMix.topResourceTypes[0]?.resourceType, "External")
  assert.ok(facts.drivers.length > 0)
  assert.ok(facts.coverage.uncoveredForecastAmount > 0)
})

test("budgetOutlookOutputSchema accepts valid structured AI output", () => {
  const parsed = budgetOutlookOutputSchema.parse({
    outlook: "watch",
    summary: "Forecast is slightly above budget because a small number of seats drive most of the remaining spend.",
    keyDrivers: [
      {
        title: "Forecast vs budget",
        direction: "unfavorable",
        explanation: "Forecast is above budget.",
      },
    ],
    watchouts: ["Open-seat delivery risk remains."],
    actions: ["Review the largest open-seat forecast lines."],
    confidence: "medium",
    coverageNotes: ["Several future months still rely on forecast rather than actuals."],
  })

  assert.equal(parsed.outlook, "watch")
  assert.equal(parsed.keyDrivers.length, 1)
})

test("budgetOutlookOutputSchema rejects invalid confidence and empty summary", () => {
  const invalid = budgetOutlookOutputSchema.safeParse({
    outlook: "watch",
    summary: "   ",
    keyDrivers: [],
    watchouts: [],
    actions: [],
    confidence: "certain",
  })

  assert.equal(invalid.success, false)
})

test("generateBudgetOutlookForFacts returns validated AI output on success", async () => {
  const result = await generateBudgetOutlookForFacts(
    buildBudgetOutlookFactsFromData({
      year: 2026,
      summary: createSummary(),
      seats: [createSeat()],
    }),
    {
      config: {
        ollamaBaseUrl: "http://localhost:11434",
        ollamaModel: "llama3",
        analysisPrompt: "hello",
        analysisTimeoutMs: 30_000,
        isConfigured: true,
        missingEnvVars: [],
      },
      provider: {
        async generateText() {
          return {
            model: "llama3",
            text: JSON.stringify({
              outlook: "watch",
              summary: "Forecast is slightly above budget.",
              keyDrivers: [
                {
                  title: "Forecast vs budget",
                  direction: "unfavorable",
                  explanation: "Forecast remains above budget.",
                },
              ],
              watchouts: ["Coverage still depends on future forecast months."],
              actions: ["Review the largest forecast-driving seats."],
              confidence: "medium",
              coverageNotes: ["Actuals are incomplete for future months."],
            }),
          }
        },
      },
    }
  )

  assert.equal(result.status.code, "success")
  assert.equal(result.ai?.outlook, "watch")
})

test("generateBudgetOutlookForFacts falls back on invalid JSON and timeout errors", async () => {
  const facts = buildBudgetOutlookFactsFromData({
    year: 2026,
    summary: createSummary(),
    seats: [createSeat()],
  })

  const invalidJson = await generateBudgetOutlookForFacts(facts, {
    config: {
      ollamaBaseUrl: "http://localhost:11434",
      ollamaModel: "llama3",
      analysisPrompt: "hello",
      analysisTimeoutMs: 30_000,
      isConfigured: true,
      missingEnvVars: [],
    },
    provider: {
      async generateText() {
        return {
          model: "llama3",
          text: "{not valid json",
        }
      },
    },
  })

  assert.equal(invalidJson.status.code, "invalid-json")
  assert.equal(invalidJson.ai, null)

  const timeout = await generateBudgetOutlookForFacts(facts, {
    config: {
      ollamaBaseUrl: "http://localhost:11434",
      ollamaModel: "llama3",
      analysisPrompt: "hello",
      analysisTimeoutMs: 30_000,
      isConfigured: true,
      missingEnvVars: [],
    },
    provider: {
      async generateText() {
        throw new Error("Ollama request timed out")
      },
    },
  })

  assert.equal(timeout.status.code, "timeout")
  assert.equal(timeout.ai, null)
})
