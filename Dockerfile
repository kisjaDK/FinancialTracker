FROM node:20-bookworm

WORKDIR /app

ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
