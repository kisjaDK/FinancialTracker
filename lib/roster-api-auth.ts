import { NextResponse } from "next/server"
import { getViewer, hasRequiredRole } from "@/lib/authz"
import { authenticateServiceApiKey } from "@/lib/service-users"

export type RosterImportActor = {
  role: "MEMBER" | "ADMIN" | "SUPER_ADMIN"
  name: string
  email: string
  kind: "user" | "service"
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim()
  if (!header) {
    return null
  }

  const [scheme, token] = header.split(/\s+/, 2)
  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    return ""
  }

  return token
}

export async function authorizeRosterImportRequest(
  request: Request
): Promise<NextResponse | RosterImportActor> {
  const bearerToken = getBearerToken(request)

  if (bearerToken) {
    const result = await authenticateServiceApiKey(bearerToken)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    if (!hasRequiredRole(result.serviceUser.role, "MEMBER")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const serviceRole = result.serviceUser.role
    if (serviceRole === "GUEST") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    return {
      role: serviceRole,
      name: `${result.serviceUser.label} (service user)`,
      email: `service-user:${result.serviceUser.id}:${result.serviceUser.keyId}`,
      kind: "service",
    }
  }

  if (bearerToken === "") {
    return NextResponse.json({ error: "Invalid Authorization header" }, { status: 401 })
  }

  const viewer = await getViewer()
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!viewer.role || !hasRequiredRole(viewer.role, "MEMBER")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const viewerRole = viewer.role
  if (viewerRole === "GUEST") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return {
    role: viewerRole,
    name: viewer.name,
    email: viewer.email,
    kind: "user",
  }
}
