"use client"

import {
  BarChart3,
  ChevronUp,
  Layers,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"

import { NavMain } from "@/components/nav-main"
import { ThemeToggle } from "@/components/layout/theme-toggle"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const user = session?.user

  const dashboardItems = [
    {
      title: "Monitoring",
      url: "#",
      icon: LayoutDashboard,
      isActive:
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard/analytics") ||
        pathname.startsWith("/dashboard/conversations"),
      items: [
        {
          title: "Overview",
          url: "/dashboard",
          isActive: pathname === "/dashboard",
        },
        {
          title: "Conversations",
          url: "/dashboard/conversations",
          isActive: pathname.startsWith("/dashboard/conversations"),
        },
        {
          title: "Analytics",
          url: "/dashboard/analytics",
          isActive: pathname.startsWith("/dashboard/analytics"),
        },
      ],
    },
    {
      title: "Evaluations",
      url: "#",
      icon: ShieldCheck,
      isActive: pathname.startsWith("/dashboard/evaluations"),
      items: [
        {
          title: "Overview",
          url: "/dashboard/evaluations",
          isActive: pathname === "/dashboard/evaluations",
        },
      ],
    },
    {
      title: "Configuration",
      url: "#",
      icon: Settings,
      isActive:
        pathname.startsWith("/dashboard/stack") ||
        pathname.startsWith("/dashboard/settings"),
      items: [
        {
          title: "Tech Stack",
          url: "/dashboard/stack",
          isActive: pathname.startsWith("/dashboard/stack"),
        },
        {
          title: "Settings",
          url: "/dashboard/settings",
          isActive: pathname.startsWith("/dashboard/settings"),
        },
      ],
    },
  ]

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center justify-between w-full px-2 py-2">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 flex-1 hover:opacity-80 transition-opacity"
              >
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-chart-1 p-0.5">
                  <Image src="/logo.png" width={40} height={40} alt="Pandora" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">Pandora A/S</span>
                  <span className="truncate text-xs text-muted-foreground">
                    AI Analytics
                  </span>
                </div>
              </Link>
              <ThemeToggle />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="space-y-2">
        <NavMain items={dashboardItems} label="Platform" />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  {user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.image}
                      alt={user.name || "User"}
                      className="size-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="size-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                      <User className="size-4 text-primary" />
                    </div>
                  )}
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user?.name || "User"}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email || "user@example.com"}
                    </span>
                  </div>
                  <ChevronUp className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="top"
                align="start"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    {user?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.image}
                        alt={user.name || "User"}
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="size-8 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                        <User className="size-4 text-primary" />
                      </div>
                    )}
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-semibold">
                        {user?.name || "User"}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {user?.email || "user@example.com"}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="gap-2 cursor-pointer"
                  onClick={() => signOut({ callbackUrl: "/login" })}
                >
                  <LogOut className="size-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
