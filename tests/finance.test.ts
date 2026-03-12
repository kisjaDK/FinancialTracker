import test from "node:test"
import assert from "node:assert/strict"
import { parseCsv } from "@/lib/finance/csv"
import { parseNumber } from "@/lib/finance/imports"
import {
  buildCostAssumptionLookup,
  deriveSeatMetrics,
} from "@/lib/finance/derive"
import { buildExchangeRateLookup, convertAmountToDkk } from "@/lib/finance/currency"
import type { SeatWithRelations } from "@/lib/finance/types"

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
      forecastIncluded: monthIndex > 0,
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
