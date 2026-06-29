// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Web Push Service (VAPID)
// ═══════════════════════════════════════════════════════════════════════════

import webpush from 'web-push';
import { db } from '@/config/database.config';
import { pushSubscriptions } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@kpos.local';

let vapidConfigured = false;

function ensureVapid() {
    if (vapidConfigured) return;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        console.warn('[WebPush] VAPID keys not configured — push disabled');
        return;
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
}

export interface PushPayload {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    tag?: string;
    data?: Record<string, unknown>;
}

class WebPushService {
    getPublicKey(): string {
        return VAPID_PUBLIC_KEY;
    }

    isEnabled(): boolean {
        return !!VAPID_PUBLIC_KEY && !!VAPID_PRIVATE_KEY;
    }

    async subscribe(userId: string, tenantId: string | null, subscription: { endpoint: string; keys: { p256dh: string; auth: string } }, userAgent?: string): Promise<void> {
        // Upsert by endpoint
        const existing = await db.query.pushSubscriptions.findFirst({
            where: eq(pushSubscriptions.endpoint, subscription.endpoint),
        });
        if (existing) {
            await db.update(pushSubscriptions)
                .set({ userId, tenantId, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth, userAgent: userAgent ?? null })
                .where(eq(pushSubscriptions.id, existing.id));
        } else {
            await db.insert(pushSubscriptions).values({
                userId,
                tenantId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
                userAgent: userAgent ?? null,
            });
        }
    }

    async unsubscribe(userId: string, endpoint: string): Promise<void> {
        await db.delete(pushSubscriptions).where(
            and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))
        );
    }

    async unsubscribeAll(userId: string): Promise<void> {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
    }

    async sendToUser(userId: string, payload: PushPayload): Promise<void> {
        ensureVapid();
        if (!vapidConfigured) return;
        const subs = await db.query.pushSubscriptions.findMany({
            where: eq(pushSubscriptions.userId, userId),
        });
        await this._sendToSubs(subs, payload);
    }

    async sendToTenant(tenantId: string, payload: PushPayload): Promise<void> {
        ensureVapid();
        if (!vapidConfigured) return;
        const subs = await db.query.pushSubscriptions.findMany({
            where: eq(pushSubscriptions.tenantId, tenantId),
        });
        await this._sendToSubs(subs, payload);
    }

    private async _sendToSubs(subs: typeof pushSubscriptions.$inferSelect[], payload: PushPayload): Promise<void> {
        const stale: string[] = [];
        await Promise.allSettled(subs.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                    JSON.stringify(payload),
                    { TTL: 86400 }
                );
            } catch (err: any) {
                // 410 Gone = subscription expired/revoked
                if (err?.statusCode === 410 || err?.statusCode === 404) {
                    stale.push(sub.id);
                } else {
                    console.error('[WebPush] Send error:', err?.message);
                }
            }
        }));
        // Clean up expired subscriptions
        if (stale.length > 0) {
            await Promise.all(stale.map(id => db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id))));
        }
    }
}

export const webPushService = new WebPushService();
