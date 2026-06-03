// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Database Reset Script
// Truncates all application tables then drops/recreates Drizzle migrations
// so seed-demo.ts starts from a clean slate.
//
// Run: bun run db:reset
// ═══════════════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client);

// Tables in dependency order (children before parents to satisfy FK constraints)
const TABLES = [
    // Transactions / sales
    'transaction_payments',
    'transaction_items',
    'transactions',
    'held_sales',
    // POS / orders
    'order_items',
    'orders',
    'cash_movements',
    'shifts',
    'cash_registers',
    // Inventory
    'stock_count_items',
    'stock_counts',
    'stock_transfer_items',
    'stock_transfers',
    'stock_movements',
    'purchase_order_items',
    'purchase_orders',
    'inventory',
    // Products
    'product_price_levels',
    'sku_variants',
    'product_stores',
    'bill_of_materials',
    'products',
    'price_levels',
    'categories',
    'vendors',
    // CRM / loyalty
    'points_history',
    'point_history',
    'members',
    'customers',
    'membership_tiers',
    'point_settings',
    // Promotions / payments
    'coupons',
    'discounts',
    'promotions',
    'payment_methods',
    // Restaurant
    'reservations',
    'tables',
    // Documents / settings
    'documents',
    'document_templates',
    'notifications',
    'settings',
    'activity_logs',
    // Store requests
    'store_requests',
    // User / auth
    'sessions',
    'user_stores',
    'user_role_assignments',
    'menu_permissions',
    'role_rules',
    'permission_groups',
    'permissions',
    'rules',
    'roles',
    'users',
    // Core structure
    'stores',
    'branches',
    'tenants',
    // Enums / system
    'system_enums',
];

async function reset() {
    console.log('⚠️  Resetting database — all data will be deleted!\n');

    // Disable FK checks for duration of truncation
    await db.execute(sql`SET session_replication_role = replica`);

    let ok = 0;
    let missing = 0;
    for (const table of TABLES) {
        try {
            await db.execute(sql.raw(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`));
            console.log(`  ✅ truncated: ${table}`);
            ok++;
        } catch (e: any) {
            if (e.message?.includes('does not exist')) {
                console.log(`  ⚠️  skipped (not found): ${table}`);
                missing++;
            } else {
                console.error(`  ❌ error on ${table}:`, e.message);
            }
        }
    }

    // Re-enable FK checks
    await db.execute(sql`SET session_replication_role = DEFAULT`);

    // Also clear Drizzle's internal migration journal so pushes are clean
    try {
        await db.execute(sql`TRUNCATE TABLE "__drizzle_migrations" RESTART IDENTITY CASCADE`);
        console.log('  ✅ truncated: __drizzle_migrations');
    } catch { /* table may not exist yet */ }

    console.log(`\n✅ Reset complete — ${ok} tables cleared, ${missing} not found (OK)`);
    await client.end();
}

reset().catch(e => { console.error(e); process.exit(1); });
