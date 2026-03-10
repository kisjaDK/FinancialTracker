import type {
  MetricsOverview,
  ConversationSummary,
  EvaluationMetrics,
  DailyMetric,
  TopicDistribution,
  SatisfactionDistribution,
} from "@/types/analytics"

export function getSeedMetrics(): MetricsOverview {
  return {
    totalConversations: 12847,
    avgSatisfaction: 4.2,
    resolutionRate: 87.3,
    avgResponseTimeMs: 1240,
    totalMessages: 89421,
    uniqueUsers: 3241,
    avgTokensPerMessage: 156.8,
    changeFromPrevious: {
      conversations: 12.5,
      satisfaction: 3.2,
      resolutionRate: -1.8,
      responseTime: -8.4,
    },
  }
}

export function getSeedDailyMetrics(): DailyMetric[] {
  const days = 30
  const metrics: DailyMetric[] = []
  const now = new Date()

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const baseConversations = isWeekend ? 280 : 420
    const variance = Math.floor(Math.random() * 80) - 40

    metrics.push({
      date: date.toISOString().split("T")[0],
      totalConversations: baseConversations + variance,
      totalMessages: (baseConversations + variance) * 7,
      avgSatisfaction: 3.8 + Math.random() * 0.8,
      resolutionRate: 82 + Math.random() * 12,
      avgResponseTimeMs: 900 + Math.floor(Math.random() * 600),
      uniqueUsers: Math.floor((baseConversations + variance) * 0.7),
    })
  }

  return metrics
}

export function getSeedConversations(): ConversationSummary[] {
  const topics = [
    "Account Access",
    "Billing Inquiry",
    "Technical Support",
    "Product Information",
    "Password Reset",
    "Feature Request",
    "Bug Report",
    "Onboarding Help",
    "Integration Setup",
    "Data Export",
  ]
  const channels = ["web", "mobile", "api", "slack"]
  const statuses = ["completed", "completed", "completed", "active", "escalated"]

  return Array.from({ length: 25 }, (_, i) => {
    const startedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
    const status = statuses[Math.floor(Math.random() * statuses.length)]
    const ended = status === "completed"

    return {
      id: `conv_${String(i + 1).padStart(4, "0")}`,
      sessionId: `sess_${Math.random().toString(36).substring(2, 10)}`,
      userId: Math.random() > 0.2 ? `user_${Math.floor(Math.random() * 500)}` : null,
      channel: channels[Math.floor(Math.random() * channels.length)],
      status,
      satisfaction: ended ? Math.floor(Math.random() * 3) + 3 : null,
      messageCount: Math.floor(Math.random() * 15) + 2,
      resolved: ended && Math.random() > 0.15,
      topic: topics[Math.floor(Math.random() * topics.length)],
      startedAt: startedAt.toISOString(),
      endedAt: ended
        ? new Date(startedAt.getTime() + Math.random() * 30 * 60 * 1000).toISOString()
        : null,
    }
  })
}

export function getSeedEvaluations(): EvaluationMetrics {
  return {
    accuracy: 0.91,
    relevance: 0.88,
    coherence: 0.94,
    helpfulness: 0.86,
    toxicity: 0.02,
    groundedness: 0.89,
    latencyP50: 850,
    latencyP95: 2100,
  }
}

export function getSeedTopicDistribution(): TopicDistribution[] {
  const topics = [
    { topic: "Technical Support", count: 3842 },
    { topic: "Account Access", count: 2567 },
    { topic: "Billing Inquiry", count: 2103 },
    { topic: "Product Information", count: 1654 },
    { topic: "Password Reset", count: 1231 },
    { topic: "Feature Request", count: 892 },
    { topic: "Bug Report", count: 558 },
  ]
  const total = topics.reduce((sum, t) => sum + t.count, 0)
  return topics.map((t) => ({
    ...t,
    percentage: Math.round((t.count / total * 100) * 10) / 10,
  }))
}

export function getSeedSatisfactionDistribution(): SatisfactionDistribution[] {
  return [
    { rating: 1, count: 312 },
    { rating: 2, count: 589 },
    { rating: 3, count: 2341 },
    { rating: 4, count: 5123 },
    { rating: 5, count: 4482 },
  ]
}
