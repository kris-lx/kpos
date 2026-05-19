// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Shared Domain Errors
// ═══════════════════════════════════════════════════════════════════════════

export class DatabaseConnectionError extends Error {
    constructor(message = 'Database is not available') {
        super(message);
        this.name = 'DatabaseConnectionError';
    }
}

/**
 * Thrown when a query reaches the repository layer without the required tenant
 * scope. This is a defense-in-depth invariant for the multi-tenant model.
 */
export class TenantScopeMissingError extends Error {
    code = 'TENANT_SCOPE_MISSING';
    constructor(operation = 'unknown') {
        super(`Tenant scope is required for operation: ${operation}`);
        this.name = 'TenantScopeMissingError';
    }
}

/**
 * Thrown when a user attempts to access a resource outside their branch_path scope.
 */
export class BranchScopeViolationError extends Error {
    code = 'BRANCH_SCOPE_VIOLATION';
    constructor(resourceBranchPath: string, userBranchPath: string) {
        super(`Resource branch_path '${resourceBranchPath}' is outside user scope '${userBranchPath}'`);
        this.name = 'BranchScopeViolationError';
    }
}

export function isConnectionError(error: unknown): boolean {
    if (error instanceof Error) {
        const msg = error.message.toLowerCase();
        return msg.includes('server selection timeout') ||
            msg.includes('connection refused') ||
            msg.includes('no available servers') ||
            msg.includes('socket not connected') ||
            msg.includes('econnrefused') ||
            msg.includes('replicasetnoprimary');
    }
    return false;
}
