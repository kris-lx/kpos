// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Set Tenant + Branch Context for RLS (Layer 2)
// Uses SET LOCAL so the GUCs are scoped to the current transaction only.
// Call this at the start of every authenticated request inside db.transaction().
// ═══════════════════════════════════════════════════════════════════════════

import { sql } from 'drizzle-orm';
import type { PgTransaction } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

export interface RequestContextVars {
    tenantId: string;
    branchPath?: string;
    /** Optional schema name for Enterprise-plan tenants (Layer 3). */
    schemaName?: string;
}

/** Accepts either a real transaction (SET LOCAL, auto-resets on commit/rollback)
 *  or a plain Drizzle handle bound to a reserved connection (session-level SET —
 *  caller MUST RESET ALL before releasing the connection back to the pool, see
 *  withTenantTx / resetRequestContext below). */
type ContextCapableDb = PgTransaction<any, any, any> | PostgresJsDatabase<any>;

/**
 * Sets all per-request RLS GUC variables in one shot:
 *   - app.current_tenant_id  (required)
 *   - app.current_branch_path (optional — tenant admins have none)
 *   - search_path (optional — Enterprise schema-per-tenant)
 *
 * `local: true` (default) uses SET LOCAL — scoped to the current transaction,
 * auto-reset on commit/rollback. Use this inside an explicit `db.transaction()`.
 *
 * `local: false` uses plain SET — scoped to the whole session (physical
 * connection) until changed or reset. This is what {@link withTenantTx} uses
 * on a `primaryClient.reserve()`'d connection instead of wrapping the entire
 * request in a transaction (which would pin a connection for the full
 * request lifecycle, including slow external I/O). Callers using `local:
 * false` MUST call {@link resetRequestContext} before releasing the
 * connection back to the pool — postgres.js does not reset session state on
 * release, so a stale GUC would otherwise leak into whichever request reuses
 * that physical connection next.
 *
 * @example
 * await db.transaction(async (tx) => {
 *   await setRequestContext(tx, { tenantId, branchPath });
 *   // ... queries inside this tx see RLS-filtered rows
 * });
 */
// Postgres's SET/SET LOCAL grammar does not accept a bind parameter for the
// value (verified: `SET app.x = $1` is a syntax error under postgres.js's
// extended protocol) — these have to be interpolated as string literals.
// Validate strictly against expected formats first so that's safe regardless
// of how trustworthy the caller believes tenantId/branchPath to be.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// branch_path (branches.branchPath) is a plain text('branch_path') column in
// the live schema — free-form short codes like "HQ" / "BR-SHOP 1", not the
// dot-joined UUID hierarchy an earlier design doc for this table assumed.
// Allow the actual character set in use (word chars, spaces, hyphens, dots)
// and reject anything else — in particular, no quotes, since this still gets
// interpolated as a raw SQL string literal below.
const BRANCH_PATH_RE = /^[\w .-]+$/;
const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export async function setRequestContext(
    db: ContextCapableDb,
    vars: RequestContextVars,
    options: { local?: boolean } = {},
): Promise<void> {
    if (!vars.tenantId || !UUID_RE.test(vars.tenantId)) {
        throw new Error('setRequestContext: tenantId must be a valid UUID');
    }
    if (vars.branchPath && !BRANCH_PATH_RE.test(vars.branchPath)) {
        throw new Error('setRequestContext: branchPath has an unexpected format');
    }
    if (vars.schemaName && !IDENTIFIER_RE.test(vars.schemaName)) {
        throw new Error('setRequestContext: schemaName has an unexpected format');
    }
    const setKeyword = options.local === false ? 'SET' : 'SET LOCAL';

    await db.execute(sql.raw(`${setKeyword} app.current_tenant_id = '${vars.tenantId}'`));

    if (vars.branchPath) {
        await db.execute(sql.raw(`${setKeyword} app.current_branch_path = '${vars.branchPath}'`));
    } else {
        // Empty string → policies must allow tenant-admin (root scope) access.
        await db.execute(sql.raw(`${setKeyword} app.current_branch_path = ''`));
    }

    if (vars.schemaName) {
        // Enterprise plan: switch default schema. `public` retained for shared
        // catalogs (extensions, migrations metadata).
        await db.execute(sql.raw(`${setKeyword} search_path = "${vars.schemaName}", public`));
    }
}

/**
 * Resets session-level GUCs set by {@link setRequestContext} with
 * `local: false`. MUST be called on a reserved connection before releasing
 * it back to the pool — otherwise the tenant context set for one request
 * leaks into whichever request happens to reuse that physical connection
 * next (postgres.js's `reserve()`/`release()` does not reset session state).
 */
export async function resetRequestContext(db: PostgresJsDatabase<any>): Promise<void> {
    await db.execute(sql.raw('RESET ALL'));
}
