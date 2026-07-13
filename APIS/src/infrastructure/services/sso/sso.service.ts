// ═══════════════════════════════════════════════════════════════════════════
// SsoService — per-tenant OIDC provider resolution + client config building
// Mirrors email/email.service.ts's resolveActiveProvider/invalidateProviderCache
// pattern for consistency with the other per-tenant integration.
// ═══════════════════════════════════════════════════════════════════════════

import * as client from 'openid-client';
import { cache } from '@/config/redis.config';
import { ssoProviders } from '@/db/schema/tables';
import { eq, and, desc } from 'drizzle-orm';
import { decryptJson } from '@/shared/crypto';
import { runWithTenantContext } from '@/shared/tenant-context';
import type { OidcConfig } from './types';

const RESOLVED_CACHE_TTL = 30; // seconds

const DEFAULT_SCOPES = ['openid', 'email', 'profile'];

interface ResolvedSsoProvider {
    id: string;
    config: OidcConfig;
}

async function resolveActiveOidcProvider(tenantId: string): Promise<ResolvedSsoProvider | null> {
    const cacheKey = `kpos:sso-provider:${tenantId}`;
    const cached = await cache.get<ResolvedSsoProvider>(cacheKey);
    if (cached) return cached;

    // Public SSO login routes have no req.tx (no authenticated user yet to
    // derive tenant context from) — sso_providers has FORCE RLS like every
    // other tenant table, so a plain globalDb query would silently return
    // zero rows. Scope this one read using the tenantId already resolved
    // from tenants.code (see shared/tenant-context.ts).
    const row = await runWithTenantContext(tenantId, (tx) =>
        tx.query.ssoProviders.findFirst({
            where: and(eq(ssoProviders.tenantId, tenantId), eq(ssoProviders.isActive, true)),
            orderBy: [desc(ssoProviders.isDefault), desc(ssoProviders.updatedAt)],
        }),
    );
    if (!row) return null;

    const resolved: ResolvedSsoProvider = {
        id: row.id,
        config: decryptJson<OidcConfig>(row.config as unknown as string),
    };
    await cache.set(cacheKey, resolved, RESOLVED_CACHE_TTL);
    return resolved;
}

export async function invalidateSsoProviderCache(tenantId: string): Promise<void> {
    await cache.del(`kpos:sso-provider:${tenantId}`);
}

export async function getActiveOidcProvider(tenantId: string): Promise<ResolvedSsoProvider | null> {
    return resolveActiveOidcProvider(tenantId);
}

export async function buildOidcClientConfig(config: OidcConfig): Promise<client.Configuration> {
    const issuer = new URL(config.issuerUrl);

    // openid-client refuses plain-HTTP issuers by default (correct for
    // production — real IdPs are always HTTPS), including for the discovery
    // fetch itself. Only relax this for non-HTTPS issuers outside
    // production, so a local test IdP (http://localhost:...) can be used
    // for development/manual testing without weakening anything in a real
    // deployment.
    const allowInsecure = issuer.protocol === 'http:' && process.env.NODE_ENV !== 'production';

    return client.discovery(
        issuer,
        config.clientId,
        config.clientSecret,
        undefined,
        allowInsecure ? { execute: [client.allowInsecureRequests] } : undefined,
    );
}

export function oidcScopeString(config: OidcConfig): string {
    return (config.scopes && config.scopes.length > 0 ? config.scopes : DEFAULT_SCOPES).join(' ');
}

// Used by the "Test Connection" settings endpoint — verifies the issuer's
// discovery document is reachable and the client credentials are well-formed
// (does not perform a full login flow).
export async function testOidcConnection(config: OidcConfig): Promise<boolean> {
    await buildOidcClientConfig(config);
    return true;
}
