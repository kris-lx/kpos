// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Application Configuration
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// docker-compose.yml passes unset optional vars through as `${VAR:-}` (an
// explicit empty string, not "unset"), which fails `.url().optional()` —
// Zod's `.optional()` only accepts `undefined`, not `''`. Without this,
// any deployment that doesn't explicitly set API_BASE_URL/APP_URL refuses
// to boot at all (verified live: the production docker-compose profile's
// api container crash-looped on exactly this).
const optionalUrl = () => z.preprocess((val) => (val === '' ? undefined : val), z.string().url().optional());

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),
    API_VERSION: z.string().default('v1'),

    // Database (PostgreSQL)
    DATABASE_URL: z.string(),
    DATABASE_READ_URL: z.string().optional(),
    REDIS_URL: z.preprocess((val) => (val === '' ? undefined : val), z.string().url().optional().default('redis://localhost:6379')),
    RABBITMQ_URL: z.string().optional(),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('20h'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('20h'),
    // Absolute session lifetime from first login — refresh-token rotation cannot
    // extend a session past this, regardless of how active the user stays.
    SESSION_ABSOLUTE_HOURS: z.coerce.number().default(20),

    // SSO (OIDC) — fixed backend callback base URL, must match what's
    // registered with each tenant's IdP. Falls back to localhost for dev.
    API_BASE_URL: optionalUrl(),

    // Per-tenant config encryption (email/SSO provider credentials) and
    // audit-log tamper-detection checksums. Deliberately separate keys from
    // JWT_SECRET and from each other — rotating one must not invalidate or
    // affect the others. Required here (not just at first use in
    // crypto.ts/audit-checksum.ts) so a misconfigured deploy fails at
    // startup, not on the first login/config-save request.
    CONFIG_ENCRYPTION_KEY: z.string().min(32),
    AUDIT_HMAC_SECRET: z.string().min(32),

    // Explicit CORS allow-list (comma-separated origins). Required in
    // production via a runtime check in server.ts (browsers reject wildcard
    // '*' with credentials:true); optional here since dev reflects the
    // request Origin when unset.
    CORS_ORIGIN: z.string().optional(),

    // External Services
    LINE_NOTIFY_TOKEN: z.string().optional(),
    SHOPEE_API_KEY: z.string().optional(),
    LAZADA_API_KEY: z.string().optional(),

    // Email (Brevo)
    BREVO_API_KEY: z.string().optional(),
    APP_URL: optionalUrl(),
});

export type Env = z.infer<typeof envSchema>;

function loadConfig(): Env {
    const parsed = envSchema.safeParse(process.env);

    if (!parsed.success) {
        console.error('❌ Invalid environment variables:');
        console.error(parsed.error.format());
        process.exit(1);
    }

    return parsed.data;
}

export const config = loadConfig();

export const appConfig = {
    env: config.NODE_ENV,
    port: config.PORT,
    apiVersion: config.API_VERSION,
    isProduction: config.NODE_ENV === 'production',
    isDevelopment: config.NODE_ENV === 'development',
    apiBaseUrl: config.API_BASE_URL || `http://localhost:${config.PORT}`,
};

export const dbConfig = {
    url: config.DATABASE_URL,
    readUrl: config.DATABASE_READ_URL,
};

export const redisConfig = {
    url: config.REDIS_URL,
};

export const jwtConfig = {
    secret: config.JWT_SECRET,
    expiresIn: config.JWT_EXPIRES_IN,
    refreshSecret: config.JWT_SECRET + '_refresh',
    refreshExpiresIn: config.JWT_REFRESH_EXPIRES_IN,
    sessionAbsoluteMs: config.SESSION_ABSOLUTE_HOURS * 60 * 60 * 1000,
};

export const emailConfig = {
    apiKey: config.BREVO_API_KEY || '',
    appUrl: config.APP_URL || '',
};
