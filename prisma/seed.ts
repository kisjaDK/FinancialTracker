import "dotenv/config"
import { PrismaClient } from "../lib/generated/prisma/client"

const prisma = new PrismaClient()

const topics = [
  "Technical Support",
  "Account Access",
  "Billing Inquiry",
  "Product Information",
  "Password Reset",
  "Feature Request",
  "Bug Report",
  "Onboarding Help",
  "Integration Setup",
  "Data Export",
]

const channels = ["web", "mobile", "api", "slack"]

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function main() {
  console.log("Seeding database...")

  await prisma.dailyMetrics.deleteMany()
  await prisma.evaluation.deleteMany()
  await prisma.message.deleteMany()
  await prisma.conversation.deleteMany()

  const now = new Date()

  for (let i = 29; i >= 0; i--) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)

    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const baseConversations = isWeekend ? 280 : 420
    const totalConversations = baseConversations + randomBetween(-40, 40)

    await prisma.dailyMetrics.create({
      data: {
        date,
        totalConversations,
        totalMessages: totalConversations * randomBetween(5, 9),
        avgSatisfaction: 3.8 + Math.random() * 0.8,
        resolutionRate: 82 + Math.random() * 12,
        avgResponseTimeMs: randomBetween(900, 1500),
        avgTokensPerMsg: 120 + Math.random() * 80,
        uniqueUsers: Math.floor(totalConversations * 0.7),
      },
    })
  }

  for (let i = 0; i < 50; i++) {
    const startedAt = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
    const isCompleted = Math.random() > 0.2
    const messageCount = randomBetween(2, 15)

    const conversation = await prisma.conversation.create({
      data: {
        sessionId: `sess_${Math.random().toString(36).substring(2, 10)}`,
        userId: Math.random() > 0.2 ? `user_${randomBetween(1, 500)}` : null,
        channel: channels[randomBetween(0, channels.length - 1)],
        status: isCompleted ? "completed" : Math.random() > 0.5 ? "active" : "escalated",
        satisfaction: isCompleted ? randomBetween(3, 5) : null,
        messageCount,
        resolved: isCompleted && Math.random() > 0.15,
        topic: topics[randomBetween(0, topics.length - 1)],
        startedAt,
        endedAt: isCompleted
          ? new Date(startedAt.getTime() + Math.random() * 30 * 60 * 1000)
          : null,
      },
    })

    for (let j = 0; j < messageCount; j++) {
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: j % 2 === 0 ? "user" : "assistant",
          content: j % 2 === 0 ? "Sample user message" : "Sample assistant response",
          tokenCount: randomBetween(20, 300),
          latencyMs: j % 2 === 1 ? randomBetween(500, 2500) : null,
        },
      })
    }

    if (isCompleted) {
      await prisma.evaluation.create({
        data: {
          conversationId: conversation.id,
          accuracy: 0.7 + Math.random() * 0.3,
          relevance: 0.7 + Math.random() * 0.3,
          coherence: 0.8 + Math.random() * 0.2,
          helpfulness: 0.65 + Math.random() * 0.35,
          toxicity: Math.random() * 0.05,
          groundedness: 0.75 + Math.random() * 0.25,
          latencyP50: randomBetween(600, 1200),
          latencyP95: randomBetween(1500, 3000),
        },
      })
    }
  }

  console.log("Seeding complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
