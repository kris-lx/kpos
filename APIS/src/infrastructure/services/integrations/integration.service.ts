// ═══════════════════════════════════════════════════════════════════════════
// IntegrationService — per-tenant, per-type credential storage for
// tenant_integrations (LINE, Google Sheets, ...). One row per (tenant, type)
// — unlike emailProviders/ssoProviders, these don't support multiple named
// providers.
// ═══════════════════════════════════════════════════════════════════════════

import { tenantIntegrations } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';
import { encryptJson, decryptJson } from '@/shared/crypto';
import { runWithTenantContext } from '@/shared/tenant-context';

export type IntegrationType = 'line' | 'google_sheets';

export async function resolveIntegration<T>(tenantId: string, type: IntegrationType): Promise<T | null> {
    // tenant_integrations has FORCE ROW LEVEL SECURITY — must run scoped even
    // when called from a code path without req.tx (see runWithTenantContext
    // doc comment; same fix already applied to email.service.ts/sso.service.ts).
    const row = await runWithTenantContext(tenantId, (tx) =>
        tx.query.tenantIntegrations.findFirst({
            where: and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.type, type), eq(tenantIntegrations.isActive, true)),
        }),
    );
    if (!row) return null;
    return decryptJson<T>(row.config as unknown as string);
}

export async function saveIntegration(tenantId: string, type: IntegrationType, config: Record<string, unknown>): Promise<void> {
    await runWithTenantContext(tenantId, async (tx) => {
        const existing = await tx.query.tenantIntegrations.findFirst({
            where: and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.type, type)),
        });
        const encrypted = encryptJson(config);
        if (existing) {
            await tx.update(tenantIntegrations)
                .set({ config: encrypted, isActive: true, connectedAt: new Date(), updatedAt: new Date() })
                .where(eq(tenantIntegrations.id, existing.id));
        } else {
            await tx.insert(tenantIntegrations).values({
                tenantId,
                type,
                config: encrypted,
                isActive: true,
                connectedAt: new Date(),
            });
        }
    });
}

export async function disconnectIntegration(tenantId: string, type: IntegrationType): Promise<void> {
    await runWithTenantContext(tenantId, (tx) =>
        tx.update(tenantIntegrations)
            .set({ isActive: false, updatedAt: new Date() })
            .where(and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.type, type))),
    );
}

// Status-only read for the list endpoint — never returns the decrypted config.
export async function getIntegrationStatus(tenantId: string, type: IntegrationType): Promise<{ connected: boolean; connectedAt: string | null }> {
    const row = await runWithTenantContext(tenantId, (tx) =>
        tx.query.tenantIntegrations.findFirst({
            where: and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.type, type)),
            columns: { isActive: true, connectedAt: true },
        }),
    );
    return {
        connected: row?.isActive ?? false,
        connectedAt: row?.connectedAt?.toISOString() ?? null,
    };
}

