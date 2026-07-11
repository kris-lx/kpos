// ═══════════════════════════════════════════════════════════════════════════
// Payment Gateways Module - Routes (authenticated)
//
// Per-tenant SwiftPass Alipay/WeChat + JDB Yes Pay merchant credentials, and
// dynamic QR payment requests for POS checkout. Status is resolved by polling
// (throttled server-side) rather than depending on gateway webhooks/PubNub,
// since none of the three providers guarantee delivery.
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { randomUUID } from 'crypto';
import { authenticate, authorize } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { paymentGatewayConfigs, qrPaymentRequests } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';
import { encryptJson, decryptJson } from '@/shared/crypto';
import { appConfig, emailConfig } from '@/config/app.config';
import { GATEWAY_PROVIDERS, type GatewayProvider, type SwiftPassConfig, type JdbYesPayConfig } from '../domain/types';
import { createSwiftPassOrder } from '../infrastructure/gateways/swiftpass.client';
import { generateQr, checkTransaction } from '../infrastructure/gateways/jdb-yespay.client';

export const paymentGatewayRoutes = Router();

const STATUS_REFRESH_THROTTLE_MS = 5000;
const QR_TTL_MS = 5 * 60 * 1000; // 5 minutes — matches JDB's documented pay_info/emv validity window

function maskConfig(row: typeof paymentGatewayConfigs.$inferSelect) {
    return {
        id: row.id,
        provider: row.provider,
        isActive: row.isActive,
        environment: row.environment,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// ── Gateway config CRUD ─────────────────────────────────────────────────────

paymentGatewayRoutes.get('/configs', authenticate, withTenantTx(), authorize('settings:read'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const rows = await db.query.paymentGatewayConfigs.findMany({ where: eq(paymentGatewayConfigs.tenantId, tenantId) });
        res.json({ success: true, data: rows.map(maskConfig) });
    } catch (error) {
        next(error);
    }
});

paymentGatewayRoutes.put('/configs/:provider', authenticate, withTenantTx(), authorize('settings:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const provider = req.params.provider as GatewayProvider;
        if (!GATEWAY_PROVIDERS.includes(provider)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'Invalid provider' } });
        }
        const { config, isActive, environment } = req.body;

        const existing = await db.query.paymentGatewayConfigs.findFirst({
            where: and(eq(paymentGatewayConfigs.tenantId, tenantId), eq(paymentGatewayConfigs.provider, provider)),
        });
        // config is only required when creating a new row, or replacing an existing one —
        // omit it (e.g. when just flipping isActive) to keep the currently stored secrets.
        if (!config && !existing) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_002', message: 'config is required' } });
        }

        const values = {
            config: config ? encryptJson(config) : existing!.config,
            isActive: isActive ?? existing?.isActive ?? false,
            environment: environment ?? existing?.environment ?? 'sandbox',
            updatedAt: new Date(),
        };

        const [row] = existing
            ? await db.update(paymentGatewayConfigs).set(values).where(eq(paymentGatewayConfigs.id, existing.id)).returning()
            : await db.insert(paymentGatewayConfigs).values({ tenantId, provider, ...values }).returning();

        res.json({ success: true, data: maskConfig(row) });
    } catch (error) {
        next(error);
    }
});

// ── QR payment lifecycle ────────────────────────────────────────────────────

async function loadActiveConfig(tenantId: string, provider: GatewayProvider) {
    // Standalone helper (no req/req.tx access) — already explicitly filtered
    // by tenantId in the WHERE clause below, so globalDb is safe here.
    // eslint-disable-next-line no-restricted-syntax -- standalone helper (no req/req.tx access), tenantId already explicit in the WHERE clause
    const row = await globalDb.query.paymentGatewayConfigs.findFirst({
        where: and(eq(paymentGatewayConfigs.tenantId, tenantId), eq(paymentGatewayConfigs.provider, provider), eq(paymentGatewayConfigs.isActive, true)),
    });
    if (!row) return null;
    return decryptJson(row.config as unknown as string);
}

paymentGatewayRoutes.post('/qr/create', authenticate, withTenantTx(), authorize('sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const { provider, amount, branchId } = req.body as { provider: GatewayProvider; amount: number; branchId?: string };
        if (!GATEWAY_PROVIDERS.includes(provider)) {
            return res.status(400).json({ success: false, error: { code: 'VALIDATION_001', message: 'Invalid provider' } });
        }
        if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be greater than 0' } });
        }
        const effectiveBranchId = branchId || req.authUser!.activeBranchId;

        const config = await loadActiveConfig(tenantId, provider);
        if (!config) {
            return res.status(400).json({ success: false, error: { code: 'GATEWAY_NOT_CONFIGURED', message: 'This payment gateway is not configured or not active' } });
        }

        const outTradeNo = `KP${Date.now()}${randomUUID().slice(0, 6)}`;
        const expiresAt = new Date(Date.now() + QR_TTL_MS);
        let qrPayload: string;
        let gatewayRef: string | undefined;

        if (provider === 'jdb_yespay') {
            const jdbConfig = config as unknown as JdbYesPayConfig;
            const result = await generateQr(jdbConfig, {
                requestId: outTradeNo,
                txnAmount: Math.round(amount),
                billNumber: outTradeNo,
            });
            qrPayload = result.emv;
            gatewayRef = result.mcid;
        } else {
            const swiftConfig = config as unknown as SwiftPassConfig;
            const result = await createSwiftPassOrder(provider, swiftConfig, {
                outTradeNo,
                amountMinorUnits: Math.round(amount * 100),
                body: 'KPOS Sale',
                notifyUrl: `${emailConfig.appUrl}/api/${appConfig.apiVersion}/webhooks/payment-gateways/${provider === 'swiftpass_alipay' ? 'swiftpass/alipay' : 'swiftpass/wechat'}/notify`,
                callbackUrl: emailConfig.appUrl,
                mchCreateIp: req.ip || '127.0.0.1',
            });
            qrPayload = result.payLink;
        }

        const [row] = await db.insert(qrPaymentRequests).values({
            tenantId,
            branchId: effectiveBranchId,
            provider,
            outTradeNo,
            amount,
            qrPayload,
            gatewayRef,
            expiresAt,
        }).returning();

        res.status(201).json({ success: true, data: { id: row.id, qrPayload, status: row.status, expiresAt: row.expiresAt } });
    } catch (error: any) {
        res.status(502).json({ success: false, error: { code: 'GATEWAY_ERROR', message: error?.message || 'Failed to create QR payment' } });
    }
});

paymentGatewayRoutes.get('/qr/:id/status', authenticate, withTenantTx(), authorize('sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const row = await db.query.qrPaymentRequests.findFirst({
            where: and(eq(qrPaymentRequests.id, req.params.id), eq(qrPaymentRequests.tenantId, tenantId)),
        });
        if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'QR payment request not found' } });

        let status = row.status;

        if (status === 'pending' && new Date() > row.expiresAt) {
            status = 'expired';
            await db.update(qrPaymentRequests).set({ status }).where(eq(qrPaymentRequests.id, row.id));
        } else if (status === 'pending' && row.provider === 'jdb_yespay') {
            const stale = !row.lastCheckedAt || Date.now() - row.lastCheckedAt.getTime() > STATUS_REFRESH_THROTTLE_MS;
            if (stale) {
                const config = await loadActiveConfig(tenantId, row.provider as GatewayProvider);
                if (config) {
                    try {
                        const check = await checkTransaction(config as unknown as JdbYesPayConfig, row.outTradeNo);
                        if (check.paid) {
                            status = 'paid';
                            await db.update(qrPaymentRequests).set({ status, gatewayRef: check.refNo, confirmedAt: new Date(), lastCheckedAt: new Date() }).where(eq(qrPaymentRequests.id, row.id));
                        } else {
                            await db.update(qrPaymentRequests).set({ lastCheckedAt: new Date() }).where(eq(qrPaymentRequests.id, row.id));
                        }
                    } catch {
                        // Gateway check failed — keep current status, frontend will retry on next poll.
                    }
                }
            }
        }
        // SwiftPass status transitions to 'paid' via the notify webhook (see webhook-routes.ts);
        // polling here only handles expiry + JDB's checkTransaction fallback.

        res.json({ success: true, data: { id: row.id, status, gatewayRef: row.gatewayRef } });
    } catch (error) {
        next(error);
    }
});

paymentGatewayRoutes.post('/qr/:id/link', authenticate, withTenantTx(), authorize('sales:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        if (!tenantId) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant context required' } });

        const { transactionId } = req.body as { transactionId: string };
        const row = await db.query.qrPaymentRequests.findFirst({
            where: and(eq(qrPaymentRequests.id, req.params.id), eq(qrPaymentRequests.tenantId, tenantId)),
        });
        if (!row) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'QR payment request not found' } });

        await db.update(qrPaymentRequests).set({ saleTransactionId: transactionId }).where(eq(qrPaymentRequests.id, row.id));
        res.json({ success: true, data: { message: 'Linked' } });
    } catch (error) {
        next(error);
    }
});
