// ═══════════════════════════════════════════════════════════════════════════
// KPOS - withTenantTx Middleware
// Wraps every authenticated request in a transaction where the per-request
// RLS context (tenant_id + branch_path + optional schema) is set.
//
// MUST run AFTER `authenticate` so `req.authUser` is populated.
// Three-level tenant isolation — Layer 2 (PostgreSQL RLS).
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { db } from '@/config/database.config';
import { setRequestContext } from '@/db/set-tenant-context';
import type { PgTransaction } from 'drizzle-orm/pg-core';

declare global {
    namespace Express {
        interface Request {
            /**
             * Transaction-scoped Drizzle handle with RLS GUCs already set.
             * Handlers should prefer `req.tx` over the global `db` for
             * tenant-owned tables so RLS policies are enforced.
             */
            tx?: PgTransaction<any, any, any>;
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

        // SuperAdmin operates outside any tenant scope — skip the transaction
        // wrapper so cross-tenant queries are possible. (Their routes are
        // already gated by `isSuperAdmin` checks.)
        if (isSuperAdmin) {
            return next();
        }

        if (!tenantId) {
            res.status(403).json({
                success: false,
                error: { code: 'TENANT_SCOPE_MISSING', message: 'Missing tenant context' },
            });
            return;
        }

        try {
            await db.transaction(async (tx) => {
                await setRequestContext(tx, {
                    tenantId,
                    branchPath: activeBranchPath,
                    // schemaName: loaded from tenants table when Enterprise plan is enabled
                });
                req.tx = tx;

                // Run the rest of the chain inside this transaction. We resolve
                // the transaction only after `next()` completes.
                await new Promise<void>((resolve, reject) => {
                    res.on('finish', resolve);
                    res.on('close', resolve);
                    try {
                        next((err?: unknown) => (err ? reject(err) : resolve()));
                    } catch (err) {
                        reject(err);
                    }
                });
            });
        } catch (err) {
            next(err);
        }
    };
}
