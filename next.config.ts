import type { NextConfig } from "next"
import path from "path"

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "prisma"],
  outputFileTracingIncludes: {
    "/*": [
      "./lib/generated/prisma/**/*",
      "./node_modules/.prisma/**/*",
      "./node_modules/@prisma/client/**/*",
    ],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
}

export default nextConfig
