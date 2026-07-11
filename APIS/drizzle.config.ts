import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
    out: './drizzle',
    schema: './src/db/schema/tables.ts',
    dialect: 'postgresql',
    dbCredentials: {
        // Migrations run DDL (CREATE ROLE, ALTER TABLE ... ENABLE RLS) and must
        // use the superuser connection, not the restricted app role.
        url: process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL!,
    },
});
