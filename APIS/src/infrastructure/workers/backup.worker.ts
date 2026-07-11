// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Scheduled Backup Worker
// Runs a full DB export at a configurable schedule and stores the JSON
// backup to the filesystem (./backups/) keyed by timestamp.
// ═══════════════════════════════════════════════════════════════════════════

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { db } from '@/config/database.config';
import { settings } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';
import * as tables from '@/db/schema/tables';
import { getRedisClient } from '@/config/redis.config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../../backups');

let currentTask: ReturnType<typeof cron.schedule> | null = null;
let currentSchedule = '';

// Scaling audit (2026-07-11): startScheduledJobs() runs in every API process
// with no coordination, so with N horizontally-scaled instances the backup
// cron fires N times concurrently. A Redis SET-NX-with-expiry lock ensures
// only one instance actually runs it per scheduled tick. TTL is a safety net
// so a crashed instance can't permanently block future backups; the token
// check on release prevents releasing a lock a *different* instance has
// since acquired (e.g. after this instance's lock already expired).
const BACKUP_LOCK_KEY = 'kpos:backup-lock';
const BACKUP_LOCK_TTL_MS = 5 * 60 * 1000; // generous vs. typical backup duration

const NO_REDIS_TOKEN = '__no-redis__';
const REDIS_ERROR_TOKEN = '__redis-error__';

export async function acquireBackupLock(): Promise<string | null> {
    const client = getRedisClient();
    if (!client) return NO_REDIS_TOKEN; // no Redis configured — assume single instance, run unconditionally
    const token = randomUUID();
    try {
        const result = await client.set(BACKUP_LOCK_KEY, token, 'PX', BACKUP_LOCK_TTL_MS, 'NX');
        return result === 'OK' ? token : null;
    } catch {
        // Redis error acquiring the lock — fail open (run the backup) rather
        // than risk silently never backing up again; a duplicate run here is
        // wasteful, not dangerous, unlike the revocation/rate-limit cases.
        return REDIS_ERROR_TOKEN;
    }
}

export async function releaseBackupLock(token: string): Promise<void> {
    if (token === NO_REDIS_TOKEN || token === REDIS_ERROR_TOKEN) return;
    const client = getRedisClient();
    if (!client) return;
    try {
        const current = await client.get(BACKUP_LOCK_KEY);
        if (current === token) await client.del(BACKUP_LOCK_KEY);
    } catch {
        // Ignore — the TTL will clean it up regardless.
    }
}

export async function runBackup(tenantId?: string): Promise<string> {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `kpos-backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    const [
        branchRows, storeRows, userRows, roleRows, ruleRows, roleRuleRows,
        categoryRows, productRows, inventoryRows, customerRows, memberRows,
        transactionRows, transactionItemRows, settingRows,
    ] = await Promise.all([
        db.select().from(tables.branches),
        db.select().from(tables.stores),
        db.select({ id: tables.users.id, email: tables.users.email, name: tables.users.name, role: tables.users.role, branchId: tables.users.branchId, isActive: tables.users.isActive }).from(tables.users),
        db.select().from(tables.roles),
        db.select().from(tables.rules),
        db.select().from(tables.roleRules),
        db.select().from(tables.categories),
        db.select().from(tables.products),
        db.select().from(tables.inventory),
        db.select().from(tables.customers),
        db.select().from(tables.members),
        db.select().from(tables.transactions),
        db.select().from(tables.transactionItems),
        db.select().from(tables.settings),
    ]);

    const backup = {
        version: 2,
        exportedAt: new Date().toISOString(),
        tenantId: tenantId || null,
        data: {
            branches: branchRows, stores: storeRows, users: userRows,
            roles: roleRows, rules: ruleRows, roleRules: roleRuleRows,
            categories: categoryRows, products: productRows, inventory: inventoryRows,
            customers: customerRows, members: memberRows,
            transactions: transactionRows, transactionItems: transactionItemRows,
            settings: settingRows,
        },
    };

    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf-8');
    console.log(`[Backup] Saved: ${filepath}`);
    return filepath;
}

async function getScheduleFromDB(): Promise<string> {
    try {
        const row = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'backup'), eq(settings.key, 'schedule')),
        });
        if (!row?.value) return '';
        const val = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
        return val.replace(/^"|"$/g, '');
    } catch { return ''; }
}

export async function startBackupScheduler(): Promise<void> {
    const schedule = await getScheduleFromDB();
    if (!schedule || !cron.validate(schedule)) {
        console.log('[Backup] No valid schedule configured — auto-backup disabled');
        return;
    }
    if (schedule === currentSchedule) return; // already running same schedule
    if (currentTask) { currentTask.stop(); currentTask = null; }

    currentSchedule = schedule;
    currentTask = cron.schedule(schedule, async () => {
        const lockToken = await acquireBackupLock();
        if (!lockToken) {
            console.log('[Backup] Skipped — another instance already running the scheduled backup');
            return;
        }
        console.log('[Backup] Starting scheduled backup...');
        try {
            await runBackup();
        } catch (err) {
            console.error('[Backup] Scheduled backup failed:', err instanceof Error ? err.message : err);
        } finally {
            await releaseBackupLock(lockToken);
        }
    }, { timezone: process.env.TZ || 'Asia/Vientiane' });

    console.log(`[Backup] Scheduler started: "${schedule}"`);
}

export function stopBackupScheduler(): void {
    if (currentTask) { currentTask.stop(); currentTask = null; currentSchedule = ''; }
}

export async function reloadBackupSchedule(): Promise<void> {
    await startBackupScheduler();
}
