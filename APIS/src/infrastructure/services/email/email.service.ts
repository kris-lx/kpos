// ═══════════════════════════════════════════════════════════════════════════
// EmailService — per-tenant provider resolution + template rendering + send
// Replaces the old hardcoded-Brevo email.service.ts (Phase 11).
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { cache } from '@/config/redis.config';
import { emailProviders, emailTemplates, emailLogs } from '@/db/schema/tables';
import { eq, and, isNull, or, desc } from 'drizzle-orm';
import { decryptJson } from '@/shared/crypto';
import type { IEmailAdapter, EmailProviderType, EmailProviderConfig } from './types';
import { SmtpAdapter } from './smtp.adapter';
import { BrevoAdapter } from './brevo.adapter';
import { SendGridAdapter } from './sendgrid.adapter';
import { MailgunAdapter } from './mailgun.adapter';

const ADAPTER_CACHE_TTL = 30; // seconds

function buildAdapter(type: EmailProviderType, config: EmailProviderConfig): IEmailAdapter {
    switch (type) {
        case 'smtp': return new SmtpAdapter(config as any);
        case 'brevo': return new BrevoAdapter(config as any);
        case 'sendgrid': return new SendGridAdapter(config as any);
        case 'mailgun': return new MailgunAdapter(config as any);
        default: throw new Error(`Unknown email provider type: ${type}`);
    }
}

interface ResolvedProvider {
    id: string;
    type: EmailProviderType;
    config: EmailProviderConfig;
}

async function resolveActiveProvider(tenantId: string): Promise<ResolvedProvider | null> {
    const cacheKey = `kpos:email-provider:${tenantId}`;
    const cached = await cache.get<ResolvedProvider>(cacheKey);
    if (cached) return cached;

    const row = await db.query.emailProviders.findFirst({
        where: and(eq(emailProviders.tenantId, tenantId), eq(emailProviders.isActive, true)),
        orderBy: [desc(emailProviders.isDefault), desc(emailProviders.updatedAt)],
    });
    if (!row) return null;

    const resolved: ResolvedProvider = {
        id: row.id,
        type: row.type as EmailProviderType,
        config: decryptJson<EmailProviderConfig>(row.config as unknown as string),
    };
    await cache.set(cacheKey, resolved, ADAPTER_CACHE_TTL);
    return resolved;
}

export async function invalidateProviderCache(tenantId: string): Promise<void> {
    await cache.del(`kpos:email-provider:${tenantId}`);
}

export async function getActiveAdapter(tenantId: string): Promise<IEmailAdapter | null> {
    const provider = await resolveActiveProvider(tenantId);
    if (!provider) return null;
    return buildAdapter(provider.type, provider.config);
}

// Used by the "Test Connection" endpoint to verify a provider without relying on it being active/default.
export async function testProviderConnection(type: EmailProviderType, config: EmailProviderConfig): Promise<boolean> {
    return buildAdapter(type, config).verify();
}

export async function sendTestEmail(type: EmailProviderType, config: EmailProviderConfig, to: string): Promise<void> {
    const adapter = buildAdapter(type, config);
    await adapter.send([to], 'KPOS Test Email', '<p>This is a test email from your KPOS email provider configuration.</p>');
}

// Minimal {{var}} interpolation — deliberately not a full template engine (Handlebars-class
// features like helpers/loops aren't needed for the flat key-value data KPOS sends today).
function renderTemplate(source: string, data: Record<string, unknown>): string {
    return source.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
        const value = key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as any)[part] : undefined), data);
        return value === undefined || value === null ? '' : String(value);
    });
}

async function resolveTemplate(tenantId: string, templateKey: string): Promise<{ subject: string; htmlBody: string } | null> {
    const rows = await db.query.emailTemplates.findMany({
        where: and(
            eq(emailTemplates.key, templateKey),
            eq(emailTemplates.isActive, true),
            or(eq(emailTemplates.tenantId, tenantId), isNull(emailTemplates.tenantId)),
        ),
    });
    const template = rows.find(r => r.tenantId === tenantId) || rows.find(r => !r.tenantId);
    if (!template) return null;
    return { subject: template.subject, htmlBody: template.htmlBody };
}

export interface SendEmailParams {
    tenantId: string;
    templateKey: string;
    data: Record<string, unknown>;
    to: string[];
}

// Synchronous send — used by the retry worker and by callers that want to await the result.
export async function sendEmail({ tenantId, templateKey, data, to }: SendEmailParams): Promise<void> {
    const [adapter, template] = await Promise.all([
        getActiveAdapter(tenantId),
        resolveTemplate(tenantId, templateKey),
    ]);

    if (!adapter) throw new Error(`No active email provider configured for tenant ${tenantId}`);
    if (!template) throw new Error(`No email template found for key "${templateKey}"`);

    const subject = renderTemplate(template.subject, data);
    const html = renderTemplate(template.htmlBody, data);
    await adapter.send(to, subject, html);
}

export async function logEmailResult(params: { tenantId: string; toEmail: string; templateKey: string; status: 'sent' | 'failed' | 'queued'; error?: string }): Promise<void> {
    await db.insert(emailLogs).values({
        tenantId: params.tenantId,
        toEmail: params.toEmail,
        templateKey: params.templateKey,
        status: params.status,
        error: params.error,
    });
}

// Fire-and-forget send with retry via the EMAIL queue (falls back to inline send if
// RabbitMQ isn't connected — same pattern as queueAssetCleanup).
export async function sendEmailWithRetry(params: SendEmailParams): Promise<void> {
    const { publish, isRabbitMQConnected } = await import('@/config/rabbitmq.config');
    const { QUEUES } = await import('@/config/rabbitmq.config');
    if (isRabbitMQConnected() && publish(QUEUES.EMAIL, { ...params, attempt: 0 })) return;

    // Sync fallback
    try {
        await sendEmail(params);
        await logEmailResult({ tenantId: params.tenantId, toEmail: params.to.join(','), templateKey: params.templateKey, status: 'sent' });
    } catch (err: any) {
        await logEmailResult({ tenantId: params.tenantId, toEmail: params.to.join(','), templateKey: params.templateKey, status: 'failed', error: err?.message || String(err) });
        throw err;
    }
}
