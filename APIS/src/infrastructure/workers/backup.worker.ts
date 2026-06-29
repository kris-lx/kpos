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
import { eq, and } from 'drizzle-orm';
import * as tables from '@/db/schema/tables';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../../backups');

let currentTask: ReturnType<typeof cron.schedule> | null = null;
let currentSchedule = '';

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
        console.log('[Backup] Starting scheduled backup...');
        try {
            await runBackup();
        } catch (err) {
            console.error('[Backup] Scheduled backup failed:', err instanceof Error ? err.message : err);
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
