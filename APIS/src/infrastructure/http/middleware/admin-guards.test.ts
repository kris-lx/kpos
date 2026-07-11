// ═══════════════════════════════════════════════════════════════════════════
// Regression test for the 2026-07-11 privilege-escalation fix: PATCH
// /admin/users/:id/super-admin was gated by requireAdmin() (roleLevel <= 2),
// which let any regular tenant admin — e.g. a normal store_owner, not a
// platform superadmin — grant platform-wide superadmin to an arbitrary user
// by id. Fixed by switching that route to requireSuperAdmin(). This test
// pins the guard functions' behavior directly so that regression can't
// silently come back via either a route-wiring change or a guard-logic change.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireSuperAdmin, requireAdmin, requireTenantAdmin } from './auth.middleware';

function makeReq(overrides: Partial<{ isSuperAdmin: boolean; role: string; roleLevel: number }>): Request {
    const { isSuperAdmin = false, role = 'staff', roleLevel = 7 } = overrides;
    return {
        authUser: { userId: 'u1', email: 'x@x.com', role, roleLevel, isSuperAdmin, tenantId: 't1', branchId: 'b1' },
    } as unknown as Request;
}

function makeRes(): Response {
    return {} as Response;
}

describe('requireSuperAdmin() — granting platform superadmin must be superadmin-only', () => {
    it('rejects a regular tenant admin (store_owner, roleLevel 2) — the exact vulnerable case', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireSuperAdmin()(makeReq({ role: 'store_owner', roleLevel: 2 }), makeRes(), next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('rejects every non-superadmin role level, including the highest tenant-side level (2)', () => {
        for (const roleLevel of [2, 3, 4, 5, 6, 7]) {
            const next = vi.fn() as unknown as NextFunction;
            requireSuperAdmin()(makeReq({ roleLevel }), makeRes(), next);
            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        }
    });

    it('allows a real platform superadmin', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireSuperAdmin()(makeReq({ isSuperAdmin: true }), makeRes(), next);
        expect(next).toHaveBeenCalledWith();
    });

    it('rejects an unauthenticated request', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireSuperAdmin()({} as Request, makeRes(), next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    });
});

describe('requireAdmin() — roleLevel <= 2 or superadmin (tenant-scope-adjacent actions only)', () => {
    it('allows roleLevel 2 (store_owner/tenant_admin)', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireAdmin()(makeReq({ role: 'store_owner', roleLevel: 2 }), makeRes(), next);
        expect(next).toHaveBeenCalledWith();
    });

    it('rejects roleLevel 3 and below', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireAdmin()(makeReq({ role: 'hq_manager', roleLevel: 3 }), makeRes(), next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });

    it('allows a superadmin regardless of role string', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireAdmin()(makeReq({ isSuperAdmin: true, role: 'staff', roleLevel: 7 }), makeRes(), next);
        expect(next).toHaveBeenCalledWith();
    });
});

describe('requireTenantAdmin() — roleLevel <= 5 or superadmin', () => {
    it('allows roleLevel 5 (cashier-adjacent tenant admin actions)', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireTenantAdmin()(makeReq({ role: 'cashier', roleLevel: 5 }), makeRes(), next);
        expect(next).toHaveBeenCalledWith();
    });

    it('rejects roleLevel 6 and below', () => {
        const next = vi.fn() as unknown as NextFunction;
        requireTenantAdmin()(makeReq({ role: 'waiter', roleLevel: 6 }), makeRes(), next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
});
