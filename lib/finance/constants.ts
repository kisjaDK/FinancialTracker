export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

export const SUPPORTED_CURRENCIES = ["DKK", "EUR", "USD"] as const
export const WORK_DAYS_PER_MONTH = 20
export const WORK_DAYS_PER_YEAR = 240
export const ALLOWED_SEAT_STATUSES = [
  "Active",
  "Open",
  "Closed",
  "Cancelled",
  "To be replaced",
  "To be closed",
  "To be insourced",
  "Transitioning out",
  "Cover",
  "On leave",
] as const

export const DEFAULT_ACTIVE_SEAT_STATUSES = [
  "Active",
  "To be replaced",
  "To be closed",
  "To be insourced",
  "Transitioning out",
  "Cover",
] as const

export const REQUIRED_ROSTER_HEADERS = [
  "Seat ID",
  "Name of Product line / Project",
  "Name of team",
  "Band",
  "Name of resource",
  "Status",
  "FTE allocation to team (%)",
  "Type of resource",
  "Location",
  "Expected start date",
  "Expected end date",
  "Funding type",
] as const

export const REQUIRED_BUDGET_MOVEMENT_HEADERS = [
  "Amount Given",
  "Receiving Cost Center",
  "Receiving Project Code",
  "Date of Change",
] as const

export const CLOUD_CATEGORY = "cloud cost"
