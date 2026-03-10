import { NextResponse } from "next/server"
import {
  getSeedMetrics,
  getSeedDailyMetrics,
  getSeedTopicDistribution,
  getSeedSatisfactionDistribution,
} from "@/lib/seed-data"

export async function GET() {
  const overview = getSeedMetrics()
  const daily = getSeedDailyMetrics()
  const topics = getSeedTopicDistribution()
  const satisfaction = getSeedSatisfactionDistribution()

  return NextResponse.json({
    overview,
    daily,
    topics,
    satisfaction,
  })
}
