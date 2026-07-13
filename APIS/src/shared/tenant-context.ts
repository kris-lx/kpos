// ═══════════════════════════════════════════════════════════════════════════
// Runs a DB operation scoped to a known tenantId via RLS, for code paths that
// have no `req` to derive tenant context from (background workers, service
// helpers that only take a tenantId parameter, pre-auth routes like SSO
// login). Every tenant table has FORCE ROW LEVEL SECURITY — a plain query
// via the pooled `db` connection silently returns zero rows (SELECT) or
// throws 42501 insufficient_privilege (INSERT/UPDATE) without this.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { setRequestContext } from '@/db/set-tenant-context';
import type { PgTransaction } from 'drizzle-orm/pg-core';

export async function runWithTenantContext<T>(
    tenantId: string,
    callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
    return db.transaction(async (tx) => {
        await setRequestContext(tx as unknown as PgTransaction<any, any, any>, { tenantId }, { local: true });
        return callback(tx);
    });
}
