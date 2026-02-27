// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Shared Domain Errors
// ═══════════════════════════════════════════════════════════════════════════

export class DatabaseConnectionError extends Error {
    constructor(message = 'Database is not available') {
        super(message);
        this.name = 'DatabaseConnectionError';
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
