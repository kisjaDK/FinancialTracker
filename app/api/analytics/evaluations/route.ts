import { NextResponse } from "next/server"
import { getSeedEvaluations } from "@/lib/seed-data"

export async function GET() {
  const evaluations = getSeedEvaluations()
  return NextResponse.json(evaluations)
}
