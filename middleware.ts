export { auth as middleware } from "@/auth"

export const config = {
  matcher: [
    "/welcome/:path*",
    "/actuals/:path*",
    "/external-actuals/:path*",
    "/people-roster/:path*",
    "/budget-movements/:path*",
    "/internal-costs/:path*",
    "/admin/:path*",
    "/audit-log/:path*",
    "/user-admin/:path*",
  ],
}
