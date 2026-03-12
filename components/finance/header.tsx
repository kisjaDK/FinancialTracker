"use client"

import Link from "next/link"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import { ROLE_RANK, roleLabel, type AppRole } from "@/lib/roles"
import { cn } from "@/lib/utils"

type FinanceHeaderProps = {
  title: string
  subtitle: string
  userName: string
  userEmail: string
  userRole: AppRole
  activeYear: number
  currentPath:
    | "/welcome"
    | "/budget-movements"
    | "/external-actuals"
    | "/people-roster"
    | "/internal-costs"
    | "/statuses"
    | "/audit-log"
    | "/user-admin"
}

const NAV_ITEMS = [
  {
    href: "/welcome",
    label: "Tracker",
    minimumRole: "GUEST",
  },
  {
    href: "/budget-movements",
    label: "Budget Movements",
    minimumRole: "ADMIN",
  },
  {
    href: "/external-actuals",
    label: "External Actuals",
    minimumRole: "MEMBER",
  },
  {
    href: "/people-roster",
    label: "People Roster",
    minimumRole: "MEMBER",
  },
  {
    href: "/internal-costs",
    label: "Internal Costs",
    minimumRole: "ADMIN",
  },
  {
    href: "/statuses",
    label: "Statuses",
    minimumRole: "ADMIN",
  },
  {
    href: "/audit-log",
    label: "Audit Log",
    minimumRole: "MEMBER",
  },
  {
    href: "/user-admin",
    label: "User Admin",
    minimumRole: "ADMIN",
  },
] as const

export function FinanceHeader({
  title,
  subtitle,
  userName,
  userEmail,
  userRole,
  activeYear,
  currentPath,
}: FinanceHeaderProps) {
  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
              Pandora Finance
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{userName}</p>
              <p className="text-xs text-muted-foreground">
                {userEmail} · {roleLabel(userRole)}
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>

        <nav className="flex flex-wrap items-center gap-2">
          {NAV_ITEMS.filter((item) => ROLE_RANK[userRole] >= ROLE_RANK[item.minimumRole]).map((item) => {
            const href = `${item.href}?year=${activeYear}`
            const isActive = item.href === currentPath

            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  "inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                  isActive
                    ? "border-amber-500 bg-amber-100 text-amber-950"
                    : "border-border bg-background hover:bg-accent"
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
