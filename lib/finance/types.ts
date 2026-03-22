import type {
  BudgetArea,
  BudgetMovementBucket,
  CostAssumption,
  CurrencyCode,
  SeatReferenceValueType,
  SeatMonth,
  StaffingTargetScopeLevel,
  StatusDefinition,
  TrackerOverride,
  TrackerSeat,
} from "@prisma/client"
import type { ExchangeRateLookup } from "@/lib/finance/currency"

export type SeatWithRelations = TrackerSeat & {
  months: SeatMonth[]
  override: TrackerOverride | null
  budgetArea: BudgetArea | null
}

export type BudgetAreaSummary = {
  id: string
  domain: string | null
  subDomain: string | null
  funding: string | null
  pillar: string | null
  costCenter: string | null
  projectCode: string | null
  displayName: string
  budget: number
  amountGivenBudget: number
  financeViewBudget: number
  spentToDate: number
  remainingBudget: number
  totalForecast: number
  forecastRemaining: number
  permBudget: number
  extBudget: number
  amsBudget: number
  permTarget: number
  permForecast: number
  extForecast: number
  amsForecast: number
  cloudCostSpentToDate: number
  cloudCostTarget: number
  cloudCostForecast: number
  cloudSeatId: string | null
  cloudSeatLabel: string | null
  cloudSeatDescription: string | null
  cloudSeatStatus: string | null
  cloudSeatTeam: string | null
  cloudCostMonthlyActuals: number[]
  cloudCostMonthlyForecast: number[]
  cloudCostMonthlyComparisonForecast: number[]
  seatCount: number
  activeSeatCount: number
  openSeatCount: number
}

export type SeatDerivedMetrics = {
  totalSpent: number
  totalForecast: number
  yearlyCostInternal: number
  yearlyCostExternal: number
  permFte: number
  extFte: number
  amsFte: number
  permForecast: number
  extForecast: number
  amsForecast: number
  cloudCostForecast: number
  quarterlyForecast: [number, number, number, number]
  monthlyForecast: number[]
}

export type DeriveSeatMetricsOptions = {
  exchangeRateLookup?: ExchangeRateLookup
  ignoreForecastOverrides?: boolean
}

export type CostAssumptionLookup = Record<string, CostAssumption>
export type StatusDefinitionView = StatusDefinition

export type LatestExchangeRate = {
  currency: CurrencyCode
  rateToDkk: number
  effectiveDate: Date
  notes: string | null
}

export type DepartmentMappingView = {
  id: string
  sourceCode: string
  domain: string
  subDomain: string
  projectCode: string
  teams: string[]
  notes: string | null
}

export type SeatMonthView = {
  monthIndex: number
  actualAmountDkk: number
  actualAmountRaw: number | null
  actualCurrency: CurrencyCode
  exchangeRateUsed: number | null
  forecastOverrideAmount: number | null
  forecastIncluded: boolean
  usedForecastAmount: number | null
  comparisonForecastAmount: number
  notes: string | null
}

export type BudgetMovementFilters = {
  search: string
  category: string
  funding: string
  receivingFunding: string
  givingPillar: string
}

export type BudgetMovementFilterOption = {
  value: string
  label: string
}

export type BudgetMovementView = {
  id: string
  batchFileName: string
  isManual: boolean
  effectiveDate: Date | null
  category: string | null
  funding: string | null
  givingFunding: string | null
  givingPillar: string | null
  receivingFunding: string
  receivingProjectCode: string
  receivingDomainCode: string
  amountGiven: number
  financeViewAmount: number | null
  capexTarget: number | null
  notes: string | null
  areaDisplayName: string | null
  areaDomain: string | null
  areaSubDomain: string | null
}

export type BudgetMovementCategoryMappingView = {
  id: string
  category: string
  bucket: BudgetMovementBucket
  notes: string | null
}

export type BudgetMovementImportBatchView = {
  id: string
  fileName: string
  importedAt: Date
  rowCount: number
}

export type BudgetMovementFundingSummaryView = {
  funding: string
  movementCount: number
  amountGiven: number
  financeViewAmount: number
  latestEffectiveDate: Date | null
}

export type FundingFollowUpSummaryView = {
  funding: string
  allocatedFunding: number
  usedFunding: number
  projectedFunding: number
  remainingFunding: number
  seatCount: number
  activeSeatCount: number
  latestMovementDate: Date | null
}

export type FundingFollowUpSeatView = {
  id: string
  seatId: string
  name: string | null
  status: string | null
  funding: string | null
  domain: string | null
  subDomain: string | null
  projectCode: string | null
  team: string | null
  role: string | null
  budgetAreaDisplayName: string | null
  startDate: Date | null
  endDate: Date | null
  actualsToDate: number
  remainingForecast: number
  totalProjectedSpend: number
}

export type FundingAvailabilityPreviewView = {
  funding: string | null
  status: "unselected" | "insufficient_data" | "within" | "exceeded"
  message: string
  allocatedFunding: number
  currentProjectedFunding: number
  proposedProjectedFunding: number | null
  remainingFundingBeforeSeat: number
  remainingFundingAfterSeat: number | null
  exceededAmount: number | null
}

export type PeopleRosterFilters = {
  seatIds: string[]
  names: string[]
  emails: string[]
  domains: string[]
  teams: string[]
  subDomains: string[]
  projectCodes: string[]
  vendors: string[]
  locations: string[]
  statuses: string[]
  roles: string[]
  bands: string[]
  month: string
  staffingBucket: string
  validation: string
}

export type PeopleRosterView = {
  id: string
  trackerSeatId: string | null
  sourceType: "ROSTER" | "MANUAL"
  importFileName: string
  seatId: string
  budgetAreaId: string | null
  overrideBudgetAreaId: string | null
  departmentCode: string | null
  domain: string | null
  projectCode: string | null
  name: string | null
  email: string | null
  team: string | null
  subDomain: string | null
  mappedSubDomain: string | null
  vendor: string | null
  dailyRate: number | null
  location: string | null
  band: string | null
  role: string | null
  resourceType: string | null
  funding: string | null
  status: string | null
  manager: string | null
  fte: number | null
  spendPlanId: string | null
  ritm: string | null
  sow: string | null
  notes: string | null
  startDate: Date | null
  endDate: Date | null
  effectiveStatus: string | null
  effectiveInSeat: string | null
  effectiveStartDate: Date | null
  effectiveEndDate: Date | null
  importError: string | null
}

export type SeatReferenceValueView = {
  id: string
  type: SeatReferenceValueType
  value: string
}

export type ExternalActualImportFilters = {
  user: string
  fileName: string
  seatId: string
  team: string
  importedFrom: string
  importedTo: string
}

export type ExternalActualImportView = {
  id: string
  importedAt: Date
  fileName: string
  importedByName: string | null
  importedByEmail: string | null
  seatId: string
  team: string | null
  inSeat: string | null
  description: string | null
  monthIndex: number
  monthLabel: string
  amount: number
  originalAmount: number | null
  originalCurrency: CurrencyCode | null
  invoiceNumber: string | null
  supplierName: string | null
  matchedTrackerSeatId: string | null
}

export type ExternalActualImportBatchView = {
  id: string
  importedAt: Date
  fileName: string
  importedByName: string | null
  importedByEmail: string | null
  rowCount: number
  entryCount: number
  amount: number
  matchedCount: number
}

export type StaffingMonthBucket = {
  active: number
  onLeave: number
  open: number
}

export type StaffingTargetView = {
  id: string
  scopeLevel: StaffingTargetScopeLevel
  domain: string
  subDomain: string | null
  projectCode: string | null
  permTarget: number
}

export type StaffingOverviewRow = {
  id: string
  domain: string
  subDomain: string | null
  projectCode: string | null
  permTarget: number | null
  months: StaffingMonthBucket[]
}

export type StaffingOverviewGroup = {
  subDomain: string | null
  permTarget: number | null
  months: StaffingMonthBucket[]
  rows: StaffingOverviewRow[]
}

export type AccrualFilters = {
  domain: string
  pillar: string
  months: string[]
}

export type AccrualAccountMappingView = {
  id: string
  resourceType: string
  accountCode: string
  notes: string | null
}

export type AccrualDetailLine = {
  id: string
  trackerSeatId: string
  seatId: string
  domain: string | null
  pillar: string | null
  projectCode: string | null
  departmentCode: string | null
  departmentName: string | null
  vendorName: string
  account: string
  resourceType: string | null
  team: string | null
  inSeat: string | null
  description: string | null
  periodLabel: string
  serviceLabel: string
  monthIndex: number
  amountDkk: number
}

export type AccrualSummaryRow = {
  id: string
  departmentName: string
  departmentCode: string
  costType: "OPEX"
  account: string
  amountDkk: number
  projectNumber: string
  vendorName: string
  itemService: string
  periodLabel: string
  submittedBy: string
  invoiceNumber: string
  domain: string | null
  pillar: string | null
  projectCode: string | null
  detailCount: number
  details: AccrualDetailLine[]
}
