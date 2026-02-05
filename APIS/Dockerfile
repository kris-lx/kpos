FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Install dependencies
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

# Development
FROM base AS dev
RUN apk add --no-cache curl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
EXPOSE 5000
CMD ["bun", "--watch", "src/index.ts"]

# Build
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bunx prisma generate
RUN bun build src/index.ts --outdir ./dist --target bun

# Production
FROM base AS production
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./
RUN bunx prisma generate
EXPOSE 5000
CMD ["bun", "dist/index.js"]
