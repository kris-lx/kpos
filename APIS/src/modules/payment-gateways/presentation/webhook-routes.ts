// ═══════════════════════════════════════════════════════════════════════════
// Payment Gateways Module - Webhook Routes (public, no auth)
//
// SwiftPass posts an async XML notification to notify_url after payment
// (Alipay spec §6.2, WeChat spec §6.2). There is no bearer token or tenant
// header on this request — the tenant/config is resolved from the notify
// body's own mch_id, and the signature itself is the authenticity check.
// Per spec: reply with the bare string "success", or SwiftPass will keep
// retrying with backoff (0/15/15/30/180/1800/1800/1800/1800/3600s).
//
// JDB has no HTTP webhook (their real-time channel is PubNub) — JDB payment
// confirmation is handled entirely by the polling fallback in routes.ts.
// ═══════════════════════════════════════════════════════════════════════════

import express, { Router, type Request, type Response } from 'express';
import { db } from '@/config/database.config';
import { paymentGatewayConfigs, qrPaymentRequests } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';
import { decryptJson } from '@/shared/crypto';
import type { SwiftPassConfig } from '../domain/types';
import { verifySwiftPassNotify } from '../infrastructure/gateways/swiftpass.client';

export const paymentGatewayWebhookRoutes = Router();

// SwiftPass sends `Content-Type: text/xml`, which the app-wide express.json()
// middleware (server.ts) skips — capture the raw XML body as a string here.
paymentGatewayWebhookRoutes.use(express.text({ type: () => true }));

async function handleSwiftPassNotify(provider: 'swiftpass_alipay' | 'swiftpass_wechat', req: Request, res: Response) {
    try {
        const xml = typeof req.body === 'string' ? req.body : '';
        if (!xml) return res.status(400).send('fail');

        // mch_id is present but unsigned metadata — used only to look up which
        // tenant's config to verify against, not trusted on its own.
        const mchIdMatch = /<mch_id>(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))<\/mch_id>/.exec(xml);
        const mchId = mchIdMatch?.[1] ?? mchIdMatch?.[2];
        if (!mchId) return res.status(400).send('fail');

        const configRows = await db.query.paymentGatewayConfigs.findMany({
            where: and(eq(paymentGatewayConfigs.provider, provider), eq(paymentGatewayConfigs.isActive, true)),
        });
        const matched = configRows
            .map((row) => ({ row, config: decryptJson(row.config as unknown as string) as SwiftPassConfig }))
            .find(({ config }) => config.mchId === mchId);
        if (!matched) return res.status(404).send('fail');

        const { valid, fields } = verifySwiftPassNotify(xml, matched.config);
        if (!valid) return res.status(400).send('fail');

        if (fields.pay_result === '0' || fields.result_code === '0') {
            const outTradeNo = fields.out_trade_no;
            const request = await db.query.qrPaymentRequests.findFirst({
                where: and(eq(qrPaymentRequests.tenantId, matched.row.tenantId), eq(qrPaymentRequests.outTradeNo, outTradeNo)),
            });
            if (request && request.status === 'pending') {
                await db.update(qrPaymentRequests).set({
                    status: 'paid',
                    gatewayRef: fields.transaction_id || fields.out_transaction_id,
                    confirmedAt: new Date(),
                }).where(eq(qrPaymentRequests.id, request.id));
            }
        }

        res.status(200).send('success');
    } catch {
        res.status(500).send('fail');
    }
}

paymentGatewayWebhookRoutes.post('/swiftpass/alipay/notify', (req, res) => handleSwiftPassNotify('swiftpass_alipay', req, res));
paymentGatewayWebhookRoutes.post('/swiftpass/wechat/notify', (req, res) => handleSwiftPassNotify('swiftpass_wechat', req, res));
