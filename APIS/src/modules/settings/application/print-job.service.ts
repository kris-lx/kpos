import net from 'node:net';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { printJobs, settings } from '@/db/schema/tables';
import { runWithTenantContext } from '@/shared/tenant-context';
import { queueActivityLog } from '@/infrastructure/helpers/activity-log.helper';

const MAX_RAW_PAYLOAD_BYTES = 5 * 1024 * 1024;

export function isPrivatePrinterAddress(address: string): boolean {
    const value = address.trim().toLowerCase();
    const family = net.isIP(value);
    if (family === 4) {
        const [a, b] = value.split('.').map(Number);
        return a === 10
            || a === 127
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168);
    }
    if (family === 6) {
        return value === '::1'
            || value.startsWith('fc')
            || value.startsWith('fd')
            || value.startsWith('fe8')
            || value.startsWith('fe9')
            || value.startsWith('fea')
            || value.startsWith('feb');
    }
    return false;
}

export function decodePrintPayload(dataBase64: string): Buffer {
    if (!dataBase64 || !/^[a-z0-9+/]*={0,2}$/i.test(dataBase64)) {
        throw new Error('Invalid printer payload');
    }
    const payload = Buffer.from(dataBase64, 'base64');
    if (payload.length === 0) throw new Error('Printer payload is empty');
    if (payload.length > MAX_RAW_PAYLOAD_BYTES) throw new Error('Printer payload exceeds 5 MB');
    return payload;
}

export async function sendRawPrinterPayload(address: string, port: number, payload: Buffer): Promise<void> {
    if (!isPrivatePrinterAddress(address)) {
        throw new Error('Printer address must be a private LAN IP address');
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Invalid printer port');
    }

    await new Promise<void>((resolve, reject) => {
        const client = net.createConnection({ host: address, port, timeout: 5_000 });
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            client.destroy();
            error ? reject(error) : resolve();
        };
        client.once('connect', () => {
            client.write(payload, (error) => {
                if (error) finish(error);
                else client.end(() => finish());
            });
        });
        client.once('timeout', () => finish(new Error('Printer connection timed out')));
        client.once('error', (error) => finish(error));
    });
}

export async function processPrintJob(jobId: string, tenantId: string): Promise<void> {
    const claimed = await runWithTenantContext(tenantId, async (tx) => {
        const job = await tx.query.printJobs.findFirst({ where: eq(printJobs.id, jobId) });
        if (!job || job.status === 'PRINTED' || job.status === 'PROCESSING') return null;
        if (job.attempts >= job.maxAttempts) {
            await tx.update(printJobs).set({
                status: 'FAILED',
                failedAt: new Date(),
                lastError: 'Maximum print attempts reached',
                updatedAt: new Date(),
            }).where(eq(printJobs.id, job.id));
            throw new Error('Maximum print attempts reached');
        }

        const printerRow = await tx.query.settings.findFirst({
            where: and(eq(settings.id, job.printerSettingId), eq(settings.category, 'printer')),
        });
        const printer = printerRow?.value as any;
        const expectedType = job.documentType === 'receipt' ? 'receipt' : 'label';
        if (!printerRow || printer?.isActive === false || printer?.type !== expectedType) {
            await tx.update(printJobs).set({
                status: 'FAILED',
                failedAt: new Date(),
                lastError: `Active ${expectedType} printer not found`,
                updatedAt: new Date(),
            }).where(eq(printJobs.id, job.id));
            throw new Error(`Active ${expectedType} printer not found`);
        }
        if (printer?.connectionType !== 'network' || !printer?.ipAddress) {
            await tx.update(printJobs).set({
                status: 'FAILED',
                failedAt: new Date(),
                lastError: 'A KPOS Print Agent is required for non-network printers',
                updatedAt: new Date(),
            }).where(eq(printJobs.id, job.id));
            throw new Error('A KPOS Print Agent is required for non-network printers');
        }

        const [locked] = await tx.update(printJobs).set({
            status: 'PROCESSING',
            attempts: sql`${printJobs.attempts} + 1`,
            startedAt: new Date(),
            failedAt: null,
            lastError: null,
            updatedAt: new Date(),
        }).where(and(
            eq(printJobs.id, job.id),
            inArray(printJobs.status, ['QUEUED', 'FAILED']),
        )).returning();
        if (!locked) return null;

        return {
            job: locked,
            address: String(printer.ipAddress),
            port: Number(printer.port) || 9100,
            payload: decodePrintPayload(String((locked.payload as any)?.dataBase64 || '')),
        };
    });

    if (!claimed) return;

    try {
        await sendRawPrinterPayload(claimed.address, claimed.port, claimed.payload);
        await runWithTenantContext(tenantId, async (tx) => {
            await tx.update(printJobs).set({
                status: 'PRINTED',
                printedAt: new Date(),
                failedAt: null,
                lastError: null,
                updatedAt: new Date(),
            }).where(eq(printJobs.id, jobId));
        });
        queueActivityLog(
            claimed.job.requestedBy,
            'print_job_printed',
            'printing',
            `${claimed.job.documentType} print job completed`,
            { jobId, tenantId, branchId: claimed.job.branchId, storeId: claimed.job.storeId, reference: claimed.job.reference },
            { authUser: { tenantId, userId: claimed.job.requestedBy, branchId: claimed.job.branchId, storeId: claimed.job.storeId } } as any,
            { entity: 'print_job', entityId: jobId, newData: { status: 'PRINTED' } },
        ).catch(() => {});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await runWithTenantContext(tenantId, async (tx) => {
            await tx.update(printJobs).set({
                status: 'FAILED',
                failedAt: new Date(),
                lastError: message.slice(0, 1_000),
                updatedAt: new Date(),
            }).where(eq(printJobs.id, jobId));
        });
        queueActivityLog(
            claimed.job.requestedBy,
            'print_job_failed',
            'printing',
            `${claimed.job.documentType} print job failed`,
            { jobId, tenantId, branchId: claimed.job.branchId, storeId: claimed.job.storeId, reference: claimed.job.reference, error: message },
            { authUser: { tenantId, userId: claimed.job.requestedBy, branchId: claimed.job.branchId, storeId: claimed.job.storeId } } as any,
            { entity: 'print_job', entityId: jobId, newData: { status: 'FAILED', error: message } },
        ).catch(() => {});
        throw error;
    }
}
