export type PayrollScopeAccess = 'read' | 'write' | 'manage';

export interface PayrollStoreGrant {
    storeId: string;
    branchId?: string | null;
    canRead?: boolean;
    canWrite?: boolean;
    canManage?: boolean;
}

export interface PayrollScopeIdentity {
    isSuperAdmin?: boolean;
    accessibleStores?: PayrollStoreGrant[];
}

export function payrollGrants(identity: PayrollScopeIdentity | undefined, access: PayrollScopeAccess = 'read'): PayrollStoreGrant[] {
    const grants = Array.isArray(identity?.accessibleStores) ? identity.accessibleStores : [];
    return grants.filter(grant => {
        if (access === 'read') return grant.canRead !== false;
        if (access === 'write') return grant.canWrite === true || grant.canManage === true;
        return grant.canManage === true;
    });
}

export function hasPayrollScopeAccess(
    identity: PayrollScopeIdentity | undefined,
    scope: { storeId: string | null; branchId?: string | null; id?: string },
    access: PayrollScopeAccess = 'read',
): boolean {
    if (identity?.isSuperAdmin) return true;
    if (!scope.storeId) return false;
    const scopeBranchId = scope.branchId ?? scope.id ?? null;
    return payrollGrants(identity, access).some(grant =>
        grant.storeId === scope.storeId
        && (grant.branchId == null || (scopeBranchId !== null && grant.branchId === scopeBranchId)),
    );
}
