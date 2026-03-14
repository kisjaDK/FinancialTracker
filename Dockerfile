FROM node:20-bookworm

WORKDIR /app

ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
