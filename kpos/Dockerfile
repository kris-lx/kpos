FROM oven/bun:1-alpine AS base
WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Development
FROM base AS dev
RUN apk add --no-cache curl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
ENV HOST=0.0.0.0
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0"]

# Build for production
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Production with Node adapter (requires @sveltejs/adapter-node)
FROM base AS production
ENV NODE_ENV=production
RUN apk add --no-cache curl
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "build"]
