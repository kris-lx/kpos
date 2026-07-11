// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Application Configuration
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),
    API_VERSION: z.string().default('v1'),

    // Database (PostgreSQL)
    DATABASE_URL: z.string(),
    DATABASE_READ_URL: z.string().optional(),
    REDIS_URL: z.string().url().optional().default('redis://localhost:6379'),
    RABBITMQ_URL: z.string().optional(),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('20h'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('20h'),
    // Absolute session lifetime from first login — refresh-token rotation cannot
    // extend a session past this, regardless of how active the user stays.
    SESSION_ABSOLUTE_HOURS: z.coerce.number().default(20),

    // External Services
    LINE_NOTIFY_TOKEN: z.string().optional(),
    SHOPEE_API_KEY: z.string().optional(),
    LAZADA_API_KEY: z.string().optional(),

    // Email (Brevo)
    BREVO_API_KEY: z.string().optional(),
    APP_URL: z.string().url().optional(),
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
