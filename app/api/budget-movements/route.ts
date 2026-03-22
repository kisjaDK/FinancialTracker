import { NextResponse } from "next/server"
import { requireApiAccess } from "@/lib/authz"
import {
  createBudgetMovement,
  deleteBudgetMovement,
  updateBudgetMovement,
} from "@/lib/finance/queries"

function parseOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function parseRequiredNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return Number.NaN
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function parseMovementBody(body: Record<string, unknown>) {
  return {
    year: Number(body.year),
    id: body.id ? String(body.id) : undefined,
    funding: body.funding ? String(body.funding) : undefined,
    givingFunding: body.givingFunding ? String(body.givingFunding) : undefined,
    givingPillar: body.givingPillar ? String(body.givingPillar) : undefined,
    amountGiven: parseRequiredNumber(body.amountGiven),
    receivingCostCenter: String(body.receivingCostCenter || ""),
    receivingProjectCode: String(body.receivingProjectCode || ""),
    notes: body.notes ? String(body.notes) : undefined,
    effectiveDate: body.effectiveDate ? String(body.effectiveDate) : null,
    category: body.category ? String(body.category) : undefined,
    financeViewAmount: parseOptionalNumber(body.financeViewAmount),
    capexTarget: parseOptionalNumber(body.capexTarget),
  }
}

export async function POST(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    const movement = await createBudgetMovement(parseMovementBody(body), {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ movement })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    if (!body.id) {
      return NextResponse.json({ error: "Movement id is required" }, { status: 400 })
    }

    const movement = await updateBudgetMovement(parseMovementBody(body) as {
      year: number
      id: string
      funding?: string | null
      givingFunding?: string | null
      givingPillar?: string | null
      amountGiven: number
      receivingCostCenter: string
      receivingProjectCode: string
      notes?: string | null
      effectiveDate?: string | null
      category?: string | null
      financeViewAmount?: number | null
      capexTarget?: number | null
    }, {
      name: viewer.name,
      email: viewer.email,
    })

    return NextResponse.json({ movement })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Save failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const viewer = await requireApiAccess("ADMIN")
  if (viewer instanceof NextResponse) {
    return viewer
  }

  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = String(body.id || "")
    const year = Number(body.year)

    if (!id) {
      return NextResponse.json({ error: "Movement id is required" }, { status: 400 })
    }

    const movement = await deleteBudgetMovement(
      {
        year,
        id,
      },
      {
        name: viewer.name,
        email: viewer.email,
      }
    )

    return NextResponse.json({ movement })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
