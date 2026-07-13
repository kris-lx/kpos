// ═══════════════════════════════════════════════════════════════════════════
// Auth Module - SSO (OIDC) Login Routes
//
// Per-tenant OIDC login. No JIT provisioning: the callback resolves a local
// `users` row by (tenantId, email) and rejects if none exists — accounts
// must already be admin-created (see AuthService.loginWithSso).
//
// Flow: GET /sso/:tenantCode redirects to the tenant's configured IdP with a
// PKCE challenge; the IdP redirects back to GET /sso/callback with a code;
// this exchanges the code, resolves the local user, sets the same HttpOnly
// refresh cookie a password login would, then redirects to the frontend with
// no token in the URL — the SPA mints its own access token via the existing
// POST /auth/refresh endpoint using that cookie.
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import * as client from 'openid-client';
import { authRateLimiter } from '@/infrastructure/http/middleware/rateLimit.middleware';
import { authService } from '../infrastructure/services/auth.service';
import { getActiveOidcProvider, buildOidcClientConfig, oidcScopeString } from '@/infrastructure/services/sso/sso.service';
import { cache } from '@/config/redis.config';
import { db } from '@/config/database.config';
import { tenants } from '@/db/schema/tables';
import { eq } from 'drizzle-orm';
import { appConfig, emailConfig } from '@/config/app.config';

export const ssoRoutes = Router();

const CALLBACK_PATH = `/api/${appConfig.apiVersion}/auth/sso/callback`;
const TXN_TTL_SECONDS = 5 * 60;

interface SsoTxn {
    codeVerifier: string;
    nonce: string;
    state: string;
    tenantId: string;
    providerId: string;
}

function frontendRedirect(path: string, params: Record<string, string> = {}): string {
    const base = emailConfig.appUrl || 'http://localhost:5173';
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url.toString();
}

// Registered before /sso/:tenantCode — Express matches path segments
// literally-first only if the literal route is registered first; otherwise
// "callback" would be captured as :tenantCode.
ssoRoutes.get('/sso/callback', authRateLimiter, async (req, res, next) => {
    try {
        const state = typeof req.query.state === 'string' ? req.query.state : '';
        if (!state) {
            return res.redirect(frontendRedirect('/login', { ssoError: 'invalid_state' }));
        }

        // One-time use — delete immediately to prevent replay.
        const txn = await cache.get<SsoTxn>(`sso_txn:${state}`);
        await cache.del(`sso_txn:${state}`);
        if (!txn) {
            return res.redirect(frontendRedirect('/login', { ssoError: 'invalid_state' }));
        }

        const provider = await getActiveOidcProvider(txn.tenantId);
        if (!provider || provider.id !== txn.providerId) {
            return res.redirect(frontendRedirect('/login', { ssoError: 'not_configured' }));
        }

        const oidcConfig = await buildOidcClientConfig(provider.config);

        const currentUrl = new URL(`${appConfig.apiBaseUrl}${req.originalUrl}`);
        const tokens = await client.authorizationCodeGrant(oidcConfig, currentUrl, {
            pkceCodeVerifier: txn.codeVerifier,
            expectedState: txn.state,
            expectedNonce: txn.nonce,
        });

        const claims = tokens.claims();
        let email = claims?.email as string | undefined;

        // Several IdPs (confirmed: this is not test-only behavior — depends
        // on IdP/client configuration) return profile claims like email via
        // the userinfo endpoint rather than embedding them in the ID token
        // for the authorization_code flow. Fall back to userinfo before
        // giving up.
        if (!email && claims?.sub) {
            try {
                const userinfo = await client.fetchUserInfo(oidcConfig, tokens.access_token, claims.sub);
                email = userinfo.email as string | undefined;
            } catch {
                // fall through — still no_email_claim below
            }
        }

        if (!email) {
            return res.redirect(frontendRedirect('/login', { ssoError: 'no_email_claim' }));
        }

        try {
            await authService.loginWithSso(txn.tenantId, email, res);
        } catch (err: any) {
            if (err?.code === 'NO_ACCOUNT') {
                return res.redirect(frontendRedirect('/login', { ssoError: 'no_account_found' }));
            }
            throw err;
        }

        // Refresh cookie is set; the SPA mints its own access token via the
        // existing /auth/refresh endpoint — no token in this redirect URL.
        res.redirect(frontendRedirect('/auth/sso/callback'));
    } catch (error) {
        next(error);
    }
});

ssoRoutes.get('/sso/:tenantCode', authRateLimiter, async (req, res, next) => {
    try {
        const tenantCode = String(req.params.tenantCode);
        const tenant = await db.query.tenants.findFirst({
            where: eq(tenants.code, tenantCode),
            columns: { id: true },
        });
        if (!tenant) {
            return res.redirect(frontendRedirect('/login', { ssoError: 'unknown_organization' }));
        }

        const provider = await getActiveOidcProvider(tenant.id);
        if (!provider) {
            return res.redirect(frontendRedirect('/login', { ssoError: 'not_configured' }));
        }

        const oidcConfig = await buildOidcClientConfig(provider.config);
        const codeVerifier = client.randomPKCECodeVerifier();
        const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
        const state = client.randomState();
        const nonce = client.randomNonce();

        const txn: SsoTxn = { codeVerifier, nonce, state, tenantId: tenant.id, providerId: provider.id };
        await cache.set(`sso_txn:${state}`, txn, TXN_TTL_SECONDS);

        const authorizationUrl = client.buildAuthorizationUrl(oidcConfig, {
            redirect_uri: `${appConfig.apiBaseUrl}${CALLBACK_PATH}`,
            scope: oidcScopeString(provider.config),
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
        });

        res.redirect(authorizationUrl.toString());
    } catch (error) {
        next(error);
    }
});
