// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Security Middleware
// Input sanitization, XSS prevention, SQL injection protection
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';

// ─── Dangerous Patterns ──────────────────────────────────────────────────

const SQL_INJECTION_PATTERNS = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b.*\b(FROM|INTO|TABLE|DATABASE|SET)\b)/i,
    /(--|;|\/\*|\*\/|xp_|sp_)/,
    /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/i,
    /(CHAR\s*\(|CONCAT\s*\(|0x[0-9a-f]+)/i,
];

const XSS_PATTERNS = [
    /<script[\s>]/i,
    /javascript\s*:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /document\.\w+/i,
    /window\.\w+/i,
];

// ─── Sanitize String ─────────────────────────────────────────────────────

function sanitizeString(value: string): string {
    return value
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

function containsSQLInjection(value: string): boolean {
    return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(value));
}

function containsXSS(value: string): boolean {
    return XSS_PATTERNS.some(pattern => pattern.test(value));
}

// ─── Deep Sanitize Object ────────────────────────────────────────────────

// Fields carrying opaque credential/secret blobs (PEM private keys,
// JSON-encoded service account keys, API tokens, signing keys, passwords) —
// never rendered back as HTML, so no XSS risk from leaving them unescaped.
// PEM keys always contain `-----BEGIN` (trips the SQLi heuristic's `--`
// pattern), and random base64/hex secrets frequently contain `/` or trip the
// XSS heuristic's `on\w+\s*=` pattern near padding — either way, silent
// corruption before the value is ever validated, hashed, or encrypted.
// Audited 2026-07-11 against every credential-shaped field across auth,
// settings (email/SSO/api-keys), and payment-gateways routes — see
// memory/line-google-sheets-integrations.md for the fields that motivated
// this. Exempt by field name, same pattern as the base64-image exemption
// below (checked against only the last path segment, so this also covers
// nested fields like `config.signKey`).
const CREDENTIAL_BLOB_FIELDS = [
    // Integration credential blobs (found 2026-07-11)
    'serviceaccountjson', 'channelaccesstoken', 'privatekey', 'private_key',
    // Payment gateway config (SwiftPass RSA signKey is a PEM blob; JDB/others are secrets)
    'signkey', 'clientsecret', 'clientscret', // "clientScret" — matches JDB vendor spec's field-name typo verbatim
    // Email provider config (SMTP password, Brevo/SendGrid/Mailgun API keys)
    'pass', 'apikey',
    // Generic API Keys tab
    'secretkey',
    // Auth passwords — deterministic sanitizer transform means login still
    // works even if corrupted (same transform applies at register and
    // login), but exempting avoids silently storing a mutated credential
    // for any password containing `--`/`;`/`<`/`>`/`"`/`'`/`/`.
    'password', 'currentpassword', 'newpassword',
];

function isCredentialBlobField(path: string): boolean {
    const lastSegment = path.split(/[.[]/).pop()?.toLowerCase() ?? '';
    return CREDENTIAL_BLOB_FIELDS.includes(lastSegment);
}

function deepSanitize(obj: unknown, path = ''): unknown {
    // Skip base64 image strings which can false-positive SQLi detectors
    if (path.endsWith('.image') || path.endsWith('.images') || path.endsWith('.avatar') || path.endsWith('.photo')) {
        if (typeof obj === 'string' && obj.startsWith('data:image/')) {
            return obj; // Let it through
        }
    }

    if (typeof obj === 'string' && isCredentialBlobField(path)) {
        return obj; // Let opaque credential blobs through unescaped — see CREDENTIAL_BLOB_FIELDS comment
    }

    if (typeof obj === 'string') {
        // Check for SQL injection attempts
        if (containsSQLInjection(obj)) {
            console.warn(`⚠️  SQL injection attempt detected at ${path}: ${obj.substring(0, 100)}`);
            return sanitizeString(obj);
        }
        // Check for XSS attempts
        if (containsXSS(obj)) {
            console.warn(`⚠️  XSS attempt detected at ${path}: ${obj.substring(0, 100)}`);
            return sanitizeString(obj);
        }
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map((item, i) => deepSanitize(item, `${path}[${i}]`));
    }

    if (obj && typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = deepSanitize(value, `${path}.${key}`);
        }
        return sanitized;
    }

    return obj;
}

// ─── Middleware ───────────────────────────────────────────────────────────

export function inputSanitizer(req: Request, _res: Response, next: NextFunction): void {
    if (req.body && typeof req.body === 'object') {
        req.body = deepSanitize(req.body, 'body');
    }

    if (req.query && typeof req.query === 'object') {
        for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === 'string') {
                if (containsSQLInjection(value) || containsXSS(value)) {
                    console.warn(`⚠️  Malicious query param "${key}": ${value.substring(0, 100)}`);
                    (req.query as Record<string, unknown>)[key] = sanitizeString(value);
                }
            }
        }
    }

    next();
}

// ─── UUID Validator ──────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-7][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
    return UUID_REGEX.test(value);
}

export function validateParamId(req: Request<any, any, any, any>, res: Response<any>, next: NextFunction): void {
    const { id } = req.params;
    if (id && typeof id === 'string' && !isValidUUID(id)) {
        res.status(400).json({
            success: false,
            error: { code: 'VAL_002', message: 'Invalid ID format' },
        });
        return;
    }
    next();
}

// ─── Safe Integer Parser ─────────────────────────────────────────────────

export function safeParseInt(value: unknown, defaultValue: number, min = 0, max = 10000): number {
    const parsed = Number(value);
    if (isNaN(parsed) || !isFinite(parsed)) return defaultValue;
    return Math.min(max, Math.max(min, Math.floor(parsed)));
}

// ─── Safe Pagination ─────────────────────────────────────────────────────

export function safePagination(query: Record<string, unknown>): { page: number; limit: number; skip: number } {
    const page = safeParseInt(query.page, 1, 1, 10000);
    const limit = safeParseInt(query.limit, 20, 1, 100);
    return { page, limit, skip: (page - 1) * limit };
}

// ─── Strict JSON Content Type ────────────────────────────────────────────

export function requireJSON(req: Request, res: Response, next: NextFunction): void {
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
        res.status(415).json({
            success: false,
            error: { code: 'SEC_001', message: 'Content-Type must be application/json' },
        });
        return;
    }
    next();
}

// ─── No Cache for API Responses ──────────────────────────────────────────

export function noCacheHeaders(_req: Request, res: Response, next: NextFunction): void {
    res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Surrogate-Control': 'no-store',
    });
    next();
}
