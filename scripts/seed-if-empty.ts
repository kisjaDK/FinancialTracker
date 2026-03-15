import "dotenv/config"
import { PrismaClient } from "@prisma/client"
import { disconnectSeedDatabase, seedDatabase } from "../prisma/seed"

const prisma = new PrismaClient()

async function main() {
  const trackingYearCount = await prisma.trackingYear.count()

  if (trackingYearCount > 0) {
    console.log("Database already contains data. Skipping seed.")
    return
  }

  console.log("Database is empty. Running seed data...")
  await seedDatabase()
}

main()
  .catch((error) => {
    console.error("Seed-if-empty failed")
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectSeedDatabase()
    await prisma.$disconnect()
  })
