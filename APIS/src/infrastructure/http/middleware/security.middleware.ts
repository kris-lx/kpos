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

function deepSanitize(obj: unknown, path = ''): unknown {
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

export function validateParamId(req: Request, res: Response, next: NextFunction): void {
    const { id } = req.params;
    if (id && !isValidUUID(id)) {
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
