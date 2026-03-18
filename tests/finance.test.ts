import { buildAccrualsPageModel, resolveAccrualAccount } from "@/lib/finance/accruals"
import test from "node:test"
import assert from "node:assert/strict"
import { parseCsv } from "@/lib/finance/csv"
import { normalizeRosterVendor, parseDate, parseNumber } from "@/lib/finance/imports"
import {
  buildCostAssumptionLookup,
  deriveSeatMetrics,
} from "@/lib/finance/derive"
import {
  buildExchangeRateLookup,
  convertAmountToDkk,
  findClosestPriorExchangeRate,
} from "@/lib/finance/currency"
import {
  buildStaffingOverviewRows,
  resolveActualsScopeSelection,
  resolveRosterSeatAssignment,
  shouldHideForecastSeatForInactiveStatus,
  validateStaffingTargetInput,
} from "@/lib/finance/queries"
import {
  buildCascadingHierarchyOptions,
  pruneInvalidSelections,
} from "@/lib/finance/hierarchy-filters"
import type { SeatWithRelations } from "@/lib/finance/types"
import { formatFteAsPercent } from "@/lib/finance/format"
import { getRichTextPlainText, renderRichTextToHtml } from "@/lib/rich-text"
import {
  generateServiceApiKey,
  hashServiceApiKey,
  isServiceApiKey,
  verifyServiceApiKeyHash,
} from "@/lib/service-users"

test("parseCsv handles quoted values and headers", () => {
  const rows = parseCsv('Seat ID,Name of resource,Location\n300127,"Doe, Jane",Denmark')

  assert.equal(rows.length, 1)
  assert.equal(rows[0]["Seat ID"], "300127")
  assert.equal(rows[0]["Name of resource"], "Doe, Jane")
  assert.equal(rows[0]["Location"], "Denmark")
})

test("parseCsv supports semicolon-delimited exports", () => {
  const rows = parseCsv(
    "Giving Funding;Giving Pillar; Amount Given ;Receing Funding;Receiving Pillar;Date of Change\nInitial Budget;Initial Budget; 1.000.000 ;D6873;L68730001;2026-01-19"
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0]["Giving Funding"], "Initial Budget")
  assert.equal(rows[0]["Amount Given"], "1.000.000")
  assert.equal(rows[0]["Receing Funding"], "D6873")
})

test("parseCsv skips single-cell preamble rows before the header", () => {
  const rows = parseCsv(
    "BM\nGiving Funding;Giving Pillar; Amount Given ;Receing Funding;Receiving Pillar;Notes;Date of Change\nInitial Budget;Initial Budget;1.000.000;D6873;L68730001;Initial Run Budget;2026-01-19"
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0]["Giving Funding"], "Initial Budget")
  assert.equal(rows[0]["Amount Given"], "1.000.000")
  assert.equal(rows[0]["Notes"], "Initial Run Budget")
})

test("parseNumber supports parenthesized negatives from Excel exports", () => {
  assert.equal(parseNumber("(3.500.000)"), -3500000)
  assert.equal(parseNumber("(700.000)"), -700000)
  assert.equal(parseNumber("-"), null)
})

test("parseDate converts Excel serial dates and rejects implausible years", () => {
  assert.equal(parseDate("45505")?.toISOString(), "2024-08-01T00:00:00.000Z")
  assert.equal(parseDate("2026-03-14")?.toISOString(), "2026-03-14T00:00:00.000Z")
  assert.equal(parseDate("99999"), null)
})

test("parseDate supports roster timestamps with dot-separated time values", () => {
  const parsed = parseDate("01/31/2026  00.00.00")

  assert.notEqual(parsed, null)
  assert.equal(parsed?.getFullYear(), 2026)
  assert.equal(parsed?.getMonth(), 0)
  assert.equal(parsed?.getDate(), 31)
})

test("normalizeRosterVendor lets internal resource type override conflicting vendor", () => {
  const normalized = normalizeRosterVendor("Internal", "Other")

  assert.equal(normalized.vendor, null)
  assert.equal(
    normalized.importError,
    "Internal resource type cannot use external vendor 'Other'."
  )
})

test("normalizeRosterVendor clears internal vendor values for internal resources", () => {
  const normalized = normalizeRosterVendor("Internal", "Internal")

  assert.equal(normalized.vendor, null)
  assert.equal(normalized.importError, null)
})

test("generateServiceApiKey returns a recognizable bearer token format", () => {
  const generated = generateServiceApiKey()

  assert.equal(isServiceApiKey(generated.apiKey), true)
  assert.match(generated.apiKey, /^pnd_srv_[a-f0-9]{12}_[A-Za-z0-9_-]{16,}$/)
  assert.equal(generated.keyHash, hashServiceApiKey(generated.apiKey))
})

test("verifyServiceApiKeyHash rejects tampered service keys", () => {
  const generated = generateServiceApiKey()

  assert.equal(verifyServiceApiKeyHash(generated.apiKey, generated.keyHash), true)
  assert.equal(
    verifyServiceApiKeyHash(`${generated.apiKey}tampered`, generated.keyHash),
    false
  )
})

test("deriveSeatMetrics uses internal cost assumptions", () => {
  const lookup = buildCostAssumptionLookup([
    {
      id: "cost-1",
      trackingYearId: "year-1",
      band: "Band 5",
      location: "Denmark",
      yearlyCost: 1200000,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  const seat = {
    id: "seat-1",
    trackingYearId: "year-1",
    budgetAreaId: "area-1",
    rosterPersonId: null,
    sourceType: "ROSTER",
    seatId: "300127",
    sourceKey: "roster:300127",
    isActive: true,
    domain: "Data & Analytics",
    subDomain: "Architecture",
    funding: "D&T Run",
    pillar: "Architecture",
    costCenter: "D6861",
    projectCode: "L68610001",
    resourceType: "Internal",
    team: "Architecture",
    inSeat: "Jane Doe",
    description: "Engineer",
    band: "Band 5",
    ppid: null,
    location: "Denmark",
    vendor: null,
    dailyRate: null,
    ritm: null,
    sow: null,
    spendPlanId: null,
    status: "Active",
    allocation: 1,
    startDate: null,
    endDate: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    months: Array.from({ length: 12 }, (_, monthIndex) => ({
      id: `month-${monthIndex}`,
      trackerSeatId: "seat-1",
      monthIndex,
      actualAmount: monthIndex === 0 ? 100000 : 0,
      actualAmountRaw: monthIndex === 0 ? 100000 : null,
      actualCurrency: "DKK",
      exchangeRateUsed: monthIndex === 0 ? 1 : null,
      forecastOverrideAmount: null,
      forecastIncluded: monthIndex > 0,
      usedForecastAmount: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    override: null,
    budgetArea: null,
  } satisfies SeatWithRelations

  const metrics = deriveSeatMetrics(seat, lookup, [], 2026)

  assert.equal(metrics.totalSpent, 100000)
  assert.equal(metrics.yearlyCostInternal, 1200000)
  assert.equal(metrics.monthlyForecast[0], 0)
  assert.equal(metrics.monthlyForecast[1], 100000)
})

test("deriveSeatMetrics returns zero forecast when start and end dates are the same", () => {
  const lookup = buildCostAssumptionLookup([
    {
      id: "cost-1",
      trackingYearId: "year-1",
      band: "4",
      location: "Denmark",
      yearlyCost: 1133295,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  const boundaryDate = new Date("2026-12-30T23:00:00.000Z")
  const seat = {
    id: "seat-2",
    trackingYearId: "year-1",
    budgetAreaId: "area-1",
    rosterPersonId: null,
    sourceType: "ROSTER",
    seatId: "300289",
    sourceKey: "roster:300289",
    isActive: true,
    domain: "Data & Analytics",
    subDomain: "Architecture",
    funding: "Core Team",
    pillar: "Architecture",
    costCenter: "D6861",
    projectCode: "L68610001",
    resourceType: "Internal",
    team: "Architecture",
    inSeat: "Vacant",
    description: "Data Architect",
    band: "4",
    ppid: null,
    location: "Denmark",
    vendor: null,
    dailyRate: null,
    ritm: null,
    sow: null,
    spendPlanId: null,
    status: "Open",
    allocation: 1,
    startDate: boundaryDate,
    endDate: boundaryDate,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    months: Array.from({ length: 12 }, (_, monthIndex) => ({
      id: `month-boundary-${monthIndex}`,
      trackerSeatId: "seat-2",
      monthIndex,
      actualAmount: 0,
      actualAmountRaw: null,
      actualCurrency: "DKK",
      exchangeRateUsed: null,
      forecastOverrideAmount: null,
      forecastIncluded: true,
      usedForecastAmount: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    override: null,
    budgetArea: null,
  } satisfies SeatWithRelations

  const metrics = deriveSeatMetrics(seat, lookup, [], 2026)

  assert.equal(metrics.totalForecast, 0)
  assert.deepEqual(metrics.monthlyForecast, Array(12).fill(0))
})

test("deriveSeatMetrics keeps forecast for closed external seats during active months", () => {
  const lookup = buildCostAssumptionLookup([])

  const seat = {
    id: "seat-closed-ext",
    trackingYearId: "year-1",
    budgetAreaId: "area-1",
    rosterPersonId: null,
    sourceType: "ROSTER",
    seatId: "300001",
    sourceKey: "roster:300001",
    isActive: true,
    domain: "Data & Analytics",
    subDomain: "Customer, Channel, Colleague & Brand",
    funding: "D&T Run",
    pillar: "Customer, Channel, Colleague & Brand",
    costCenter: "D6821",
    projectCode: "L68210001",
    resourceType: "Time & Material",
    team: "Sales & Channels",
    inSeat: "Casper Brandenborg",
    description: "Consultant",
    band: "External",
    ppid: null,
    location: "Denmark",
    vendor: "Epico",
    dailyRate: 7520,
    ritm: null,
    sow: null,
    spendPlanId: null,
    status: "Closed",
    allocation: 1,
    startDate: new Date("2023-01-01T00:00:00.000Z"),
    endDate: new Date("2026-02-28T00:00:00.000Z"),
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    months: Array.from({ length: 12 }, (_, monthIndex) => ({
      id: `month-closed-${monthIndex}`,
      trackerSeatId: "seat-closed-ext",
      monthIndex,
      actualAmount: 0,
      actualAmountRaw: null,
      actualCurrency: "DKK" as const,
      exchangeRateUsed: null,
      forecastOverrideAmount: null,
      forecastIncluded: true,
      usedForecastAmount: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    override: null,
    budgetArea: null,
  } satisfies SeatWithRelations

  const metrics = deriveSeatMetrics(seat, lookup, [], 2026)

  assert.equal(metrics.monthlyForecast[0], 150400)
  assert.equal(metrics.monthlyForecast[1], 150400)
  assert.equal(metrics.monthlyForecast[2], 0)
  assert.equal(metrics.totalForecast, 300800)
})

test("resolveAccrualAccount maps cloud and managed services to finance accounts", () => {
  assert.equal(resolveAccrualAccount("Cloud Cost"), "4800211")
  assert.equal(resolveAccrualAccount("Managed Services"), "4800209")
  assert.equal(resolveAccrualAccount("External T&M"), "4800213")
})

test("resolveAccrualAccount prefers admin-defined resource type mappings", () => {
  assert.equal(
    resolveAccrualAccount("Time & Material", {
      "time & material": "4800999",
    }),
    "4800999"
  )
})

test("buildAccrualsPageModel uses past and current external forecasts without actuals and excludes perm seats", () => {
  const sharedDates = {
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const externalSeat = {
    id: "seat-ext",
    trackingYearId: "year-1",
    budgetAreaId: "area-1",
    rosterPersonId: null,
    sourceType: "ROSTER",
    seatId: "C00372",
    sourceKey: "roster:C00372",
    isActive: true,
    domain: "Data & Analytics",
    subDomain: "AI & Automation",
    funding: "D&T Run",
    pillar: "AI & Automation CoE",
    costCenter: "D4453",
    projectCode: "L44530001",
    resourceType: "External T&M",
    team: "Cloud Engineering",
    inSeat: "Morgan Vendor",
    description: "Platform engineer",
    band: "External",
    ppid: null,
    location: "India",
    vendor: "TCS",
    dailyRate: 1000,
    ritm: null,
    sow: null,
    spendPlanId: null,
    status: "Active",
    allocation: 1,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-12-31T00:00:00.000Z"),
    notes: null,
    ...sharedDates,
    months: [
      {
        id: "ext-month-0",
        trackerSeatId: "seat-ext",
        monthIndex: 0,
        actualAmount: 0,
        actualAmountRaw: null,
        actualCurrency: "DKK",
        exchangeRateUsed: null,
        forecastOverrideAmount: null,
        forecastIncluded: true,
        usedForecastAmount: null,
        notes: null,
        ...sharedDates,
      },
      {
        id: "ext-month-1",
        trackerSeatId: "seat-ext",
        monthIndex: 1,
        actualAmount: 10000,
        actualAmountRaw: 10000,
        actualCurrency: "DKK",
        exchangeRateUsed: 1,
        forecastOverrideAmount: null,
        forecastIncluded: true,
        usedForecastAmount: null,
        notes: null,
        ...sharedDates,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `ext-month-${index + 2}`,
        trackerSeatId: "seat-ext",
        monthIndex: index + 2,
        actualAmount: 0,
        actualAmountRaw: null,
        actualCurrency: "DKK" as const,
        exchangeRateUsed: null,
        forecastOverrideAmount: null,
        forecastIncluded: true,
        usedForecastAmount: null,
        notes: null,
        ...sharedDates,
      })),
    ],
    override: null,
    budgetArea: null,
  } satisfies SeatWithRelations

  const permSeat = {
    ...externalSeat,
    id: "seat-perm",
    seatId: "300127",
    sourceKey: "roster:300127",
    resourceType: "Internal",
    band: "Band 5",
    vendor: null,
    dailyRate: null,
    months: externalSeat.months.map((month) => ({
      ...month,
      id: `perm-${month.id}`,
      trackerSeatId: "seat-perm",
      actualAmount: 0,
      actualAmountRaw: null,
    })),
  } satisfies SeatWithRelations

  const result = buildAccrualsPageModel({
    year: 2026,
    seats: [externalSeat, permSeat],
    assumptions: [],
    exchangeRates: [],
    filters: {
      domain: "",
      pillar: "",
      months: [],
    },
    submittedBy: "Kim",
    now: new Date("2026-03-15T08:00:00.000Z"),
  })

  assert.equal(result.summaryRows.length, 1)
  assert.equal(result.detailLines.length, 2)
  assert.equal(result.summaryRows[0].vendorName, "TCS")
  assert.equal(result.summaryRows[0].periodLabel, "Jan + Mar 2026")
  assert.equal(result.summaryRows[0].amountDkk, 40000)
})

test("buildAccrualsPageModel scopes accruals to the selected months", () => {
  const sharedDates = {
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const externalSeat = {
    id: "seat-ext-period",
    trackingYearId: "year-1",
    budgetAreaId: "area-1",
    rosterPersonId: null,
    sourceType: "ROSTER",
    seatId: "300001",
    sourceKey: "roster:300001",
    isActive: true,
    domain: "Data & Analytics",
    subDomain: "Customer, Channel, Colleague & Brand",
    funding: "D&T Run",
    pillar: "Customer, Channel, Colleague & Brand",
    costCenter: "D6821",
    projectCode: "L68210001",
    resourceType: "Time & Material",
    team: "Sales & Channels",
    inSeat: "Casper Brandenborg",
    description: "Consultant",
    band: "External",
    ppid: null,
    location: "Denmark",
    vendor: "Epico",
    dailyRate: 1000,
    ritm: null,
    sow: null,
    spendPlanId: null,
    status: "Closed",
    allocation: 1,
    startDate: new Date("2026-01-01T00:00:00.000Z"),
    endDate: new Date("2026-03-31T00:00:00.000Z"),
    notes: null,
    ...sharedDates,
    months: Array.from({ length: 12 }, (_, monthIndex) => ({
      id: `month-period-${monthIndex}`,
      trackerSeatId: "seat-ext-period",
      monthIndex,
      actualAmount: 0,
      actualAmountRaw: null,
      actualCurrency: "DKK" as const,
      exchangeRateUsed: null,
      forecastOverrideAmount: null,
      forecastIncluded: true,
      usedForecastAmount: null,
      notes: null,
      ...sharedDates,
    })),
    override: null,
    budgetArea: null,
  } satisfies SeatWithRelations

  const result = buildAccrualsPageModel({
    year: 2026,
    seats: [externalSeat],
    assumptions: [],
    exchangeRates: [],
    filters: {
      domain: "",
      pillar: "",
      months: ["Jan", "Feb"],
    },
    submittedBy: "Kim",
    now: new Date("2026-04-15T08:00:00.000Z"),
  })

  assert.deepEqual(result.totals.includedMonthLabels, ["Jan", "Feb"])
  assert.equal(result.detailLines.length, 2)
  assert.equal(result.summaryRows[0].periodLabel, "Jan - Feb 2026")
})

test("shouldHideForecastSeatForInactiveStatus keeps closed seats searchable but still hides cancelled", () => {
  assert.equal(
    shouldHideForecastSeatForInactiveStatus({
      hideInactiveStatuses: true,
      status: "Closed",
      hasSeatIdSearch: false,
      hasNameSearch: false,
    }),
    true
  )

  assert.equal(
    shouldHideForecastSeatForInactiveStatus({
      hideInactiveStatuses: true,
      status: "Closed",
      hasSeatIdSearch: false,
      hasNameSearch: true,
    }),
    false
  )

  assert.equal(
    shouldHideForecastSeatForInactiveStatus({
      hideInactiveStatuses: true,
      status: "Cancelled",
      hasSeatIdSearch: true,
      hasNameSearch: true,
    }),
    true
  )
})

test("buildCascadingHierarchyOptions limits sub-domains and teams from higher selections", () => {
  const result = buildCascadingHierarchyOptions(
    [
      { domain: "D&A", subDomain: "AI", team: "Agents" },
      { domain: "D&A", subDomain: "Data", team: "Platform" },
      { domain: "Tech", subDomain: "Infra", team: "Ops" },
    ],
    ["D&A"],
    ["AI"]
  )

  assert.deepEqual(result.subDomains, ["AI", "Data"])
  assert.deepEqual(result.teams, ["Agents"])
})

test("pruneInvalidSelections removes values that are no longer available", () => {
  assert.deepEqual(
    pruneInvalidSelections(["AI", "Infra"], ["AI", "Data"]),
    ["AI"]
  )
})

test("resolveRosterSeatAssignment uses mapped budget area pillar for derived project code", () => {
  const assignment = resolveRosterSeatAssignment(
    {
      seatId: "300127",
      domain: "D6861",
      productLine: "Architecture Team",
      fundingType: "D&T Run",
    },
    [
      {
        id: "area-1",
        domain: "Data & Analytics",
        subDomain: "Architecture",
        funding: "D&T Run",
        pillar: "Architecture",
        costCenter: "D6861",
        projectCode: "L68610001",
      },
      {
        id: "area-2",
        domain: "Data & Analytics",
        subDomain: "AI Platform",
        funding: "D&T Run",
        pillar: "AI & Automation CoE",
        costCenter: "D6861",
        projectCode: "L44530001",
      },
    ],
    {
      d6861: [
        {
          domain: "Data & Analytics",
          subDomain: "Architecture Team",
          projectCode: "L44530001",
        },
      ],
    },
    [
      {
        domain: "Data & Analytics",
        subDomain: "Architecture Team",
        projectCode: "L44530001",
      },
    ]
  )

  assert.equal(assignment.projectCode, "L44530001")
  assert.equal(assignment.budgetArea?.id, "area-2")
  assert.equal(assignment.pillar, "AI & Automation CoE")
})

test("resolveRosterSeatAssignment falls back to domain mapping when department code is missing", () => {
  const assignment = resolveRosterSeatAssignment(
    {
      seatId: "300411",
      domain: "Data and Analytics",
      productLine: "Architecture",
      fundingType: "Core Team",
    },
    [],
    {},
    [
      {
        domain: "Data & Analytics",
        subDomain: "Architecture",
        projectCode: "L68610001",
      },
    ]
  )

  assert.equal(assignment.projectCode, "L68610001")
  assert.equal(assignment.domain, "Data & Analytics")
  assert.equal(assignment.subDomain, "Architecture")
})

test("convertAmountToDkk uses latest configured exchange rate", () => {
  const rates = buildExchangeRateLookup([
    {
      id: "fx-1",
      trackingYearId: "year-1",
      currency: "USD",
      rateToDkk: 6.7,
      effectiveDate: new Date("2026-01-01"),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "fx-2",
      trackingYearId: "year-1",
      currency: "USD",
      rateToDkk: 6.9,
      effectiveDate: new Date("2026-02-01"),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])

  const converted = convertAmountToDkk(100, "USD", rates)
  assert.equal(converted.amountDkk, 690)
  assert.equal(converted.exchangeRateUsed, 6.9)
})

test("findClosestPriorExchangeRate selects the latest rate on or before the target date", () => {
  const rates = [
    {
      id: "fx-1",
      trackingYearId: "year-1",
      currency: "USD",
      rateToDkk: 6.7,
      effectiveDate: new Date("2026-01-31T00:00:00.000Z"),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "fx-2",
      trackingYearId: "year-1",
      currency: "USD",
      rateToDkk: 6.9,
      effectiveDate: new Date("2026-02-28T00:00:00.000Z"),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "fx-3",
      trackingYearId: "year-1",
      currency: "USD",
      rateToDkk: 7.1,
      effectiveDate: new Date("2026-03-31T00:00:00.000Z"),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const selected = findClosestPriorExchangeRate(
    "USD",
    rates,
    new Date("2026-03-15T12:00:00.000Z")
  )

  assert.equal(selected?.rateToDkk, 6.9)
  assert.equal(selected?.effectiveDate.toISOString(), "2026-02-28T00:00:00.000Z")
})

test("findClosestPriorExchangeRate returns null when no prior rate exists", () => {
  const rates = [
    {
      id: "fx-1",
      trackingYearId: "year-1",
      currency: "USD",
      rateToDkk: 6.7,
      effectiveDate: new Date("2026-02-01T00:00:00.000Z"),
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const selected = findClosestPriorExchangeRate(
    "USD",
    rates,
    new Date("2026-01-31T23:59:59.999Z")
  )

  assert.equal(selected, null)
})

test("renderRichTextToHtml supports paragraphs and lists", () => {
  const html = renderRichTextToHtml("**Heads up**\n\n- Confirm leave\n- Copy only approved months")

  assert.match(html, /<strong>Heads up<\/strong>/)
  assert.match(html, /<ul><li>Confirm leave<\/li><li>Copy only approved months<\/li><\/ul>/)
})

test("getRichTextPlainText strips markdown markers", () => {
  assert.equal(
    getRichTextPlainText("**Heads up**\n- Confirm leave"),
    "Heads up Confirm leave"
  )
})

test("formatFteAsPercent converts FTE fractions to percent", () => {
  assert.equal(formatFteAsPercent(0.4), "40%")
  assert.equal(formatFteAsPercent(1), "100%")
  assert.equal(formatFteAsPercent(40), "40%")
})

test("buildStaffingOverviewRows buckets internal seats into active, on leave, and open", () => {
  const baseSeat = {
    trackingYearId: "year-1",
    budgetAreaId: null,
    rosterPersonId: null,
    sourceType: "ROSTER",
    sourceKey: "roster",
    isActive: true,
    domain: "Data & Analytics",
    subDomain: "Architecture",
    funding: "D&T Run",
    pillar: "Architecture",
    costCenter: "D6861",
    projectCode: "L68610001",
    team: "Architecture",
    description: null,
    band: "Band 5",
    ppid: null,
    location: "Denmark",
    vendor: null,
    dailyRate: null,
    ritm: null,
    sow: null,
    spendPlanId: null,
    allocation: 1,
    startDate: null,
    endDate: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    months: Array.from({ length: 12 }, (_, monthIndex) => ({
      id: `month-${monthIndex}`,
      trackerSeatId: "seat",
      monthIndex,
      actualAmount: 0,
      actualAmountRaw: null,
      actualCurrency: "DKK",
      exchangeRateUsed: null,
      forecastOverrideAmount: null,
      forecastIncluded: true,
      usedForecastAmount: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    override: null,
    budgetArea: null,
  } satisfies Omit<SeatWithRelations, "id" | "seatId" | "resourceType" | "inSeat" | "status">

  const rows = buildStaffingOverviewRows({
    year: 2026,
    activeStatuses: new Set(["active"]),
    mappingLookup: {},
    targets: [],
    seats: [
      {
        ...baseSeat,
        id: "seat-active",
        seatId: "1001",
        resourceType: "Internal",
        inSeat: "Jane Doe",
        status: "Active",
      },
      {
        ...baseSeat,
        id: "seat-leave",
        seatId: "1002",
        resourceType: "Internal",
        inSeat: "John Doe",
        status: "On leave",
      },
      {
        ...baseSeat,
        id: "seat-open",
        seatId: "1003",
        resourceType: "Internal",
        inSeat: "Vacant",
        status: "Open",
      },
    ] satisfies SeatWithRelations[],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].months[0].active, 1)
  assert.equal(rows[0].months[0].onLeave, 1)
  assert.equal(rows[0].months[0].open, 1)
})

test("buildStaffingOverviewRows excludes external seats and months outside the seat date range", () => {
  const rows = buildStaffingOverviewRows({
    year: 2026,
    activeStatuses: new Set(["active"]),
    mappingLookup: {},
    targets: [],
    seats: [
      {
        id: "seat-internal",
        trackingYearId: "year-1",
        budgetAreaId: null,
        rosterPersonId: null,
        sourceType: "ROSTER",
        seatId: "2001",
        sourceKey: "roster:2001",
        isActive: true,
        domain: "Data & Analytics",
        subDomain: "Architecture",
        funding: "D&T Run",
        pillar: "Architecture",
        costCenter: "D6861",
        projectCode: "L68610001",
        resourceType: "Internal",
        team: "Architecture",
        inSeat: "Jane Doe",
        description: null,
        band: "Band 5",
        ppid: null,
        location: "Denmark",
        vendor: null,
        dailyRate: null,
        ritm: null,
        sow: null,
        spendPlanId: null,
        status: "Active",
        allocation: 1,
        startDate: new Date("2026-03-01T00:00:00.000Z"),
        endDate: new Date("2026-04-30T00:00:00.000Z"),
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        months: [],
        override: null,
        budgetArea: null,
      },
      {
        id: "seat-external",
        trackingYearId: "year-1",
        budgetAreaId: null,
        rosterPersonId: null,
        sourceType: "ROSTER",
        seatId: "2002",
        sourceKey: "roster:2002",
        isActive: true,
        domain: "Data & Analytics",
        subDomain: "Architecture",
        funding: "D&T Run",
        pillar: "Architecture",
        costCenter: "D6861",
        projectCode: "L68610001",
        resourceType: "External T&M",
        team: "Architecture",
        inSeat: "Vendor",
        description: null,
        band: "External",
        ppid: null,
        location: "Denmark",
        vendor: "Vendor",
        dailyRate: 5000,
        ritm: null,
        sow: null,
        spendPlanId: null,
        status: "Active",
        allocation: 1,
        startDate: null,
        endDate: null,
        notes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        months: [],
        override: null,
        budgetArea: null,
      },
    ] satisfies SeatWithRelations[],
  })

  assert.equal(rows.length, 1)
  assert.equal(rows[0].months[0].active, 0)
  assert.equal(rows[0].months[2].active, 1)
  assert.equal(rows[0].months[4].active, 0)
})

test("validateStaffingTargetInput normalizes scope-specific fields", () => {
  assert.deepEqual(
    validateStaffingTargetInput({
      scopeLevel: "DOMAIN",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610001",
      permTarget: 5,
    }),
    {
      scopeLevel: "DOMAIN",
      domain: "Data & Analytics",
      subDomain: null,
      projectCode: null,
      permTarget: 5,
    }
  )

  assert.deepEqual(
    validateStaffingTargetInput({
      scopeLevel: "PROJECT",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610001",
      permTarget: 3.5,
    }),
    {
      scopeLevel: "PROJECT",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610001",
      permTarget: 3.5,
    }
  )
})

test("validateStaffingTargetInput rejects invalid scope combinations", () => {
  assert.throws(
    () =>
      validateStaffingTargetInput({
        scopeLevel: "SUB_DOMAIN",
        domain: "Data & Analytics",
        subDomain: "",
        projectCode: "",
        permTarget: 2,
      }),
    /Sub-domain is required/
  )

  assert.throws(
    () =>
      validateStaffingTargetInput({
        scopeLevel: "PROJECT",
        domain: "Data & Analytics",
        subDomain: "Architecture",
        projectCode: "",
        permTarget: -1,
      }),
    /PERM target must be zero or greater/
  )
})

test("resolveActualsScopeSelection cascades domain and sub-domain options", () => {
  const summary = [
    {
      id: "architecture-core",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610001",
    },
    {
      id: "ai-core",
      domain: "Data & Analytics",
      subDomain: "AI & Automation",
      projectCode: "L44530001",
    },
    {
      id: "platform-core",
      domain: "Platform",
      subDomain: "Cloud",
      projectCode: "P100",
    },
  ]

  const resolved = resolveActualsScopeSelection(summary, {
    domain: "Data & Analytics",
  })

  assert.equal(resolved.selectedAreaId, "architecture-core")
  assert.equal(resolved.selectedDomain, "Data & Analytics")
  assert.equal(resolved.selectedSubDomain, "Architecture")
  assert.equal(resolved.selectedProjectCode, "L68610001")
  assert.equal(resolved.showProjectCodeSelector, false)
})

test("resolveActualsScopeSelection auto-selects a single project code for a sub-domain", () => {
  const summary = [
    {
      id: "architecture-core",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610001",
    },
    {
      id: "ai-core",
      domain: "Data & Analytics",
      subDomain: "AI & Automation",
      projectCode: "L44530001",
    },
  ]

  const resolved = resolveActualsScopeSelection(summary, {
    domain: "Data & Analytics",
    subDomain: "Architecture",
  })

  assert.equal(resolved.selectedAreaId, "architecture-core")
  assert.equal(resolved.selectedProjectCode, "L68610001")
  assert.equal(resolved.showProjectCodeSelector, false)
})

test("resolveActualsScopeSelection requires project code when multiple rows share a sub-domain", () => {
  const summary = [
    {
      id: "architecture-core",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610001",
    },
    {
      id: "architecture-growth",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610002",
    },
  ]

  const resolved = resolveActualsScopeSelection(summary, {
    domain: "Data & Analytics",
    subDomain: "Architecture",
    projectCode: "L68610002",
  })

  assert.equal(resolved.selectedAreaId, "architecture-growth")
  assert.equal(resolved.selectedProjectCode, "L68610002")
  assert.equal(resolved.showProjectCodeSelector, true)
  assert.deepEqual(resolved.projectCodeOptions, ["L68610001", "L68610002"])
})

test("resolveActualsScopeSelection falls back to legacy budgetAreaId", () => {
  const summary = [
    {
      id: "architecture-core",
      domain: "Data & Analytics",
      subDomain: "Architecture",
      projectCode: "L68610001",
    },
    {
      id: "platform-core",
      domain: "Platform",
      subDomain: "Cloud",
      projectCode: "P100",
    },
  ]

  const resolved = resolveActualsScopeSelection(summary, {
    budgetAreaId: "platform-core",
  })

  assert.equal(resolved.selectedAreaId, "platform-core")
  assert.equal(resolved.selectedDomain, "Platform")
  assert.equal(resolved.selectedSubDomain, "Cloud")
  assert.equal(resolved.selectedProjectCode, "P100")
})
