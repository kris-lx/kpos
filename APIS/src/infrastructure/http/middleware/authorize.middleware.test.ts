import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authorize, ensureScopeAccess } from './auth.middleware';
import { permissionsToMask, maskToStrings } from '@/infrastructure/permissions';

// Minimal req/res/next stubs
function makeReq(overrides: Partial<{
    isSuperAdmin: boolean;
    permissions: string[];
    maskLow: string;
    maskHigh: string;
}>): Request {
    const { isSuperAdmin = false, permissions = [], maskLow = '0', maskHigh = '0' } = overrides;
    return {
        user: { userId: 'u1', email: 'x@x.com', role: 'cashier', branchId: 'b1', tenantId: 't1' },
        authUser: {
            userId: 'u1', email: 'x@x.com', role: 'cashier',
            branchId: 'b1', tenantId: 't1',
            permissions,
            isSuperAdmin,
            maskLow,
            maskHigh,
            roleLevel: 5,
            accessibleStores: [], accessibleBranchIds: [],
            accessibleBranchPaths: [], accessibleStoreIds: [],
            activeStoreId: undefined, activeBranchId: 'b1', activeBranchPath: undefined,
        },
    } as unknown as Request;
}

function makeRes(): Response {
    return {} as Response;
}

describe('authorize()', () => {
    describe('super admin bypass', () => {
        it('always calls next() regardless of required perms', () => {
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:create');
            mw(makeReq({ isSuperAdmin: true, maskLow: '0' }), makeRes(), next);
            expect(next).toHaveBeenCalledWith(); // called with no error
        });
    });

    describe('bitmask path', () => {
        it('grants access when bitmask contains required permission', () => {
            const mask = maskToStrings(permissionsToMask(['sales:create']));
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:create');
            mw(makeReq({ maskLow: mask.low, maskHigh: mask.high }), makeRes(), next);
            expect(next).toHaveBeenCalledWith();
        });

        it('denies access when bitmask lacks required permission', () => {
            const mask = maskToStrings(permissionsToMask(['products:view']));
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:create');
            mw(makeReq({ maskLow: mask.low, maskHigh: mask.high }), makeRes(), next);
            // next is called with an ApiError (forbidden)
            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        });

        it('grants access when any of multiple required perms matches', () => {
            const mask = maskToStrings(permissionsToMask(['reports:view']));
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:create', 'reports:view');
            mw(makeReq({ maskLow: mask.low, maskHigh: mask.high }), makeRes(), next);
            expect(next).toHaveBeenCalledWith();
        });
    });

    describe('string-array fallback (no bitmask)', () => {
        it('grants access when permission string is in permissions array', () => {
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:create');
            mw(makeReq({ permissions: ['sales:create'] }), makeRes(), next);
            expect(next).toHaveBeenCalledWith();
        });

        it('grants access for wildcard *', () => {
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:void');
            mw(makeReq({ permissions: ['*'] }), makeRes(), next);
            expect(next).toHaveBeenCalledWith();
        });

        it('accepts :read as alias for :view', () => {
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:view');
            mw(makeReq({ permissions: ['sales:read'] }), makeRes(), next);
            expect(next).toHaveBeenCalledWith();
        });

        it('accepts :view as alias for :read', () => {
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:read');
            mw(makeReq({ permissions: ['sales:view'] }), makeRes(), next);
            expect(next).toHaveBeenCalledWith();
        });

        it('denies when permission string is absent', () => {
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('staff:delete');
            mw(makeReq({ permissions: ['sales:create'] }), makeRes(), next);
            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
        });
    });

    describe('unauthenticated request', () => {
        it('passes an unauthorized error to next when req.user is missing', () => {
            const next = vi.fn() as unknown as NextFunction;
            const mw = authorize('sales:create');
            mw({ authUser: undefined, user: undefined } as unknown as Request, makeRes(), next);
            expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
        });
    });
});

describe('ensureScopeAccess()', () => {
    it('allows super admins to access any scoped record', () => {
        const req = makeReq({ isSuperAdmin: true });
        expect(ensureScopeAccess({ tenantId: 'other-tenant', branchId: 'b9', storeId: 's9' }, req)).toBe(true);
    });

    it('blocks tenant admins from records in another tenant', () => {
        const req = makeReq({ permissions: ['*'] });
        expect(ensureScopeAccess({ tenantId: 'other-tenant' }, req)).toBe(false);
    });

    it('allows tenant admins inside their own tenant', () => {
        const req = makeReq({ permissions: ['*'] });
        expect(ensureScopeAccess({ tenantId: 't1', branchId: 'b9', storeId: 's9' }, req)).toBe(true);
    });

    it('allows branch/store users only for explicitly accessible stores', () => {
        const req = makeReq({ permissions: ['sales:view'] }) as any;
        req.authUser.role = 'staff';
        req.authUser.roleLevel = 5;
        req.authUser.accessibleStoreIds = ['s1'];
        req.authUser.accessibleBranchIds = ['b1'];

        expect(ensureScopeAccess({ tenantId: 't1', storeId: 's1' }, req)).toBe(true);
        expect(ensureScopeAccess({ tenantId: 't1', storeId: 's2' }, req)).toBe(false);
    });

    it('falls back to branch access when no store is present', () => {
        const req = makeReq({ permissions: ['sales:view'] }) as any;
        req.authUser.role = 'staff';
        req.authUser.roleLevel = 5;
        req.authUser.accessibleStoreIds = [];
        req.authUser.accessibleBranchIds = ['b1'];

        expect(ensureScopeAccess({ tenantId: 't1', branchId: 'b1' }, req)).toBe(true);
        expect(ensureScopeAccess({ tenantId: 't1', branchId: 'b2' }, req)).toBe(false);
    });
});
