import type { LucideIcon } from "lucide-react"
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  ClipboardList,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react"
import type { AppRole } from "@/lib/roles"

export type FinancePath =
  | "/tracker"
  | "/staffing"
  | "/budget-movements"
  | "/actuals"
  | "/accruals"
  | "/forecasts"
  | "/people-roster"
  | "/internal-costs"
  | "/admin"
  | "/staffing-admin"
  | "/audit-log"
  | "/user-admin"

export type FinanceNavItem = {
  href: FinancePath
  label: string
  minimumRole: AppRole
  icon: LucideIcon
}

export const FINANCE_NAV_ITEMS: FinanceNavItem[] = [
  {
    href: "/tracker",
    label: "Tracker",
    minimumRole: "GUEST",
    icon: LayoutDashboard,
  },
  {
    href: "/staffing",
    label: "Staffing",
    minimumRole: "MEMBER",
    icon: BriefcaseBusiness,
  },
  {
    href: "/budget-movements",
    label: "Budget Movements",
    minimumRole: "ADMIN",
    icon: BadgeDollarSign,
  },
  {
    href: "/actuals",
    label: "Actuals",
    minimumRole: "MEMBER",
    icon: ReceiptText,
  },
  {
    href: "/accruals",
    label: "Accruals",
    minimumRole: "MEMBER",
    icon: FileSpreadsheet,
  },
  {
    href: "/forecasts",
    label: "Forecasts",
    minimumRole: "MEMBER",
    icon: ClipboardList,
  },
  {
    href: "/people-roster",
    label: "People Roster",
    minimumRole: "MEMBER",
    icon: Users,
  },
  {
    href: "/internal-costs",
    label: "Internal Costs",
    minimumRole: "ADMIN",
    icon: Database,
  },
  {
    href: "/audit-log",
    label: "Audit Log",
    minimumRole: "MEMBER",
    icon: ShieldCheck,
  },
]

export const FINANCE_ADMIN_NAV_ITEMS: FinanceNavItem[] = [
  {
    href: "/staffing-admin",
    label: "Staffing Admin",
    minimumRole: "ADMIN",
    icon: BriefcaseBusiness,
  },
  {
    href: "/admin",
    label: "Admin Home",
    minimumRole: "ADMIN",
    icon: Settings2,
  },
  {
    href: "/user-admin",
    label: "User Admin",
    minimumRole: "ADMIN",
    icon: UsersRound,
  },
  {
    href: "/audit-log",
    label: "Audit Log",
    minimumRole: "ADMIN",
    icon: ShieldCheck,
  },
]
