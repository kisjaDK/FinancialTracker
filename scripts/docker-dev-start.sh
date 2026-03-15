#!/bin/sh
set -eu

PACKAGE_LOCK_MARKER="node_modules/.package-lock.json"
PRISMA_CLIENT_MARKER="lib/generated/prisma/client.ts"
PRISMA_LINUX_ENGINE="lib/generated/prisma/libquery_engine-linux-arm64-openssl-3.0.x.so.node"
PRISMA_RUNTIME_CLIENT_MARKER="node_modules/@prisma/client/index.js"
PRISMA_RUNTIME_ENGINE="node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node"

if [ ! -d node_modules ] || [ ! -f "$PACKAGE_LOCK_MARKER" ] || [ package-lock.json -nt "$PACKAGE_LOCK_MARKER" ]; then
  echo "Installing dependencies in the mounted workspace..."
  npm install
else
  echo "Dependencies unchanged. Skipping npm install."
fi

if [ ! -f "$PRISMA_CLIENT_MARKER" ] || [ ! -f "$PRISMA_LINUX_ENGINE" ] || [ ! -f "$PRISMA_RUNTIME_CLIENT_MARKER" ] || [ ! -f "$PRISMA_RUNTIME_ENGINE" ] || [ prisma/schema.prisma -nt "$PRISMA_CLIENT_MARKER" ] || [ package-lock.json -nt "$PRISMA_CLIENT_MARKER" ]; then
  echo "Generating Prisma client..."
  npm run db:generate
  echo "Clearing stale Next.js cache after Prisma generation..."
  rm -rf .next
else
  echo "Prisma client up to date. Skipping generation."
fi

echo "Waiting for Postgres and applying migrations..."
until npm run db:migrate:deploy; do
  echo "Postgres is not ready yet. Retrying in 3 seconds..."
  sleep 3
done

echo "Seeding the database if it is empty..."
npm run db:seed:if-empty

echo "Starting Next.js dev server..."
exec npm run dev -- --hostname 0.0.0.0
