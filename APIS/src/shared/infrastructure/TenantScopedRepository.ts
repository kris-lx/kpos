// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Tenant-Scoped Repository Base Class
// Three-level tenant isolation — Layer 1 (Application)
// ═══════════════════════════════════════════════════════════════════════════
//
// All repositories that operate on tenant-owned tables MUST extend this class
// and call `this.requireTenant(ctx)` at the start of every query.
//
// This is the single chokepoint that guarantees no tenant-owned row is ever
// touched without an explicit tenantId filter at the application layer.
// Layer 2 (PostgreSQL RLS) and Layer 3 (schema separation) sit beneath this
// for defense in depth.

import { TenantScopeMissingError, BranchScopeViolationError } from '@/shared/domain/errors';

export interface RequestContext {
    tenantId?: string | null;
    branchPath?: string | null;
    accessibleBranchPaths?: string[];
    isSuperAdmin?: boolean;
    userId?: string;
}

export abstract class TenantScopedRepository {
    /**
     * Asserts a tenant scope is present in the request context. SuperAdmins
     * may pass through with no tenant (cross-tenant operations).
     *
     * @throws {TenantScopeMissingError} when ctx.tenantId is missing for a
     *   non-superadmin caller.
     */
    protected requireTenant(ctx: RequestContext, operation: string): string | null {
        if (ctx.isSuperAdmin) return ctx.tenantId ?? null;
        if (!ctx.tenantId) {
            throw new TenantScopeMissingError(operation);
        }
        return ctx.tenantId;
    }

    /**
     * Verifies a resource's branch_path is within the caller's scope.
     * Root tenant admins (no branch scope) bypass this check.
     */
    protected assertBranchScope(
        ctx: RequestContext,
        resourceBranchPath: string | null | undefined,
    ): void {
        if (ctx.isSuperAdmin) return;
        if (!ctx.accessibleBranchPaths || ctx.accessibleBranchPaths.length === 0) return;
        if (!resourceBranchPath) return;
        const allowed = ctx.accessibleBranchPaths.some(
            (p) => resourceBranchPath === p || resourceBranchPath.startsWith(p + '.')
        );
        if (!allowed) {
            throw new BranchScopeViolationError(
                resourceBranchPath,
                ctx.accessibleBranchPaths.join(',')
            );
        }
    }
}
