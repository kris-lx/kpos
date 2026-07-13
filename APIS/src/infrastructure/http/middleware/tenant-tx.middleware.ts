// ═══════════════════════════════════════════════════════════════════════════
// KPOS - withTenantTx Middleware
// Attaches req.tx: a Drizzle handle bound to a single reserved Postgres
// connection with the per-request RLS context (tenant_id + branch_path)
// already set on it as session-level GUCs.
//
// Deliberately does NOT wrap the request in `db.transaction()`. That was the
// original design here, but it pins one physical connection for the entire
// request/response lifecycle — including any slow external I/O a handler
// does mid-request (SwiftPass/JDB payment gateway calls, Cloudinary uploads,
// outbound email sends). With a capped connection pool (20 in production),
// a burst of concurrent slow requests would exhaust it and start failing
// unrelated requests. `primaryClient.reserve()` checks out one connection we
// fully control instead — same GUC-binding property, without the forced
// transaction envelope.
//
// req.tx does NOT support .transaction() — postgres.js's reserve()-returned
// connection object has no .begin() (verified: throws "this.client.begin is
// not a function"). Handlers that need real atomicity use the pooled
// globalDb.transaction() directly instead (see scopedTransaction() in
// sales/routes.ts for the pattern — sets RLS context with SET LOCAL inside
// the transaction rather than going through req.tx at all).
//
// MUST run AFTER `authenticate` so `req.authUser` is populated.
// Three-level tenant isolation — Layer 2 (PostgreSQL RLS).
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { primaryClient } from '@/config/database.config';
import { setRequestContext, setSuperAdminBypassContext, resetRequestContext } from '@/db/set-tenant-context';
import * as schema from '@/db/schema';

declare global {
    namespace Express {
        interface Request {
            /**
             * Drizzle handle bound to a reserved connection with RLS GUCs
             * already set. Handlers should prefer `req.tx` over the global
             * `db` for tenant-owned tables so RLS policies are enforced.
             * For superadmin requests, the connection instead gets the
             * app.bypass_rls GUC (drizzle/0020) so cross-tenant queries see
             * every tenant's rows rather than only tenant_id IS NULL orphans.
             * Falls back to the global `db` (no req.tx) only for
             * unauthenticated routes — see withTenantTx() below.
             */
            tx?: PostgresJsDatabase<typeof schema>;
        }
    }
}

export function withTenantTx() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        // Unauthenticated routes (e.g. /auth/login) bypass — RLS does not apply.
        if (!req.authUser) {
            return next();
        }

        const { tenantId, activeBranchPath, isSuperAdmin } = req.authUser;

        if (!isSuperAdmin && !tenantId) {
            res.status(403).json({
                success: false,
                error: { code: 'TENANT_SCOPE_MISSING', message: 'Missing tenant context' },
            });
            return;
        }

        let reserved: Awaited<ReturnType<typeof primaryClient.reserve>> | undefined;
        let released = false;
        const releaseConnection = async (): Promise<void> => {
            if (released || !reserved) return;
            released = true;
            try {
                await resetRequestContext(drizzle(reserved, { schema }));
            } catch {
                // Connection may already be broken — still release it so it's
                // not leaked from the pool; a broken connection gets recycled
                // by postgres.js on next use rather than reused as-is.
            }
            reserved.release();
        };

        try {
            reserved = await primaryClient.reserve();
            // drizzle-orm/postgres-js reads client.options.parsers during setup —
            // the reserve()-returned connection object doesn't expose `.options`
            // (only the parent pool client does), so drizzle(reserved, ...) throws
            // "Cannot read properties of undefined (reading 'parsers')" without
            // this. Type parsers/options are pool-wide config, not per-connection
            // state, so sharing the reference here is safe.
            (reserved as any).options = (primaryClient as any).options;
            const tx = drizzle(reserved, { schema });
            if (isSuperAdmin) {
                // Controlled, policy-level cross-tenant bypass (drizzle/0020) —
                // NOT a DB-role BYPASSRLS grant. See setSuperAdminBypassContext().
                await setSuperAdminBypassContext(tx, { local: false });
            } else {
                await setRequestContext(tx, { tenantId: tenantId!, branchPath: activeBranchPath }, { local: false });
            }
            req.tx = tx;
        } catch (err) {
            await releaseConnection();
            next(err);
            return;
        }

        res.on('finish', releaseConnection);
        res.on('close', releaseConnection);
        next();
    };
}
