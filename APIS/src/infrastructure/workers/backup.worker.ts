// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Scheduled Backup Worker
// Runs a full DB export at a configurable schedule and stores the JSON
// backup to the filesystem (./backups/) keyed by timestamp.
// ═══════════════════════════════════════════════════════════════════════════

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '@/config/database.config';
import { settings } from '@/db/schema/tables';
import { eq, and, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import * as tables from '@/db/schema/tables';
import { acquireLock, releaseLock } from '@/shared/distributed-lock';
import { setRequestContext, setSuperAdminBypassContext } from '@/db/set-tenant-context';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../../backups');

let currentTask: ReturnType<typeof cron.schedule> | null = null;
let currentSchedule = '';

// Scaling audit (2026-07-11): startScheduledJobs() runs in every API process
// with no coordination, so with N horizontally-scaled instances the backup
// cron fires N times concurrently. A Redis-backed lock (see
// shared/distributed-lock.ts) ensures only one instance actually runs it per
// scheduled tick.
const BACKUP_LOCK_KEY = 'kpos:backup-lock';
const BACKUP_LOCK_TTL_MS = 5 * 60 * 1000; // generous vs. typical backup duration

export async function acquireBackupLock(): Promise<string | null> {
    return acquireLock(BACKUP_LOCK_KEY, BACKUP_LOCK_TTL_MS);
}

export async function releaseBackupLock(token: string): Promise<void> {
    return releaseLock(BACKUP_LOCK_KEY, token);
}

export async function runBackup(tenantId?: string): Promise<string> {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `kpos-backup-${timestamp}.json`;
    const filepath = path.join(BACKUP_DIR, filename);

    // tenantId undefined = full-platform backup (only the unattended cron job
    // and superadmin's manual trigger should ever reach this with no scope —
    // see the tenant/superadmin split enforced at the route in
    // settings/presentation/routes.ts POST /backup/run). Every ordinary
    // tenant-admin-triggered backup MUST filter by tenantId — previously this
    // ran completely unfiltered regardless of caller, dumping every tenant's
    // branches/users/customers/transactions into one file any tenant admin
    // with `settings:update` could trigger.
    //
    // The app-layer WHERE filter alone isn't enough: this runs on the plain
    // pooled `db` (kpos_app role, FORCE ROW LEVEL SECURITY, no BYPASSRLS),
    // so without the matching RLS GUC set on the connection, RLS's own
    // deny-by-default silently drops tenant-owned rows regardless of what
    // the WHERE clause asks for — same class of bug fixed elsewhere this
    // session (drizzle/0020). Run the whole export inside a transaction with
    // the RLS context explicitly set: tenant-scoped for ordinary backups,
    // app.bypass_rls for the full-platform case.
    const scope = (col: PgColumn): SQL | undefined =>
        tenantId ? eq(col, tenantId) : undefined;

    const [
        branchRows, storeRows, userRows, roleRows, ruleRows, roleRuleRows,
        categoryRows, productRows, inventoryRows, customerRows, memberRows,
        transactionRows, transactionItemRows, settingRows,
    ] = await db.transaction(async (tx) => {
        if (tenantId) {
            await setRequestContext(tx, { tenantId }, { local: true });
        } else {
            await setSuperAdminBypassContext(tx, { local: true });
        }
        return Promise.all([
            tx.select().from(tables.branches).where(scope(tables.branches.tenantId)),
            tx.select().from(tables.stores).where(scope(tables.stores.tenantId)),
            tx.select({ id: tables.users.id, email: tables.users.email, name: tables.users.name, role: tables.users.role, branchId: tables.users.branchId, isActive: tables.users.isActive }).from(tables.users).where(scope(tables.users.tenantId)),
            tx.select().from(tables.roles).where(scope(tables.roles.tenantId)),
            tx.select().from(tables.rules).where(scope(tables.rules.tenantId)),
            tx.select().from(tables.roleRules).where(scope(tables.roleRules.tenantId)),
            tx.select().from(tables.categories).where(scope(tables.categories.tenantId)),
            tx.select().from(tables.products).where(scope(tables.products.tenantId)),
            tx.select().from(tables.inventory).where(scope(tables.inventory.tenantId)),
            tx.select().from(tables.customers).where(scope(tables.customers.tenantId)),
            tx.select().from(tables.members).where(scope(tables.members.tenantId)),
            tx.select().from(tables.transactions).where(scope(tables.transactions.tenantId)),
            tx.select().from(tables.transactionItems).where(scope(tables.transactionItems.tenantId)),
            tx.select().from(tables.settings).where(scope(tables.settings.tenantId)),
        ]);
    });

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

    // Some numeric columns (e.g. large counters) come back as native BigInt
    // from postgres.js, which JSON.stringify can't serialize by default.
    fs.writeFileSync(filepath, JSON.stringify(backup, (_key, value) => typeof value === 'bigint' ? value.toString() : value, 2), 'utf-8');
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
