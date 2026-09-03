import { describe, expect, it } from 'vitest';
import { hasPayrollScopeAccess } from './payroll-scope';

describe('payroll assignment scope', () => {
    it('allows a whole-store owner across branches in the assigned store', () => {
        const owner = { accessibleStores: [{ storeId: 'store-a', branchId: null, canRead: true, canWrite: true, canManage: true }] };
        expect(hasPayrollScopeAccess(owner, { storeId: 'store-a', branchId: 'branch-a1' }, 'manage')).toBe(true);
        expect(hasPayrollScopeAccess(owner, { storeId: 'store-a', branchId: 'branch-a2' }, 'write')).toBe(true);
    });

    it('restricts branch accounting to the explicitly assigned branch', () => {
        const accountant = { accessibleStores: [{ storeId: 'store-a', branchId: 'branch-a1', canRead: true, canWrite: true, canManage: true }] };
        expect(hasPayrollScopeAccess(accountant, { storeId: 'store-a', branchId: 'branch-a1' }, 'manage')).toBe(true);
        expect(hasPayrollScopeAccess(accountant, { storeId: 'store-a', branchId: 'branch-a2' }, 'read')).toBe(false);
    });

    it('denies another store or franchise even inside the same tenant', () => {
        const accountant = { accessibleStores: [{ storeId: 'store-a', branchId: null, canRead: true, canWrite: true, canManage: true }] };
        expect(hasPayrollScopeAccess(accountant, { storeId: 'franchise-b', branchId: 'branch-b1' }, 'read')).toBe(false);
        expect(hasPayrollScopeAccess(accountant, { storeId: 'store-c', branchId: null }, 'manage')).toBe(false);
    });

    it('requires canManage for approval and payment scope', () => {
        const preparer = { accessibleStores: [{ storeId: 'store-a', branchId: null, canRead: true, canWrite: true, canManage: false }] };
        expect(hasPayrollScopeAccess(preparer, { storeId: 'store-a', branchId: 'branch-a1' }, 'write')).toBe(true);
        expect(hasPayrollScopeAccess(preparer, { storeId: 'store-a', branchId: 'branch-a1' }, 'manage')).toBe(false);
    });

    it('keeps the superadmin bypass for platform setup', () => {
        expect(hasPayrollScopeAccess({ isSuperAdmin: true }, { storeId: 'any-store', branchId: 'any-branch' }, 'manage')).toBe(true);
    });
});
