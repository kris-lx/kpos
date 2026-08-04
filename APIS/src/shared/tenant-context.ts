// ═══════════════════════════════════════════════════════════════════════════
// Runs a DB operation scoped to a known tenantId via RLS, for code paths that
// have no `req` to derive tenant context from (background workers, service
// helpers that only take a tenantId parameter, pre-auth routes like SSO
// login). Every tenant table has FORCE ROW LEVEL SECURITY — a plain query
// via the pooled `db` connection silently returns zero rows (SELECT) or
// throws 42501 insufficient_privilege (INSERT/UPDATE) without this.
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { setRequestContext, setSuperAdminBypassContext } from '@/db/set-tenant-context';
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

// Same as runWithTenantContext, but for call sites whose tenantId is only
// undefined because the caller resolved it as `!isSuperAdmin && tenantId`
// (see the restaurant module's route handlers) — i.e. undefined here means
// "confirmed superadmin caller", the one case setSuperAdminBypassContext's
// contract allows. Do NOT pass undefined here for any other reason.
export async function runWithTenantOrBypassContext<T>(
    tenantId: string | undefined,
    callback: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
    return db.transaction(async (tx) => {
        if (tenantId) {
            await setRequestContext(tx as unknown as PgTransaction<any, any, any>, { tenantId }, { local: true });
        } else {
            await setSuperAdminBypassContext(tx as unknown as PgTransaction<any, any, any>, { local: true });
        }
        return callback(tx);
    });
}
