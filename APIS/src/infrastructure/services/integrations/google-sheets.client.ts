// ═══════════════════════════════════════════════════════════════════════════
// Google Sheets client — service-account JWT-bearer flow.
//
// Deliberately not using the `googleapis` SDK (large dependency for what
// amounts to two REST calls) — signs a JWT with the service account's
// private key using `jsonwebtoken` (already a dependency), exchanges it at
// Google's token endpoint for an access token (no OAuth consent screen, no
// redirect flow — pure server-to-server), then calls the Sheets REST API
// directly. Same "plain fetch client" style as jdb-yespay.client.ts.
//
// Setup (tenant-side, documented in the Settings UI): create a service
// account in Google Cloud Console, download its JSON key, share the target
// spreadsheet with the service account's `client_email` (Editor access).
//
// Docs:
//   https://developers.google.com/identity/protocols/oauth2/service-account
//   https://developers.google.com/sheets/api/reference/rest
// ═══════════════════════════════════════════════════════════════════════════

import jwt from 'jsonwebtoken';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export interface ServiceAccountJson {
    client_email: string;
    private_key: string;
    [key: string]: unknown;
}

export class GoogleSheetsApiError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = 'GoogleSheetsApiError';
    }
}

interface CachedToken {
    accessToken: string;
    expiresAt: number; // epoch ms
}

// Keyed by client_email — access tokens are short-lived (1h), in-memory
// caching is fine (a process restart just re-authenticates on next use).
const tokenCache = new Map<string, CachedToken>();

export function parseServiceAccountJson(raw: string): ServiceAccountJson {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error('Service account key is not valid JSON');
    }
    const sa = parsed as Partial<ServiceAccountJson>;
    if (!sa.client_email || !sa.private_key) {
        throw new Error('Service account JSON is missing client_email or private_key');
    }
    return sa as ServiceAccountJson;
}

async function getAccessToken(sa: ServiceAccountJson): Promise<string> {
    const cached = tokenCache.get(sa.client_email);
    if (cached && cached.expiresAt > Date.now() + 5000) return cached.accessToken;

    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
        {
            iss: sa.client_email,
            scope: SCOPE,
            aud: TOKEN_URL,
            iat: now,
            exp: now + 3600,
        },
        sa.private_key,
        { algorithm: 'RS256' },
    );

    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });
    if (!res.ok) {
        const body = await res.text();
        throw new GoogleSheetsApiError(`Failed to obtain Google access token: ${body}`, res.status);
    }
    const data = await res.json() as { access_token: string; expires_in: number };
    tokenCache.set(sa.client_email, {
        accessToken: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    });
    return data.access_token;
}

async function sheetsRequest(sa: ServiceAccountJson, path: string, init?: RequestInit): Promise<Response> {
    const token = await getAccessToken(sa);
    const res = await fetch(`${SHEETS_API_BASE}${path}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {}),
        },
    });
    if (!res.ok) {
        let message = `Google Sheets API request failed (${res.status})`;
        try {
            const body = await res.json() as { error?: { message?: string } };
            if (body?.error?.message) message = body.error.message;
        } catch {
            // ignore body parse failure
        }
        throw new GoogleSheetsApiError(message, res.status);
    }
    return res;
}

// Confirms the service account has been shared access to the spreadsheet —
// used by "Connect" to fail fast if the tenant forgot to share it.
export async function verifyAccess(sa: ServiceAccountJson, spreadsheetId: string): Promise<{ title: string }> {
    const res = await sheetsRequest(sa, `/${spreadsheetId}?fields=properties.title`);
    const data = await res.json() as { properties?: { title?: string } };
    return { title: data.properties?.title ?? spreadsheetId };
}

export async function appendRows(
    sa: ServiceAccountJson,
    spreadsheetId: string,
    sheetName: string,
    rows: unknown[][],
): Promise<void> {
    const range = encodeURIComponent(`${sheetName}!A1`);
    await sheetsRequest(sa, `/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        body: JSON.stringify({ values: rows }),
    });
}
