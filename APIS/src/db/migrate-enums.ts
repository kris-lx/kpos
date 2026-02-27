/**
 * One-time migration: create system_enums table if it doesn't exist
 * Run: npx ts-node src/db/migrate-enums.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS system_enums (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                type TEXT NOT NULL,
                value TEXT NOT NULL,
                label TEXT NOT NULL,
                label_lao TEXT,
                "order" INTEGER NOT NULL DEFAULT 0,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                is_system BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);
        await client.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS system_enums_type_value_idx ON system_enums (type, value);
        `);
        await client.query(`
            CREATE INDEX IF NOT EXISTS system_enums_type_idx ON system_enums (type);
        `);
        console.log('✅ system_enums table ready');
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
