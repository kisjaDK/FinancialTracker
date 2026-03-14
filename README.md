# Pandora Finance Tracker

Local development now runs against Postgres in Docker Compose. SQLite is no longer part of the supported dev workflow.

## Prerequisites

- Docker Desktop or a compatible Docker Engine with Compose support
- Node.js 20+ if you want to run app commands on the host

## Environment Files

- `.env.example`: tracked template with placeholder values
- `.env`: host-based settings, including a `localhost` Postgres `DATABASE_URL`
- `.env.docker`: container settings, including a Compose-hostname `DATABASE_URL`

Create or update `.env.docker` before the first Docker boot. It should mirror `.env.example`, but use `postgres` as the database host in `DATABASE_URL`.
If port `3000` is already in use on your machine, change `APP_PORT` in `.env` before starting the stack.

For local login flows, `AUTH_URL` should stay aligned with the URL you open in the browser, which is `http://localhost:3000` in the default setup.

## Start Local Development

```bash
npm run docker:dev
```

That command builds the app image, starts Postgres, installs dependencies in the mounted workspace, generates the Prisma client, applies migrations, seeds the database if it is empty, and starts Next.js on `http://localhost:${APP_PORT}`.

## Stop Or Reset

Stop the stack:

```bash
npm run docker:dev:down
```

Reset the local Postgres volume:

```bash
npm run docker:dev:reset-db
```

The reset command is destructive. The next `npm run docker:dev` will recreate the database and seed it again.

## Prisma Workflow

Common commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:migrate:deploy
npm run db:seed
```

- Use `db:migrate` when creating a new migration during development.
- Use `db:migrate:deploy` when applying committed migrations to an existing database.
- Use `db:seed` to reload the sample data manually.

## Notes

- Prisma now uses the `postgresql` provider for both local development and production.
- The committed migration history has been replaced with a Postgres baseline migration so new environments start from the current schema.
- Existing Azure production configuration should keep using its production `DATABASE_URL`.
