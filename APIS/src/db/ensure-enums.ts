/**
 * Ensures the system_enums table exists and is seeded with default values.
 * Called once on server startup — safe to re-run (idempotent).
 */
import { db } from '@/config/database.config';
import { systemEnums } from '@/db/schema/tables';
import { eq, and, sql } from 'drizzle-orm';
import { ENUM_SEED_DATA } from '@/modules/settings/presentation/routes';

export async function ensureSystemEnums(): Promise<void> {
    try {
        // Check if table already exists
        const tableCheck = await db.execute(sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'system_enums'
            ) as exists
        `);

        const tableExists = tableCheck[0]?.exists === true || (tableCheck[0] as any)?.exists === true;

        if (!tableExists) {
            // Create table only if it doesn't exist
            await db.execute(sql`
                CREATE TABLE system_enums (
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
                )
            `);
            await db.execute(sql`
                CREATE UNIQUE INDEX system_enums_type_value_idx ON system_enums (type, value)
            `);
            await db.execute(sql`
                CREATE INDEX system_enums_type_idx ON system_enums (type)
            `);
            console.log('✅ system_enums table created');
        }

        // Seed defaults — only insert missing rows
        let inserted = 0;
        for (const [type, entries] of Object.entries(ENUM_SEED_DATA)) {
            for (let i = 0; i < entries.length; i++) {
                const e = entries[i];
                const existing = await db.query.systemEnums.findFirst({
                    where: and(eq(systemEnums.type, type), eq(systemEnums.value, e.value)),
                });
                if (!existing) {
                    await db.insert(systemEnums).values({
                        type, value: e.value, label: e.label,
                        labelLao: e.labelLao, order: i,
                        isSystem: e.isSystem ?? true, isActive: true,
                    });
                    inserted++;
                }
            }
        }

        if (inserted > 0) {
            console.log(`✅ system_enums seeded: ${inserted} entries`);
        } else {
            console.log('✅ system_enums: up to date');
        }
    } catch (error) {
        // Non-fatal: log but don't crash startup
        console.warn('⚠️  system_enums init warning:', (error as Error).message);
    }
}
