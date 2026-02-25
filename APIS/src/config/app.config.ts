// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Application Configuration
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(5000),
    API_VERSION: z.string().default('v1'),

    // Database
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url().optional().default('redis://localhost:6379'),
    RABBITMQ_URL: z.string().optional(),

    // JWT
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('12h'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    // External Services
    LINE_NOTIFY_TOKEN: z.string().optional(),
    SHOPEE_API_KEY: z.string().optional(),
    LAZADA_API_KEY: z.string().optional(),
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
};

export const redisConfig = {
    url: config.REDIS_URL,
};

export const jwtConfig = {
    secret: config.JWT_SECRET,
    expiresIn: config.JWT_EXPIRES_IN,
    refreshSecret: config.JWT_SECRET + '_refresh',
    refreshExpiresIn: config.JWT_REFRESH_EXPIRES_IN,
};
