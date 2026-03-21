# AI Budget Outlook & Driver Analysis PRD

## 1. Overview

### Product Name
AI Budget Outlook

### Objective
Help finance stakeholders understand budget health, major drivers, and near-term risks by combining the app's existing deterministic tracker calculations with a server-side AI narrative layer powered through the existing Ollama integration.

### Problem Statement
The application already computes budget, actuals, forecast, staffing, and seat-level detail, but users still need to interpret:
- whether a summary row is on track
- which tracker drivers matter most
- where risk is building
- what follow-up actions deserve attention

### V1 Solution
Add an AI explanation layer on top of the current finance tracker model. The AI layer must:
- use only deterministic facts produced by the app
- generate structured narrative output
- stay server-side
- degrade safely when AI is unavailable or invalid

V1 is a `SUPER_ADMIN` pilot on the existing `/analysis` surface.

---

## 2. Goals & Non-Goals

### Goals
- Provide concise financial outlook summaries for existing tracker data.
- Explain major favorable and unfavorable drivers using current data structures.
- Highlight risks such as forecast pressure, open seats, external-cost concentration, and actuals coverage gaps.
- Suggest practical follow-up actions grounded in the provided facts.
- Enforce structured, validated AI output.
- Reuse the existing Ollama provider abstraction and current finance query layer.

### Non-Goals
- No new forecasting engine.
- No AI-generated budget math.
- No browser-side model access.
- No autonomous decisions or workflow automation.
- No new cross-domain access model.
- No required persistence layer for AI runs in v1.

---

## 3. Target Users

### Primary V1 Users
- `SUPER_ADMIN` users validating the feature on `/analysis`

### Later Expansion Candidates
- Scoped finance viewers with existing domain/sub-domain access controls

Any future expansion must honor the existing viewer scope model rather than introducing a separate org or tenant abstraction.

---

## 4. Current Project Context

This project does not use the attached PRD's generic `orgId`, `costCenterId`, `BudgetSnapshot`, or `BudgetDriver` model.

The current finance source of truth is the tracker domain model in Prisma and the query/derivation layer:
- `TrackingYear`
- `BudgetArea`
- `BudgetMovement`
- `TrackerSeat`
- `SeatMonth`
- `ExternalActualEntry`
- `DepartmentMapping`
- `CostAssumption`
- `ExchangeRate`

Primary deterministic facts already come from:
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/queries.ts`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/queries.ts)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/derive.ts`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/finance/derive.ts)

Current AI infrastructure already exists for server-side Ollama access:
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/ai/config.ts`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/ai/config.ts)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/ai/providers/ollama.ts`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/lib/ai/providers/ollama.ts)
- [`/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/app/analysis/page.tsx`](/Users/kimstuhrjakobsen/Code/DA-FT-nextjs/app/analysis/page.tsx)

---

## 5. Product Scope

### V1 Scope
Generate a structured AI outlook for a selected tracker slice using existing deterministic data.

Supported analysis scopes for v1:
- `year` + `summaryKey`
- `year` + `budgetAreaId` when a tighter slice is needed

The narrative should explain:
- budget vs spend vs forecast position
- remaining budget and forecast remaining
- top drivers behind the current outlook
- staffing and seat-based risks
- practical follow-up actions

### V1 Out Of Scope
- trend analysis across multiple years
- scenario simulation
- saved AI run history
- background job orchestration
- user-authored prompts
- raw transaction-level invoice interpretation beyond existing aggregated facts

---

## 6. Core Use Cases

### Summary Row Outlook
User selects a tracker summary row and asks: are we on track for this sub-domain/project grouping?

### Variance Explanation
User asks: what is driving the gap between budget and forecast?

### Risk Awareness
User asks: what should I watch over the rest of the year?

### Action Guidance
User asks: what follow-up actions are most justified by the current tracker facts?

---

## 7. Functional Requirements

### 7.1 Deterministic Facts Layer
The system must use existing app calculations for:
- budget
- amount-given budget
- finance-view budget
- spent to date
- remaining budget
- total forecast
- forecast remaining
- perm forecast
- ext forecast
- cloud cost forecast
- seat count
- active seat count
- open seat count

The system must not ask the LLM to compute these values independently.

### 7.2 Repo-Native Driver Extraction
The system must derive drivers from current tracker entities before calling AI.

Candidate driver categories for v1:
- budget movement concentration or unusual budget deltas
- forecast vs budget gap by selected summary row
- seat-level forecast concentration
- open-seat load
- external vs permanent cost mix
- cloud or resource-type concentration
- actuals coverage gaps where forecast remains but actuals are absent

Drivers should be ranked by impact and labeled as favorable, unfavorable, or mixed/neutral.

### 7.3 AI Narrative Generation
The system must generate structured sections:
- `outlook`: `on_track | watch | off_track`
- `summary`: short executive narrative
- `keyDrivers`: ranked explanations tied to provided facts
- `watchouts`: specific risk statements
- `actions`: practical follow-up actions
- `confidence`: `low | medium | high`
- `coverageNotes`: optional notes about missing, partial, or uncertain inputs

### 7.4 Fallback Behavior
If the AI provider fails, times out, returns invalid JSON, or fails schema validation:
- return deterministic facts only
- return no fabricated AI text
- provide a deterministic fallback status message
- mark confidence as `low`
- include machine-readable error/status metadata

---

## 8. Data Inputs And Source Mapping

### Summary-Level Facts
Use tracker summary data already produced by `getBudgetAreaSummary`.

### Detail-Level Facts
Use tracker detail and seat derivation logic already produced by:
- `getTrackerDetail`
- `deriveSeatMetrics`
- effective seat overrides via `getEffectiveSeat`

### Supporting Inputs
Use current reference data as needed:
- `DepartmentMapping` for hierarchy alignment
- `CostAssumption` for internal cost derivation
- `ExchangeRate` for DKK-normalized spend
- `ExternalActualEntry` and `SeatMonth` for actuals coverage and forecast replacement context

### Terminology
The PRD and implementation must use project-native terms:
- summary row
- budget area
- tracker seat
- seat month
- budget movement
- external actual
- domain
- sub-domain
- project code
- scope-restricted viewer

---

## 9. API And Interface Requirements

### Proposed Endpoint
Use a repo-native analysis endpoint, for example:

`POST /api/analysis/budget-outlook`

### Request Shape
```json
{
  "year": 2026,
  "summaryKey": "sub-domain::project-code",
  "budgetAreaId": "optional-budget-area-id"
}
```

Rules:
- `year` is required.
- At least one analysis selector is required.
- `summaryKey` is the preferred v1 selector for summary-row analysis.
- `budgetAreaId` may be used when the UI needs budget-area-specific context.
- Access control must use the existing authenticated viewer context.

### Response Shape
```json
{
  "facts": {
    "scope": {
      "year": 2026,
      "summaryKey": "example",
      "budgetAreaId": null
    },
    "summary": {
      "budget": 0,
      "spentToDate": 0,
      "totalForecast": 0,
      "remainingBudget": 0,
      "forecastRemaining": 0,
      "seatCount": 0,
      "activeSeatCount": 0,
      "openSeatCount": 0
    },
    "drivers": []
  },
  "ai": {
    "outlook": "watch",
    "summary": "string",
    "keyDrivers": [],
    "watchouts": [],
    "actions": [],
    "confidence": "medium",
    "coverageNotes": []
  },
  "status": {
    "source": "ai",
    "provider": "ollama",
    "error": null
  }
}
```

The exact wire shape can evolve during implementation, but the contract must keep deterministic facts separate from AI narrative output and preserve machine-readable status metadata.

---

## 10. System Architecture

High-level flow:

`Prisma DB -> finance query layer -> deterministic analysis payload -> AI prompt builder -> Ollama provider -> Zod validation -> analysis API -> /analysis UI`

### Architecture Requirements
- Keep all model access server-side.
- Reuse the existing provider abstraction under `lib/ai/`.
- Keep prompt templates separate from business logic.
- Validate structured output before returning it.
- Avoid introducing a second finance-calculation path.

### Suggested Code Organization
- `lib/ai/prompts/`
- `lib/ai/schemas/`
- `lib/ai/tasks/`
- `app/api/analysis/budget-outlook/route.ts`

Only add persistence if a concrete v1 operational need appears during implementation.

---

## 11. Prompting Requirements

### System Prompt Constraints
- Use only supplied facts.
- Do not invent numbers, entities, or causes.
- Use concise executive language.
- Output valid JSON only.
- Distinguish certainty from uncertainty.
- Mention data coverage gaps when facts are incomplete.

### Prompt Input Design
The prompt payload should include:
- selected scope metadata
- summary metrics
- top precomputed drivers
- notable seat/forecast/actual coverage facts
- any important guardrail notes

The prompt should not include raw database credentials, unrestricted data dumps, or unrelated cross-domain information.

---

## 12. UX / UI Requirements

### Placement
V1 extends the existing `/analysis` experience. It does not add a new main navigation section.

### V1 Screen Requirements
The Analysis page should be able to show:
- selected scope
- deterministic summary facts
- outlook status
- executive summary
- key drivers
- watchouts
- suggested actions
- confidence
- fallback/error state when AI is unavailable

### UX Guardrails
- Users must still see deterministic facts when AI fails.
- The UI must clearly distinguish generated narrative from computed finance values.
- The UI must not imply that the AI created the budget math.

---

## 13. Security, Access, And Privacy

### Access Control
- V1 is limited to `SUPER_ADMIN`.
- Any future expansion must honor the existing domain/sub-domain scope filtering model.
- The feature must not introduce an alternate tenancy or access abstraction.

### Privacy And Operational Boundaries
- Ollama access remains server-side only.
- No browser access to model endpoints.
- No database credentials or secrets in prompts.
- No unrestricted export of cross-scope finance data through the analysis API.

### Logging
If request/response logging is added, logs must avoid sensitive raw payload overexposure and should prefer status/error metadata over full prompt dumps by default.

---

## 14. Reliability And Guardrails

The system must explicitly handle:
- Ollama unavailable
- timeout
- invalid JSON
- schema validation failure
- empty AI response

The system should prefer deterministic fallback over partial or misleading narrative output.

V1 should use synchronous request/response execution unless a concrete operational reason requires persistence or background execution.

---

## 15. Performance Expectations

Targets for interactive use:
- warm response target under 2 seconds when feasible
- degraded but acceptable cold/local-model response under 5 seconds

These targets are goals, not a reason to bypass validation or safety checks.

---

## 16. Success Metrics

### Product Metrics
- usage of the analysis flow by pilot users
- perceived usefulness of summaries and driver explanations
- reduction in manual interpretation effort for summary-row review

### Quality Metrics
- schema validation pass rate
- AI failure/fallback rate
- prompt response latency
- frequency of user-reported factual mismatch

---

## 17. Risks

- Hallucinated explanations
  - Mitigation: deterministic input facts, strict prompts, Zod validation, fallback behavior
- Misleading causality
  - Mitigation: prompt instructs model to use only provided drivers and evidence
- Poor local model performance
  - Mitigation: keep scope narrow, keep prompt compact, tolerate fallback
- Access-control regression in broader rollout
  - Mitigation: keep v1 on `SUPER_ADMIN`, document scope-aware expansion as a later requirement

---

## 18. Roadmap

### V1
- single-scope budget outlook on `/analysis`
- structured AI narrative over existing tracker facts
- deterministic fallback behavior

### V2
- scoped viewer rollout with existing domain/sub-domain access rules
- trend-aware analysis across periods or months
- richer drilldowns tied to summary-row drivers

### V3
- saved analysis history if operationally justified
- alerts or recurring analysis workflows
- scenario exploration built on explicit product decisions, not implicit AI behavior

---

## 19. Acceptance Criteria

- The PRD uses this repo's actual data model and terminology.
- The PRD does not reference `orgId`, `costCenterId`, `BudgetSnapshot`, or `BudgetDriver` as core application abstractions.
- The PRD positions the feature as a server-side AI narrative layer over existing deterministic tracker facts.
- The PRD aligns v1 with the current `SUPER_ADMIN`-only `/analysis` surface.
- The PRD preserves future compatibility with existing scope-restricted access rules.
- The PRD keeps persistence optional and out of v1 by default.
