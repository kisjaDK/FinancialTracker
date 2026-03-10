import { create } from "zustand"
import type {
  MetricsOverview,
  ConversationSummary,
  EvaluationMetrics,
  DailyMetric,
  TopicDistribution,
  SatisfactionDistribution,
  AnalyticsFilters,
} from "@/types/analytics"

interface AnalyticsState {
  metrics: MetricsOverview | null
  conversations: ConversationSummary[]
  evaluations: EvaluationMetrics | null
  dailyMetrics: DailyMetric[]
  topicDistribution: TopicDistribution[]
  satisfactionDistribution: SatisfactionDistribution[]
  filters: AnalyticsFilters
  isLoading: boolean
  error: string | null

  setFilters: (filters: Partial<AnalyticsFilters>) => void
  fetchMetrics: () => Promise<void>
  fetchConversations: () => Promise<void>
  fetchEvaluations: () => Promise<void>
  fetchAll: () => Promise<void>
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  metrics: null,
  conversations: [],
  evaluations: null,
  dailyMetrics: [],
  topicDistribution: [],
  satisfactionDistribution: [],
  filters: {
    dateRange: {
      from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      to: new Date().toISOString().split("T")[0],
    },
  },
  isLoading: false,
  error: null,

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  fetchMetrics: async () => {
    try {
      set({ isLoading: true, error: null })
      const { filters } = get()
      const params = new URLSearchParams({
        from: filters.dateRange.from,
        to: filters.dateRange.to,
      })
      const res = await fetch(`/api/analytics/metrics?${params}`)
      if (!res.ok) throw new Error("Failed to fetch metrics")
      const data = await res.json()
      set({
        metrics: data.overview,
        dailyMetrics: data.daily,
        topicDistribution: data.topics,
        satisfactionDistribution: data.satisfaction,
      })
    } catch (error) {
      set({ error: (error as Error).message })
    } finally {
      set({ isLoading: false })
    }
  },

  fetchConversations: async () => {
    try {
      const { filters } = get()
      const params = new URLSearchParams({
        from: filters.dateRange.from,
        to: filters.dateRange.to,
      })
      const res = await fetch(`/api/analytics/conversations?${params}`)
      if (!res.ok) throw new Error("Failed to fetch conversations")
      const data = await res.json()
      set({ conversations: data })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  fetchEvaluations: async () => {
    try {
      const res = await fetch("/api/analytics/evaluations")
      if (!res.ok) throw new Error("Failed to fetch evaluations")
      const data = await res.json()
      set({ evaluations: data })
    } catch (error) {
      set({ error: (error as Error).message })
    }
  },

  fetchAll: async () => {
    set({ isLoading: true, error: null })
    const store = get()
    await Promise.all([
      store.fetchMetrics(),
      store.fetchConversations(),
      store.fetchEvaluations(),
    ])
    set({ isLoading: false })
  },
}))
