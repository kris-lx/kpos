FROM oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# ── Install dependencies ───────────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# ── Build for production ───────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# PUBLIC_API_URL must be set at build time so SvelteKit bakes it into the
# client bundle.  Pass via: --build-arg PUBLIC_API_URL=https://...
ARG PUBLIC_API_URL=http://localhost/api/v1
ENV PUBLIC_API_URL=${PUBLIC_API_URL}

RUN bun run build

# ── Production runtime (adapter-node) ─────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache curl

# Copy only the built output and production deps
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000

# adapter-node entry point
CMD ["node", "build"]

# ── Development ───────────────────────────────────────────────────────────
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0"]
