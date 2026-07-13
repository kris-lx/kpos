FROM oven/bun:1-alpine AS base
WORKDIR /app
RUN apk add --no-cache curl

# ── Install dependencies ────────────────────────────────────────────────────
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile || bun install

# ── Migrator stage (runs drizzle-kit migrate then exits) ────────────────────
# Needs full source + devDeps (drizzle-kit, tsx) to apply migrations.
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["bunx", "drizzle-kit", "migrate"]

# ── Production runtime ──────────────────────────────────────────────────────
# We run the TypeScript source directly with bun (no bundling step needed —
# bun's native TS runner is fast and avoids native-module bundling errors
# from optional dev-only shims in argon2/node-pre-gyp).
FROM base AS production
ENV NODE_ENV=production
RUN addgroup -S kpos && adduser -S kpos -G kpos && chown kpos:kpos /app
COPY --from=deps --chown=kpos:kpos /app/node_modules ./node_modules
COPY --chown=kpos:kpos . .
USER kpos
EXPOSE 5000
CMD ["bun", "src/index.ts"]

# ── Development ─────────────────────────────────────────────────────────────
FROM base AS dev
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5000
CMD ["bun", "--watch", "src/index.ts"]
