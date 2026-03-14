import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  deleteExternalActualEntry,
  updateExternalActualEntry,
} from "@/lib/finance/queries"

type RouteContext = {
  params: Promise<{
    entryId: string
  }>
}

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = await request.json()
    const { entryId } = await context.params
    const entry = await updateExternalActualEntry(
      {
        entryId,
        amount: Number(body.amount),
        invoiceNumber: body.invoiceNumber ? String(body.invoiceNumber) : null,
        supplierName: body.supplierName ? String(body.supplierName) : null,
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ entry })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await requireApiAccess("MEMBER")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const { entryId } = await context.params
    const result = await deleteExternalActualEntry(
      { entryId },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
