#!/bin/sh
set -eu

echo "Installing dependencies in the mounted workspace if needed..."
npm install

echo "Generating Prisma client..."
npm run db:generate

echo "Waiting for Postgres and applying migrations..."
until npm run db:migrate:deploy; do
  echo "Postgres is not ready yet. Retrying in 3 seconds..."
  sleep 3
done

echo "Seeding the database if it is empty..."
npm run db:seed:if-empty

echo "Starting Next.js dev server..."
exec npm run dev -- --hostname 0.0.0.0
