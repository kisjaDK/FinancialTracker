#!/bin/sh
set -eu

DEPENDENCY_HASH_MARKER="node_modules/.deps-hash"
PRISMA_CLIENT_MARKER="lib/generated/prisma/client.ts"
PRISMA_LINUX_ENGINE="lib/generated/prisma/libquery_engine-linux-arm64-openssl-3.0.x.so.node"
PRISMA_RUNTIME_CLIENT_MARKER="node_modules/@prisma/client/index.js"
PRISMA_RUNTIME_ENGINE="node_modules/.prisma/client/libquery_engine-linux-arm64-openssl-3.0.x.so.node"
PRISMA_RUNTIME_SCHEMA_MARKER="node_modules/.prisma/client/schema.prisma"

compute_dependency_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum package.json package-lock.json | sha256sum | cut -d' ' -f1
    return
  fi

  shasum -a 256 package.json package-lock.json | shasum -a 256 | cut -d' ' -f1
}

CURRENT_DEPENDENCY_HASH="$(compute_dependency_hash)"
SAVED_DEPENDENCY_HASH=""

if [ -f "$DEPENDENCY_HASH_MARKER" ]; then
  SAVED_DEPENDENCY_HASH="$(cat "$DEPENDENCY_HASH_MARKER")"
fi

if [ ! -d node_modules ] || [ "$CURRENT_DEPENDENCY_HASH" != "$SAVED_DEPENDENCY_HASH" ]; then
  echo "Installing dependencies from package-lock.json in the mounted workspace..."
  npm ci
  printf '%s\n' "$CURRENT_DEPENDENCY_HASH" > "$DEPENDENCY_HASH_MARKER"
else
  echo "Dependencies unchanged. Skipping npm install."
fi

if [ ! -f "$PRISMA_CLIENT_MARKER" ] || [ ! -f "$PRISMA_LINUX_ENGINE" ] || [ ! -f "$PRISMA_RUNTIME_CLIENT_MARKER" ] || [ ! -f "$PRISMA_RUNTIME_ENGINE" ] || [ ! -f "$PRISMA_RUNTIME_SCHEMA_MARKER" ] || [ prisma/schema.prisma -nt "$PRISMA_CLIENT_MARKER" ] || [ prisma/schema.prisma -nt "$PRISMA_RUNTIME_SCHEMA_MARKER" ] || [ "$CURRENT_DEPENDENCY_HASH" != "$SAVED_DEPENDENCY_HASH" ]; then
  echo "Generating Prisma client..."
  npm run db:generate
  echo "Clearing stale Next.js cache after Prisma generation..."
  if [ -d .next ]; then
    find .next -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  fi
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
