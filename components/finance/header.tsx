"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_RANK, roleLabel, type AppRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const COLLAPSE_ROOT_MARGIN = "-32px 0px 0px 0px";

type FinanceHeaderProps = {
  title: string;
  subtitle: string;
  userName: string;
  userEmail: string;
  userRole: AppRole;
  activeYear: number;
  currentPath:
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
    | "/user-admin";
};

const NAV_ITEMS = [
  {
    href: "/tracker",
    label: "Tracker",
    minimumRole: "GUEST",
  },
  {
    href: "/staffing",
    label: "Staffing",
    minimumRole: "MEMBER",
  },
  {
    href: "/budget-movements",
    label: "Budget Movements",
    minimumRole: "ADMIN",
  },
  {
    href: "/actuals",
    label: "Actuals",
    minimumRole: "MEMBER",
  },
  {
    href: "/accruals",
    label: "Accruals",
    minimumRole: "MEMBER",
  },
  {
    href: "/forecasts",
    label: "Forecasts",
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
    href: "/audit-log",
    label: "Audit Log",
    minimumRole: "MEMBER",
  },
] as const;

const ADMIN_NAV_ITEMS = [
  {
    href: "/staffing-admin",
    label: "Staffing Admin",
  },
  {
    href: "/admin",
    label: "Admin Home",
  },
  {
    href: "/user-admin",
    label: "User Admin",
  },
  {
    href: "/audit-log",
    label: "Audit Log",
  },
] as const;

export function FinanceHeader({
  title,
  subtitle,
  userName,
  userEmail,
  userRole,
  activeYear,
  currentPath,
}: FinanceHeaderProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const collapseSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinelElement = collapseSentinelRef.current;

    if (!sentinelElement || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsCollapsed(!entry.isIntersecting);
      },
      {
        rootMargin: COLLAPSE_ROOT_MARGIN,
        threshold: 0,
      },
    );

    observer.observe(sentinelElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (ROLE_RANK[userRole] < ROLE_RANK[item.minimumRole]) {
      return false;
    }

    if (item.href === "/audit-log" && ROLE_RANK[userRole] >= ROLE_RANK.ADMIN) {
      return false;
    }

    return true;
  });
  const showAdminDropdown = ROLE_RANK[userRole] >= ROLE_RANK.ADMIN;
  const adminMenuActive = ADMIN_NAV_ITEMS.some(
    (item) => item.href === currentPath,
  );

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur transition-shadow",
          isCollapsed && "shadow-sm",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-7xl flex-col px-6 transition-[padding,gap] duration-300 ease-out",
            isCollapsed ? "gap-0 py-3" : "gap-4 py-5",
          )}
        >
          <div
            className={cn(
              "flex items-center justify-between gap-4 overflow-hidden transition-[max-height,opacity,margin,transform] duration-300 ease-out",
              isCollapsed
                ? "pointer-events-none -mb-1 max-h-0 -translate-y-2 opacity-0"
                : "max-h-24 translate-y-0 opacity-100",
            )}
            aria-hidden={isCollapsed}
          >
            <div>
              <p className="text-xs uppercase tracking-[0.26em] text-muted-foreground">
                Pandora Finance
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {title}
              </h1>
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

          <nav className="flex items-center gap-2 overflow-x-auto pb-1">
            {visibleNavItems.map((item) => {
              const href = `${item.href}?year=${activeYear}`;
              const isActive = item.href === currentPath;

              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                    isActive
                      ? "brand-active-pill"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            {showAdminDropdown ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors",
                    adminMenuActive
                      ? "brand-active-pill"
                      : "border-border bg-background hover:bg-accent",
                  )}
                >
                  <span>Admin Tools</span>
                  <ChevronDown className="ml-2 size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-52">
                  {ADMIN_NAV_ITEMS.map((item) => {
                    const href = `${item.href}?year=${activeYear}`;
                    const isActive = item.href === currentPath;

                    return (
                      <DropdownMenuItem
                        key={item.href}
                        asChild
                        className={cn(isActive && "bg-accent")}
                      >
                        <Link href={href}>{item.label}</Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </nav>
        </div>
      </header>
      <div
        ref={collapseSentinelRef}
        className="h-px w-full"
        aria-hidden="true"
      />
    </>
  );
}
