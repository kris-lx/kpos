// ═══════════════════════════════════════════════════════════════════════════
// Regression test for the scaling-audit backup-cron fix: startScheduledJobs()
// runs in every API process with no coordination, so with N horizontally-
// scaled instances the backup cron used to fire N times concurrently. A
// Redis SET-NX-with-expiry lock (acquireBackupLock/releaseBackupLock) ensures
// only one instance actually runs it per scheduled tick.
//
// Requires a real, reachable Redis — same rationale as rls.test.ts: the rest
// of this suite intentionally runs Redis/DB-free (test-setup.ts's fake
// DATABASE_URL), and redis.config.ts's REDIS_URL defaults to
// localhost:6379, which would silently hit a real Redis in any environment
// that happens to have one reachable (including CI, if it ever gets a Redis
// service) unless explicitly gated. Skips gracefully when unset.
//
// Run locally against the dev stack with:
//   BACKUP_LOCK_TEST_REDIS=1 npx vitest run src/infrastructure/workers/backup-lock.test.ts
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect, beforeEach, afterAll } from 'vitest';

const ENABLED = process.env.BACKUP_LOCK_TEST_REDIS === '1';

describe.skipIf(!ENABLED)('backup cron distributed lock (live Redis)', () => {
    // Imported lazily inside the describe block so module-level Redis client
    // construction only happens when this suite actually runs.
    let acquireBackupLock: typeof import('./backup.worker').acquireBackupLock;
    let releaseBackupLock: typeof import('./backup.worker').releaseBackupLock;
    let getRedisClient: typeof import('@/config/redis.config').getRedisClient;

    beforeEach(async () => {
        ({ acquireBackupLock, releaseBackupLock } = await import('./backup.worker'));
        ({ getRedisClient } = await import('@/config/redis.config'));
        const client = getRedisClient();
        await client?.del('kpos:backup-lock');
    });

    afterAll(async () => {
        const client = getRedisClient();
        await client?.del('kpos:backup-lock');
    });

    it('grants the lock to exactly one of several simultaneous racers', async () => {
        const results = await Promise.all([acquireBackupLock(), acquireBackupLock(), acquireBackupLock()]);
        const winners = results.filter((token) => token !== null);
        expect(winners.length).toBe(1);
    });

    it('a stale release (mismatched token) does not delete a lock a different instance now holds', async () => {
        const first = await acquireBackupLock();
        expect(first).not.toBeNull();

        // Simulate: instance's lock already expired and a different instance
        // acquired a fresh one — releasing with the stale token must not
        // touch the new lock.
        const client = getRedisClient()!;
        await client.del('kpos:backup-lock');
        const otherInstanceToken = await acquireBackupLock();
        expect(otherInstanceToken).not.toBeNull();

        await releaseBackupLock(first as string);
        const stillHeld = await client.get('kpos:backup-lock');
        expect(stillHeld).toBe(otherInstanceToken);
    });

    it('releasing with the correct token frees the lock for the next acquirer', async () => {
        const token = await acquireBackupLock();
        expect(token).not.toBeNull();
        await releaseBackupLock(token as string);

        const next = await acquireBackupLock();
        expect(next).not.toBeNull();
    });
});
