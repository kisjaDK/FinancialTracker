export { auth as middleware } from "@/auth"

export const config = {
  matcher: [
    "/tracker/:path*",
    "/staffing/:path*",
    "/welcome/:path*",
    "/actuals/:path*",
    "/forecasts/:path*",
    "/external-actuals/:path*",
    "/people-roster/:path*",
    "/budget-movements/:path*",
    "/internal-costs/:path*",
    "/admin/:path*",
    "/staffing-admin/:path*",
    "/audit-log/:path*",
    "/user-admin/:path*",
  ],
}
