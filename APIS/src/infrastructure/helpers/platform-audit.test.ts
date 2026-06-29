import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the DB before importing the module under test
vi.mock('@/config/database.config', () => ({
    db: {
        insert: vi.fn().mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
        }),
    },
}));

import { writePlatformAuditLog } from './platform-audit.helper';
import { db } from '@/config/database.config';

describe('writePlatformAuditLog (SEC-08)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset mock to resolve
        (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
            values: vi.fn().mockResolvedValue(undefined),
        });
    });

    it('inserts a record with correct fields', async () => {
        await writePlatformAuditLog({
            actorId: 'admin-1',
            action: 'TENANT_CREATED',
            tenantId: 'tenant-abc',
            metadata: { plan: 'pro' },
        });
        expect(db.insert).toHaveBeenCalledTimes(1);
        const valuesMock = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value.values;
        expect(valuesMock).toHaveBeenCalledWith(
            expect.objectContaining({
                actorId: 'admin-1',
                action: 'TENANT_CREATED',
                tenantId: 'tenant-abc',
                metadata: { plan: 'pro' },
            }),
        );
    });

    it('defaults tenantId to null when not provided', async () => {
        await writePlatformAuditLog({ actorId: 'admin-1', action: 'CONFIG_CHANGE' });
        const valuesMock = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value.values;
        expect(valuesMock).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: null }),
        );
    });

    it('defaults metadata to {} when not provided', async () => {
        await writePlatformAuditLog({ actorId: 'admin-1', action: 'CONFIG_CHANGE' });
        const valuesMock = (db.insert as ReturnType<typeof vi.fn>).mock.results[0].value.values;
        expect(valuesMock).toHaveBeenCalledWith(
            expect.objectContaining({ metadata: {} }),
        );
    });

    it('never throws when the DB insert fails', async () => {
        (db.insert as ReturnType<typeof vi.fn>).mockReturnValue({
            values: vi.fn().mockRejectedValue(new Error('DB connection lost')),
        });
        await expect(
            writePlatformAuditLog({ actorId: 'admin-1', action: 'TENANT_CREATED' }),
        ).resolves.toBeUndefined();
    });

    it('never throws when db.insert itself throws synchronously', async () => {
        (db.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
            throw new Error('unexpected sync error');
        });
        await expect(
            writePlatformAuditLog({ actorId: 'admin-1', action: 'TENANT_CREATED' }),
        ).resolves.toBeUndefined();
    });
});
