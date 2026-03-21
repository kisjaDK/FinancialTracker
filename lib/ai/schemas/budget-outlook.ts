import { z } from "zod"

export const budgetOutlookDriverSchema = z.object({
  title: z.string().trim().min(1),
  direction: z.enum(["favorable", "unfavorable", "neutral"]),
  explanation: z.string().trim().min(1),
})

export const budgetOutlookOutputSchema = z.object({
  outlook: z.enum(["on_track", "watch", "off_track"]),
  summary: z.string().trim().min(1),
  keyDrivers: z.array(budgetOutlookDriverSchema).min(1).max(5),
  watchouts: z.array(z.string().trim().min(1)).max(5),
  actions: z.array(z.string().trim().min(1)).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  coverageNotes: z.array(z.string().trim().min(1)).max(5).optional().default([]),
})

export type BudgetOutlookOutput = z.infer<typeof budgetOutlookOutputSchema>
