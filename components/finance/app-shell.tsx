import Link from "next/link";
import { LogOut } from "lucide-react";
import { signOut } from "@/auth";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  FINANCE_ADMIN_NAV_ITEMS,
  FINANCE_NAV_ITEMS,
  type FinancePath,
} from "@/components/finance/navigation";
import { ROLE_RANK, roleLabel, type AppRole } from "@/lib/roles";

type FinanceAppShellProps = {
  userName: string;
  userRole: AppRole;
  activeYear: number;
  currentPath: FinancePath;
  children: React.ReactNode;
};

function buildHref(href: string, activeYear: number) {
  return `${href}?year=${activeYear}`;
}

export function FinanceAppShell({
  userName,
  userRole,
  activeYear,
  currentPath,
  children,
}: FinanceAppShellProps) {
  const featureRequestsItem = FINANCE_NAV_ITEMS.find(
    (item) => item.href === "/feature-requests"
  );
  const primaryItems = FINANCE_NAV_ITEMS.filter((item) => {
    if (item.href === "/feature-requests") {
      return false;
    }

    if (ROLE_RANK[userRole] < ROLE_RANK[item.minimumRole]) {
      return false;
    }

    if (item.href === "/audit-log" && ROLE_RANK[userRole] >= ROLE_RANK.ADMIN) {
      return false;
    }

    return true;
  });

  const adminItems =
    ROLE_RANK[userRole] >= ROLE_RANK.ADMIN ? FINANCE_ADMIN_NAV_ITEMS : [];
  const showFeatureRequestsLink =
    featureRequestsItem &&
    ROLE_RANK[userRole] >= ROLE_RANK[featureRequestsItem.minimumRole];

  const currentItem =
    [...FINANCE_NAV_ITEMS, ...FINANCE_ADMIN_NAV_ITEMS].find(
      (item) => item.href === currentPath,
    ) ?? FINANCE_NAV_ITEMS[0];

  const initials = userName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <SidebarProvider className="brand-page-shell min-h-svh w-full">
      <Sidebar
        variant="sidebar"
        collapsible="icon"
        className="border-r border-sidebar-border/80 bg-sidebar"
      >
        <SidebarHeader className="gap-4 px-3 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
          <Link
            href={buildHref("/tracker", activeYear)}
            className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground shadow-sm transition-all group-data-[collapsible=icon]:size-8">
              P
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-semibold">
                Pandora Finance
              </div>
              <div className="truncate text-xs text-sidebar-foreground/60">
                D&amp;A Tracker
              </div>
            </div>
          </Link>
        </SidebarHeader>

        <SidebarContent className="px-2 pt-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
          <SidebarGroup className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-1">
            <SidebarGroupLabel className="px-3 text-[0.72rem] tracking-[0.18em] text-sidebar-foreground/55">
              Navigation
            </SidebarGroupLabel>
            <SidebarGroupContent className="pt-1">
              <SidebarMenu>
                {primaryItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={item.href === currentPath}
                        tooltip={item.label}
                        className="group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:[&>svg]:size-5 group-data-[collapsible=icon]:[&>span]:hidden"
                      >
                        <Link href={buildHref(item.href, activeYear)}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {adminItems.length > 0 ? (
            <SidebarGroup className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-1">
              <SidebarGroupLabel>Admin Tools</SidebarGroupLabel>
              <SidebarGroupContent className="pt-1">
                <SidebarMenu>
                  {/* Work around a sidebar rendering issue that drops the first admin entry. */}
                  <SidebarMenuItem aria-hidden="true" className="hidden">
                    <SidebarMenuButton tabIndex={-1} />
                  </SidebarMenuItem>
                  {adminItems.map((item) => {
                    const Icon = item.icon;

                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={item.href === currentPath}
                          tooltip={item.label}
                          className="group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:[&>svg]:size-5 group-data-[collapsible=icon]:[&>span]:hidden"
                        >
                          <Link href={buildHref(item.href, activeYear)}>
                            <Icon />
                            <span>{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter className="gap-3 p-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
          {showFeatureRequestsLink ? (
            <SidebarMenu className="w-full">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={featureRequestsItem.href === currentPath}
                  tooltip={featureRequestsItem.label}
                  className="w-full group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:[&>svg]:size-5 group-data-[collapsible=icon]:[&>span]:hidden"
                >
                  <Link href={buildHref(featureRequestsItem.href, activeYear)}>
                    <featureRequestsItem.icon />
                    <span>{featureRequestsItem.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          ) : null}

          <div className="flex items-center gap-3 rounded-xl bg-sidebar-accent/60 px-3 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
              {initials || "P"}
            </div>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-sm font-medium">{userName}</div>
                <ThemeToggle />
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-sidebar-foreground/60">
                <span>{roleLabel(userRole)}</span>
                <span>{activeYear}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-start gap-2 group-data-[collapsible=icon]:justify-center">
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
              className="w-full group-data-[collapsible=icon]:w-auto"
            >
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="w-full justify-start group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center"
              >
                <LogOut className="size-4" />
                <span className="group-data-[collapsible=icon]:hidden">
                  Sign out
                </span>
              </Button>
            </form>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-h-svh overflow-x-hidden bg-transparent">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/60 bg-background/92 px-4 backdrop-blur sm:px-6">
          <SidebarTrigger />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold sm:text-base">
              {currentItem.label}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              Financial Tracker
            </div>
          </div>
          <div className="ml-auto hidden text-xs text-muted-foreground md:block">
            Workspace {activeYear}
          </div>
        </header>

        <div className="flex-1 overflow-x-hidden px-3 py-5 sm:px-4 lg:px-5">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
