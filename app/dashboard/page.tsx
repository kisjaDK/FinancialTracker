"use client"

import { useEffect } from "react"
import { Header } from "@/components/layout/header"
import { MetricsCards } from "@/components/dashboard/metrics-cards"
import { ConversationVolumeChart } from "@/components/dashboard/conversation-volume-chart"
import { SatisfactionChart } from "@/components/dashboard/satisfaction-chart"
import { TopicDistributionChart } from "@/components/dashboard/topic-distribution-chart"
import { RecentConversationsTable } from "@/components/dashboard/recent-conversations-table"
import { EvaluationMetrics } from "@/components/dashboard/evaluation-metrics"
import { useAnalyticsStore } from "@/store/analytics-store"

export default function DashboardPage() {
  const fetchAll = useAnalyticsStore((state) => state.fetchAll)

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return (
    <>
      <Header title="Dashboard" />
      <div className="flex-1 space-y-3 p-4 lg:p-5">

        <MetricsCards />

        <div className="grid gap-3 lg:grid-cols-7">
          <div className="lg:col-span-4">
            <ConversationVolumeChart />
          </div>
          <div className="lg:col-span-3">
            <EvaluationMetrics />
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <SatisfactionChart />
          <TopicDistributionChart />
        </div>

        <RecentConversationsTable />
      </div>
    </>
  )
}
