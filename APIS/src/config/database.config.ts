// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Database Configuration (Drizzle ORM + PostgreSQL)
// Load Balancing: Write → primary, Read → replica (if configured)
// ═══════════════════════════════════════════════════════════════════════════

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { appConfig, dbConfig } from "./app.config";
import * as schema from "@/db/schema";

// ─── Connection Pools ────────────────────────────────────────────────────

// Exported (not just module-private) so withTenantTx() can reserve a single
// physical connection per request via primaryClient.reserve() — needed to
// bind the RLS session GUCs (app.current_tenant_id, ...) to one connection
// for the request's DB work without pinning it across slow external I/O the
// way wrapping the whole request in db.transaction() would.
export const primaryClient = postgres(dbConfig.url, {
  max: appConfig.isProduction ? 20 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {},
});

// Read replica pool (falls back to primary if not configured)
const readClient = dbConfig.readUrl
  ? postgres(dbConfig.readUrl, {
      max: appConfig.isProduction ? 30 : 5,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    })
  : primaryClient;

// ─── Drizzle Instances ──────────────────────────────────────────────────

/** Primary DB — use for all writes and transactional reads */
export const db = drizzle(primaryClient, {
  schema,
  logger: appConfig.isDevelopment,
});

/** Read replica DB — use for read-heavy queries (dashboards, reports, lists) */
export const dbRead = drizzle(readClient, {
  schema,
  logger: appConfig.isDevelopment,
});

// ─── Connection State ────────────────────────────────────────────────────

let dbConnected = false;

export function isDatabaseConnected(): boolean {
  return dbConnected;
}

export async function connectDatabase(
  retries = 5,
  delayMs = 3000,
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Test connection with a simple query
      await primaryClient`SELECT 1`;
      dbConnected = true;

      const replicaStatus = dbConfig.readUrl
        ? "(with read replica)"
        : "(single node)";
      console.log(`✅ PostgreSQL connected successfully ${replicaStatus}`);

      if (dbConfig.readUrl) {
        await readClient`SELECT 1`;
        console.log("✅ Read replica connected successfully");
      }
      return;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(
        `❌ Database connection attempt ${attempt}/${retries} failed: ${msg}`,
      );

      if (attempt < retries) {
        console.log(`⏳ Retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  dbConnected = false;
  if (appConfig.isProduction) {
    console.error("❌ All database connection attempts failed. Exiting.");
    process.exit(1);
  } else {
    console.error(
      "⚠️  Database not available. Server will start but DB queries will fail.",
    );
    console.error(
      "⚠️  Make sure PostgreSQL is running: docker compose up -d postgres",
    );
  }
}

export async function disconnectDatabase(): Promise<void> {
  await primaryClient.end();
  if (dbConfig.readUrl) {
    await readClient.end();
  }
  dbConnected = false;
  console.log("📤 Database disconnected");
}
