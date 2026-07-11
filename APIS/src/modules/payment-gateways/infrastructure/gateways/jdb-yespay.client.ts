// ═══════════════════════════════════════════════════════════════════════════
// JDB (Joint Development Bank) Yes Pay deeplink client — v1.2 spec.
//
// Flow: POST /dynamic/autenticate {requestId, partnerId, clientId, clientScret}
// -> bearer accessToken, then POST /dynamic/generateQr (Authorization: Bearer,
// SignedHash header) -> emv string to render as QR. SignedHash = HMAC-SHA256
// of the JSON request body, hex-encoded (spec §2.4).
//
// JDB has no fixed public host — each merchant gets their own base URL, so
// `config.baseUrl` is required (no default).
// ═══════════════════════════════════════════════════════════════════════════

import { createHmac } from 'crypto';
import type { JdbYesPayConfig } from '../../domain/types';

interface CachedToken {
    accessToken: string;
    expiresAt: number; // epoch ms
}

// Keyed by baseUrl+partnerId — tokens are short-lived, in-memory caching is fine
// (a process restart just re-authenticates on the next call).
const tokenCache = new Map<string, CachedToken>();

export function signedHash(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

async function authenticate(config: JdbYesPayConfig): Promise<string> {
    const cacheKey = `${config.baseUrl}:${config.partnerId}`;
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now() + 5000) return cached.accessToken;

    const requestId = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const body = {
        requestId,
        partnerId: config.partnerId,
        clientId: config.clientId,
        clientScret: config.clientSecret, // sic — matches the vendor spec's field name typo
    };
    const res = await fetch(`${config.baseUrl}/api/uat/dynamic/autenticate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    const json: any = await res.json();
    if (!json.success || !json.data?.accessToken) {
        throw new Error(json.message || 'JDB authentication failed');
    }
    const expiresAt = Date.now() + (Number(json.data.expiresIn) || 300) * 1000;
    tokenCache.set(cacheKey, { accessToken: json.data.accessToken, expiresAt });
    return json.data.accessToken;
}

export interface JdbGenerateQrParams {
    requestId: string; // up to 25 chars, unique per transaction
    txnAmount: number;
    billNumber: string;
    terminalId?: string;
    terminalLabel?: string;
    mobileNo?: string;
}

export interface JdbGenerateQrResult {
    mcid: string;
    emv: string;
}

export async function generateQr(config: JdbYesPayConfig, params: JdbGenerateQrParams): Promise<JdbGenerateQrResult> {
    const accessToken = await authenticate(config);
    const body = {
        requestId: params.requestId,
        partnerId: config.partnerId,
        mechantId: config.merchantId, // sic — matches the vendor spec's field name typo
        txnAmount: params.txnAmount,
        billNumber: params.billNumber,
        terminalId: params.terminalId || config.terminalId,
        terminalLabel: params.terminalLabel,
        mobileNo: params.mobileNo,
    };
    const payload = JSON.stringify(body);

    const res = await fetch(`${config.baseUrl}/api/uat/dynamic/generateQr`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            SignedHash: signedHash(payload, config.clientSecret),
        },
        body: payload,
    });
    const json: any = await res.json();
    if (!json.success || !json.data?.emv) {
        throw new Error(json.message || 'JDB generateQr failed');
    }
    return { mcid: json.data.mcid, emv: json.data.emv };
}

export interface JdbCheckTransactionResult {
    message: string;
    refNo?: string;
    txnAmount?: number;
    txnDateTime?: string;
    billNumber: string;
    paid: boolean;
}

// Spec §2.3: check by billNumber. There is no explicit "not yet paid" status
// field documented — the endpoint returns success:false / a non-SUCCESS
// message until the bill is paid, which we treat as "not paid yet".
export async function checkTransaction(config: JdbYesPayConfig, billNumber: string): Promise<JdbCheckTransactionResult> {
    const accessToken = await authenticate(config);
    const body = { requestId: `${Date.now()}${Math.floor(Math.random() * 1e6)}`, billNumber };
    const payload = JSON.stringify(body);

    const res = await fetch(`${config.baseUrl}/api/uat/dynamic/checkTransaction`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            SignedHash: signedHash(payload, config.clientSecret),
        },
        body: payload,
    });
    const json: any = await res.json();
    const paid = Boolean(json.success && json.data?.message === 'SUCCESS');
    return {
        message: json.data?.message || json.message || 'UNKNOWN',
        refNo: json.data?.refNo,
        txnAmount: json.data?.txnAmount,
        txnDateTime: json.data?.txnDateTime,
        billNumber,
        paid,
    };
}
