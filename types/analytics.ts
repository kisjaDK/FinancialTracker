export interface MetricsOverview {
  totalConversations: number
  avgSatisfaction: number
  resolutionRate: number
  avgResponseTimeMs: number
  totalMessages: number
  uniqueUsers: number
  avgTokensPerMessage: number
  changeFromPrevious: {
    conversations: number
    satisfaction: number
    resolutionRate: number
    responseTime: number
  }
}

export interface ConversationSummary {
  id: string
  sessionId: string
  userId: string | null
  channel: string
  status: string
  satisfaction: number | null
  messageCount: number
  resolved: boolean
  topic: string | null
  startedAt: string
  endedAt: string | null
}

export interface EvaluationMetrics {
  accuracy: number
  relevance: number
  coherence: number
  helpfulness: number
  toxicity: number
  groundedness: number
  latencyP50: number
  latencyP95: number
}

export interface DailyMetric {
  date: string
  totalConversations: number
  totalMessages: number
  avgSatisfaction: number
  resolutionRate: number
  avgResponseTimeMs: number
  uniqueUsers: number
}

export interface TopicDistribution {
  topic: string
  count: number
  percentage: number
}

export interface SatisfactionDistribution {
  rating: number
  count: number
}

export interface AnalyticsFilters {
  dateRange: {
    from: string
    to: string
  }
  channel?: string
  topic?: string
}
