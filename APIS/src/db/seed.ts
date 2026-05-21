// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Database Seed Script
// Creates: Super Admin, Default Branch, Roles, Rules, Role-Rules, Menu
// Run: npm run db:seed
// ═══════════════════════════════════════════════════════════════════════════

import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq, and } from 'drizzle-orm';
import argon2 from 'argon2';
import * as schema from './schema';
import {
    tenants, branches, users, roles, rules, roleRules, menuPermissions, stores, userStores,
    paymentMethods, systemEnums,
} from './schema/tables';

// ─── Config ──────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL is required');
    process.exit(1);
}

const client = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@kpos.la';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
const SUPER_ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Super Admin';

// ─── Default Roles ───────────────────────────────────────────────────────

const DEFAULT_ROLES = [
    { name: 'super_admin', displayName: 'Super Admin', description: 'Full system access', permissions: ['*'], isSystem: true },
    { name: 'admin', displayName: 'Admin', description: 'System administrator', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'sales:delete', 'products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'categories:delete', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:transfer', 'inventory:adjust', 'promotions:view', 'promotions:create', 'promotions:update', 'promotions:delete', 'customers:view', 'customers:create', 'customers:update', 'customers:delete', 'payments:view', 'payments:create', 'payments:manage', 'documents:view', 'documents:create', 'documents:update', 'reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'staff:view', 'staff:create', 'staff:update', 'staff:delete', 'roles:view', 'roles:create', 'roles:update', 'roles:delete', 'branches:view', 'branches:create', 'branches:update', 'stores:view', 'stores:create', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'hq_admin', displayName: 'HQ Admin', description: 'Cross-branch admin, full access minus admin panel', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:transfer', 'inventory:adjust', 'promotions:view', 'promotions:create', 'promotions:update', 'customers:view', 'customers:create', 'customers:update', 'customers:delete', 'payments:view', 'payments:create', 'payments:manage', 'documents:view', 'documents:create', 'documents:update', 'reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'staff:view', 'staff:create', 'staff:update', 'roles:view', 'branches:view', 'branches:create', 'branches:update', 'branches:delete', 'stores:view', 'stores:create', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'hq_manager', displayName: 'HQ Manager', description: 'Read-heavy HQ oversight, limited writes', permissions: ['dashboard:view', 'sales:view', 'products:view', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'customers:view', 'payments:view', 'documents:view', 'reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'staff:view', 'branches:view', 'stores:view', 'settings:view', 'restaurant:view'], isSystem: true },
    { name: 'store_owner', displayName: 'Store Owner', description: 'Store owner with full store access', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'sales:delete', 'products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:transfer', 'promotions:view', 'promotions:create', 'promotions:update', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'payments:manage', 'documents:view', 'documents:create', 'reports:view', 'reports:sales', 'reports:inventory', 'staff:view', 'staff:create', 'staff:update', 'staff:delete', 'roles:view', 'branches:view', 'branches:create', 'branches:update', 'branches:delete', 'stores:view', 'stores:create', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'branch_admin', displayName: 'Branch Admin', description: 'Branch administrator', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'categories:view', 'categories:create', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:transfer', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'documents:view', 'documents:create', 'reports:view', 'staff:view', 'staff:create', 'staff:update', 'stores:view', 'stores:update', 'settings:view', 'settings:update', 'restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'branch_manager', displayName: 'Branch Manager', description: 'Day-to-day branch management, no settings', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'documents:view', 'documents:create', 'reports:view', 'staff:view', 'restaurant:view', 'restaurant:manage', 'promotions:view'], isSystem: true },
    { name: 'store_manager', displayName: 'Store Manager', description: 'Single store manager', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'sales:update', 'products:view', 'products:create', 'products:update', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'customers:view', 'customers:create', 'customers:update', 'payments:view', 'payments:create', 'documents:view', 'documents:create', 'reports:view', 'staff:view', 'staff:create', 'settings:view', 'restaurant:view', 'restaurant:manage', 'promotions:view'], isSystem: true },
    { name: 'cashier', displayName: 'Cashier', description: 'POS cashier', permissions: ['dashboard:view', 'sales:view', 'sales:create', 'products:view', 'customers:view', 'payments:view', 'payments:create', 'documents:view'], isSystem: true },
    { name: 'inventory_staff', displayName: 'Inventory Staff', description: 'Warehouse staff', permissions: ['dashboard:view', 'products:view', 'categories:view', 'inventory:view', 'inventory:create', 'inventory:update', 'inventory:adjust', 'inventory:transfer', 'reports:view', 'reports:inventory'], isSystem: true },
    { name: 'kitchen_staff', displayName: 'Kitchen Staff', description: 'Kitchen display system', permissions: ['restaurant:view', 'restaurant:manage'], isSystem: true },
    { name: 'waiter', displayName: 'Waiter', description: 'Restaurant waiter', permissions: ['restaurant:view', 'tables:create', 'tables:update'], isSystem: true },
];

// ─── Default Rules ───────────────────────────────────────────────────────

const DEFAULT_RULES = [
    { name: 'dashboard', displayName: 'Dashboard', module: 'dashboard', icon: 'LayoutDashboard', routes: ['/dashboard'], permissions: ['dashboard:view'], order: 0, isSystem: true },
    { name: 'sales', displayName: 'Sales (POS)', module: 'sales', icon: 'ShoppingCart', routes: ['/pos', '/pos/credit', '/pos/held'], permissions: ['sales:view', 'sales:create', 'sales:update', 'sales:delete', 'sales:void', 'sales:refund', 'pos:access', 'pos:discount', 'pos:void', 'pos:credit'], order: 1, isSystem: true },
    { name: 'products', displayName: 'Products', module: 'products', icon: 'Package', routes: ['/products', '/products/sku', '/products/pricing', '/categories', '/barcode'], permissions: ['products:view', 'products:create', 'products:update', 'products:delete', 'categories:view', 'categories:create', 'categories:update', 'categories:delete'], order: 2, isSystem: true },
    { name: 'inventory', displayName: 'Inventory', module: 'inventory', icon: 'Boxes', routes: ['/inventory', '/inventory/stockin', '/inventory/stockout', '/inventory/adjust', '/inventory/transfer', '/inventory/count', '/inventory/purchase-orders', '/inventory/vendors'], permissions: ['inventory:view', 'inventory:create', 'inventory:update', 'inventory:delete', 'inventory:transfer', 'inventory:adjust'], order: 3, isSystem: true },
    { name: 'restaurant', displayName: 'Restaurant', module: 'restaurant', icon: 'UtensilsCrossed', routes: ['/restaurant/tables', '/restaurant/orders', '/restaurant/kitchen', '/restaurant/reservations', '/restaurant/e-menu'], permissions: ['restaurant:view', 'restaurant:manage', 'tables:create', 'tables:update', 'tables:delete'], order: 4, isSystem: true },
    { name: 'promotions', displayName: 'Promotions', module: 'promotions', icon: 'Gift', routes: ['/promotions', '/promotions/coupons', '/promotions/discounts'], permissions: ['promotions:view', 'promotions:create', 'promotions:update', 'promotions:delete'], order: 5, isSystem: true },
    { name: 'customers', displayName: 'Customers (CRM)', module: 'customers', icon: 'Users', routes: ['/customers', '/customers/members', '/customers/points', '/customers/loyalty'], permissions: ['customers:view', 'customers:create', 'customers:update', 'customers:delete'], order: 6, isSystem: true },
    { name: 'payments', displayName: 'Payments', module: 'payments', icon: 'Wallet', routes: ['/payments', '/payments/transactions', '/payments/settlements'], permissions: ['payments:view', 'payments:create', 'payments:void', 'payments:settle', 'payments:manage'], order: 7, isSystem: true },
    { name: 'documents', displayName: 'Documents', module: 'documents', icon: 'FileText', routes: ['/documents', '/documents/design', '/documents/invoices', '/documents/tax-invoices'], permissions: ['documents:view', 'documents:create', 'documents:update', 'documents:delete'], order: 8, isSystem: true },
    { name: 'reports', displayName: 'Reports', module: 'reports', icon: 'BarChart3', routes: ['/reports', '/reports/products', '/reports/inventory', '/reports/financial', '/reports/staff', '/reports/customers'], permissions: ['reports:view', 'reports:sales', 'reports:inventory', 'reports:financial', 'reports:staff'], order: 9, isSystem: true },
    { name: 'branches', displayName: 'Branch Management', module: 'branches', icon: 'Building2', routes: ['/branches'], permissions: ['branches:view', 'branches:create', 'branches:update', 'branches:delete'], order: 10, isSystem: true },
    { name: 'management.stores', displayName: 'Store Management', module: 'management.stores', icon: 'Store', routes: ['/management/stores'], permissions: ['stores:view', 'stores:create', 'stores:update', 'stores:delete'], order: 11, isSystem: true },
    { name: 'management.staff', displayName: 'Staff Management', module: 'management.staff', icon: 'UserCog', routes: ['/staff', '/staff/shifts'], permissions: ['staff:view', 'staff:create', 'staff:update', 'staff:delete'], order: 12, isSystem: true },
    { name: 'management.roles', displayName: 'Role Management', module: 'management.roles', icon: 'Shield', routes: ['/staff/roles'], permissions: ['roles:view', 'roles:create', 'roles:update', 'roles:delete'], order: 13, isSystem: true },
    { name: 'settings', displayName: 'Settings', module: 'settings', icon: 'Settings', routes: ['/settings', '/settings/display', '/settings/receipt', '/settings/tax', '/settings/payments', '/settings/printers', '/settings/notifications', '/settings/integrations', '/settings/profile'], permissions: ['settings:view', 'settings:update'], order: 14, isSystem: true },
    { name: 'admin', displayName: 'Super Admin', module: 'admin', icon: 'ShieldCheck', routes: ['/admin', '/admin/stores', '/admin/requests', '/admin/branches', '/admin/users', '/admin/roles', '/admin/positions', '/admin/rules', '/admin/audit', '/admin/permissions', '/admin/enums'], permissions: ['*', 'admin:access', 'admin:view', 'admin:manage'], order: 15, isSystem: true },
];

// ─── Default Role→Rule CRUD Mapping ──────────────────────────────────────

const DEFAULT_ROLE_RULES: Record<string, Record<string, { r: boolean; c: boolean; u: boolean; d: boolean }>> = {
    super_admin: Object.fromEntries(DEFAULT_RULES.map(r => [r.name, { r: true, c: true, u: true, d: true }])),
    admin: Object.fromEntries(DEFAULT_RULES.filter(r => r.name !== 'admin' && r.name !== 'sales').map(r => [r.name, { r: true, c: true, u: true, d: true }])),
    hq_admin: Object.fromEntries(DEFAULT_RULES.filter(r => r.name !== 'admin').map(r => [r.name, { r: true, c: true, u: true, d: true }])),
    hq_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: false, u: false, d: false },
        products: { r: true, c: false, u: false, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: false, u: false, d: false },
        promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: false, u: false, d: false },
        documents: { r: true, c: false, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: false, d: false },
        'management.stores': { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: false, u: false, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
    store_owner: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: true, d: true },
        products: { r: true, c: true, u: true, d: true }, inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false }, promotions: { r: true, c: true, u: true, d: true },
        customers: { r: true, c: true, u: true, d: false }, payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false }, reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: true, d: false },
        'management.stores': { r: true, c: true, u: true, d: true }, 'management.staff': { r: true, c: true, u: true, d: true },
        'management.roles': { r: true, c: false, u: false, d: false }, settings: { r: true, c: false, u: true, d: false },
    },
    branch_admin: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: true, u: true, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        branches: { r: true, c: false, u: true, d: false },
        'management.stores': { r: true, c: false, u: true, d: false },
        'management.staff': { r: true, c: true, u: true, d: false },
        settings: { r: true, c: false, u: true, d: false },
    },
    branch_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: false, u: false, d: false },
    },
    store_manager: {
        dashboard: { r: true, c: false, u: false, d: false },
        sales: { r: true, c: true, u: true, d: false },
        products: { r: true, c: true, u: true, d: false },
        inventory: { r: true, c: true, u: true, d: false },
        restaurant: { r: true, c: true, u: true, d: false },
        promotions: { r: true, c: false, u: false, d: false },
        customers: { r: true, c: true, u: true, d: false },
        payments: { r: true, c: true, u: false, d: false },
        documents: { r: true, c: true, u: false, d: false },
        reports: { r: true, c: false, u: false, d: false },
        'management.staff': { r: true, c: true, u: false, d: false },
        settings: { r: true, c: false, u: false, d: false },
    },
    cashier: {
        dashboard: { r: true, c: false, u: false, d: false }, sales: { r: true, c: true, u: false, d: false },
        products: { r: true, c: false, u: false, d: false }, customers: { r: true, c: false, u: false, d: false },
        payments: { r: true, c: true, u: false, d: false }, documents: { r: true, c: false, u: false, d: false },
    },
    inventory_staff: {
        dashboard: { r: true, c: false, u: false, d: false }, products: { r: true, c: false, u: false, d: false },
        inventory: { r: true, c: true, u: true, d: false }, reports: { r: true, c: false, u: false, d: false },
    },
    kitchen_staff: { restaurant: { r: true, c: true, u: true, d: false } },
    waiter: { restaurant: { r: true, c: true, u: true, d: false }, sales: { r: true, c: true, u: false, d: false } },
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function seed(): Promise<void> {
    console.log('🌱 Starting KPOS seed...\n');

    // 1. Create default tenant
    console.log('1️⃣  Creating default tenant...');
    let defaultTenant = await db.query.tenants.findFirst({ where: eq(tenants.code, 'DEFAULT') });
    if (!defaultTenant) {
        [defaultTenant] = await db.insert(tenants).values({
            name: 'Default Organization', code: 'DEFAULT', plan: 'free',
            isActive: true, status: 'active',
        }).returning();
        console.log(`   ✅ Created tenant: ${defaultTenant.name} (${defaultTenant.code})`);
    } else {
        console.log(`   ⏭️  Tenant exists: ${defaultTenant.name}`);
    }

    // 2. Create default branch (linked to tenant)
    console.log('2️⃣  Creating default branch...');
    let defaultBranch = await db.query.branches.findFirst({ where: eq(branches.isMain, true) });
    if (!defaultBranch) {
        [defaultBranch] = await db.insert(branches).values({
            tenantId: defaultTenant.id,
            name: 'Headquarters', code: 'HQ', isMain: true, isActive: true,
        }).returning();
        console.log(`   ✅ Created branch: ${defaultBranch.name} (${defaultBranch.code})`);
    } else {
        // Backfill tenantId if missing
        if (!defaultBranch.tenantId) {
            await db.update(branches).set({ tenantId: defaultTenant.id }).where(eq(branches.id, defaultBranch.id));
            defaultBranch = { ...defaultBranch, tenantId: defaultTenant.id };
        }
        console.log(`   ⏭️  Branch exists: ${defaultBranch.name}`);
    }

    // 3. Create default store (linked to tenant)
    console.log('3️⃣  Creating default store...');
    let defaultStore = await db.query.stores.findFirst({ where: eq(stores.branchId, defaultBranch.id) });
    if (!defaultStore) {
        [defaultStore] = await db.insert(stores).values({
            tenantId: defaultTenant.id,
            name: 'Main Store', code: 'MAIN', branchId: defaultBranch.id,
            isActive: true, isDefault: true,
        }).returning();
        console.log(`   ✅ Created store: ${defaultStore.name}`);
    } else {
        if (!defaultStore.tenantId) {
            await db.update(stores).set({ tenantId: defaultTenant.id }).where(eq(stores.id, defaultStore.id));
            defaultStore = { ...defaultStore, tenantId: defaultTenant.id };
        }
        console.log(`   ⏭️  Store exists: ${defaultStore.name}`);
    }

    // 4. Seed roles
    console.log('4️⃣  Seeding roles...');
    const roleMap: Record<string, string> = {};
    for (const roleDef of DEFAULT_ROLES) {
        let role = await db.query.roles.findFirst({ where: eq(roles.name, roleDef.name) });
        if (!role) {
            [role] = await db.insert(roles).values(roleDef).returning();
            console.log(`   ✅ Created role: ${roleDef.displayName}`);
        } else {
            await db.update(roles).set({
                displayName: roleDef.displayName,
                description: roleDef.description,
                permissions: roleDef.permissions,
            }).where(eq(roles.id, role.id));
            console.log(`   ↻  Updated role: ${roleDef.displayName}`);
        }
        roleMap[roleDef.name] = role.id;
    }

    // 5. Seed rules
    console.log('5️⃣  Seeding rules...');
    const ruleMap: Record<string, string> = {};
    for (const ruleDef of DEFAULT_RULES) {
        let rule = await db.query.rules.findFirst({ where: eq(rules.name, ruleDef.name) });
        if (!rule) {
            [rule] = await db.insert(rules).values({
                ...ruleDef, isActive: true, description: null,
            }).returning();
            console.log(`   ✅ Created rule: ${ruleDef.displayName}`);
        } else {
            await db.update(rules).set({
                displayName: ruleDef.displayName,
                permissions: ruleDef.permissions,
                routes: ruleDef.routes,
                module: ruleDef.module,
                icon: ruleDef.icon,
                order: ruleDef.order,
            }).where(eq(rules.id, rule.id));
            console.log(`   ↻  Updated rule: ${ruleDef.displayName}`);
        }
        ruleMap[ruleDef.name] = rule.id;
    }

    // 6. Seed role-rules CRUD mappings
    console.log('6️⃣  Seeding role-rule CRUD mappings...');
    let rrCount = 0;
    for (const [roleName, ruleEntries] of Object.entries(DEFAULT_ROLE_RULES)) {
        const roleId = roleMap[roleName];
        if (!roleId) continue;
        for (const [ruleName, crud] of Object.entries(ruleEntries)) {
            const ruleId = ruleMap[ruleName];
            if (!ruleId) continue;
            const existing = await db.query.roleRules.findFirst({
                where: (rr, { and, eq }) => and(eq(rr.roleId, roleId), eq(rr.ruleId, ruleId)),
            });
            if (!existing) {
                await db.insert(roleRules).values({
                    roleId, ruleId, canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d,
                });
                rrCount++;
            } else {
                await db.update(roleRules).set({
                    canRead: crud.r, canCreate: crud.c, canUpdate: crud.u, canDelete: crud.d,
                }).where(and(eq(roleRules.roleId, roleId), eq(roleRules.ruleId, ruleId)));
            }
        }
    }
    console.log(`   ✅ Created ${rrCount} role-rule mappings`);

    // 7. Create super admin user (linked to tenant)
    console.log('7️⃣  Creating super admin user...');
    let adminUser = await db.query.users.findFirst({ where: eq(users.email, SUPER_ADMIN_EMAIL) });
    if (!adminUser) {
        const hashedPassword = await argon2.hash(SUPER_ADMIN_PASSWORD);
        [adminUser] = await db.insert(users).values({
            tenantId: defaultTenant.id,
            email: SUPER_ADMIN_EMAIL,
            password: hashedPassword,
            name: SUPER_ADMIN_NAME,
            role: 'super_admin',
            roleId: roleMap.super_admin,
            branchId: defaultBranch.id,
            isSuperAdmin: true,
            isActive: true,
            emailVerified: true,
            permissions: ['*'],
        }).returning();

        // Create UserStore access
        await db.insert(userStores).values({
            tenantId: defaultTenant.id,
            userId: adminUser.id,
            storeId: defaultStore.id,
            branchId: defaultBranch.id,
            canRead: true, canWrite: true, canDelete: true, canManage: true, isDefault: true,
        });

        console.log(`   ✅ Created super admin: ${SUPER_ADMIN_EMAIL}`);
        console.log(`   🔑 Password: ${SUPER_ADMIN_PASSWORD}`);
    } else {
        // Backfill tenantId if missing
        if (!adminUser.tenantId) {
            await db.update(users).set({ tenantId: defaultTenant.id }).where(eq(users.id, adminUser.id));
        }
        console.log(`   ⏭️  Super admin exists: ${adminUser.email}`);
    }

    // 8. Seed default payment methods
    console.log('8️⃣  Seeding default payment methods...');
    const DEFAULT_PAYMENT_METHODS = [
        { name: 'Cash', code: 'CASH', type: 'cash', icon: 'Banknote', isDefault: true, sortOrder: 0 },
        { name: 'Card', code: 'CARD', type: 'card', icon: 'CreditCard', sortOrder: 1 },
        { name: 'QR / Bank Transfer', code: 'TRANSFER', type: 'transfer', icon: 'QrCode', sortOrder: 2 },
    ];
    let pmCount = 0;
    for (const pm of DEFAULT_PAYMENT_METHODS) {
        const existing = await db.query.paymentMethods.findFirst({
            where: (t, { and, eq: e }) => and(e(t.code, pm.code), e(t.tenantId, defaultTenant.id)),
        });
        if (!existing) {
            await db.insert(paymentMethods).values({ ...pm, tenantId: defaultTenant.id, isActive: true });
            pmCount++;
        }
    }
    console.log(`   ✅ Created ${pmCount} payment methods`);

    // 9. Seed system enums
    console.log('9️⃣  Seeding system enums...');
    const DEFAULT_ENUMS = [
        { type: 'business_type', value: 'retail', label: 'Retail', labelLao: 'ຂາຍຍ່ອຍ', order: 0, isSystem: true },
        { type: 'business_type', value: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ', order: 1, isSystem: true },
        { type: 'business_type', value: 'cafe', label: 'Café', labelLao: 'ຮ້ານກາເຟ', order: 2, isSystem: true },
        { type: 'business_type', value: 'wholesale', label: 'Wholesale', labelLao: 'ຂາຍສົ່ງ', order: 3, isSystem: true },
        { type: 'business_type', value: 'service', label: 'Service', labelLao: 'ບໍລິການ', order: 4, isSystem: true },
        { type: 'stockout_reason', value: 'damaged', label: 'Damaged', labelLao: 'ເສຍຫາຍ', order: 0, isSystem: true },
        { type: 'stockout_reason', value: 'expired', label: 'Expired', labelLao: 'ໝົດອາຍຸ', order: 1, isSystem: true },
        { type: 'stockout_reason', value: 'lost', label: 'Lost', labelLao: 'ສູນເສຍ', order: 2, isSystem: true },
        { type: 'stockout_reason', value: 'returned', label: 'Returned to Supplier', labelLao: 'ສົ່ງຄືນຜູ້ສະໜອງ', order: 3, isSystem: true },
        { type: 'stockin_reason', value: 'purchase', label: 'Purchase', labelLao: 'ຊື້ເຂົ້າ', order: 0, isSystem: true },
        { type: 'stockin_reason', value: 'transfer', label: 'Transfer In', labelLao: 'ໂອນເຂົ້າ', order: 1, isSystem: true },
        { type: 'stockin_reason', value: 'return', label: 'Customer Return', labelLao: 'ລູກຄ້າສົ່ງຄືນ', order: 2, isSystem: true },
        { type: 'stockin_reason', value: 'adjustment', label: 'Adjustment', labelLao: 'ປັບປຸງ', order: 3, isSystem: true },
    ];
    let enumCount = 0;
    for (const e of DEFAULT_ENUMS) {
        const existing = await db.query.systemEnums.findFirst({
            where: (t, { and, eq: eq2 }) => and(eq2(t.type, e.type), eq2(t.value, e.value)),
        });
        if (!existing) {
            await db.insert(systemEnums).values(e);
            enumCount++;
        }
    }
    console.log(`   ✅ Created ${enumCount} system enums`);

    // 10. Seed menu permissions (always reset to ensure latest structure)
    console.log('🔟  Seeding menu permissions...');
    await db.delete(menuPermissions);
    {
        const MENU_STRUCTURE = [
            { key: 'dashboard', label: 'Dashboard', labelLao: 'ແຜງຄວບຄຸມ', icon: 'LayoutDashboard', path: '/dashboard', requiredPermission: 'dashboard:view', children: [] },
            { key: 'sales', label: 'Sales', labelLao: 'ຂາຍ', icon: 'ShoppingCart', requiredPermission: 'sales:create', children: [
                { key: 'sales.pos', label: 'POS', labelLao: 'ໜ້າຂາຍ POS', icon: 'ShoppingCart', path: '/pos', requiredPermission: 'sales:create' },
                { key: 'sales.credit', label: 'Credit Sales', labelLao: 'ຂາຍສິນເຊື່ອ', icon: 'CreditCard', path: '/pos/credit', requiredPermission: 'sales:create' },
                { key: 'sales.held', label: 'Held Orders', labelLao: 'ບິນທີ່ພັກໄວ້', icon: 'ClipboardList', path: '/pos/held', requiredPermission: 'sales:create' },
            ]},
            { key: 'products', label: 'Products', labelLao: 'ສິນຄ້າ', icon: 'Package', requiredPermission: 'products:view', children: [
                { key: 'products.list', label: 'Product List', labelLao: 'ລາຍການສິນຄ້າ', icon: 'Package', path: '/products', requiredPermission: 'products:view' },
                { key: 'products.categories', label: 'Categories', labelLao: 'ໝວດໝູ່', icon: 'Tags', path: '/categories', requiredPermission: 'categories:view' },
                { key: 'products.barcode', label: 'Barcode / QR', labelLao: 'Barcode / QR Code', icon: 'Barcode', path: '/barcode', requiredPermission: 'products:view' },
                { key: 'products.sku', label: 'SKU / Variants', labelLao: 'SKU / ຕົວເລືອກ', icon: 'Layers', path: '/products/sku', requiredPermission: 'products:view' },
                { key: 'products.pricing', label: 'Pricing Levels', labelLao: 'ລະດັບລາຄາ', icon: 'DollarSign', path: '/products/pricing', requiredPermission: 'products:update' },
            ]},
            { key: 'inventory', label: 'Inventory', labelLao: 'ສາງ', icon: 'Boxes', requiredPermission: 'inventory:view', children: [
                { key: 'inventory.stock', label: 'Stock', labelLao: 'ສາງສິນຄ້າ', icon: 'Boxes', path: '/inventory', requiredPermission: 'inventory:view' },
                { key: 'inventory.stockin', label: 'Stock In', labelLao: 'ນຳເຂົ້າສິນຄ້າ', icon: 'TrendingUp', path: '/inventory/stockin', requiredPermission: 'inventory:create' },
                { key: 'inventory.stockout', label: 'Stock Out', labelLao: 'ນຳອອກສິນຄ້າ', icon: 'TrendingDown', path: '/inventory/stockout', requiredPermission: 'inventory:create' },
                { key: 'inventory.adjust', label: 'Stock Adjust', labelLao: 'ປັບປ່ຽນສະຕ໋ອກ', icon: 'Scale', path: '/inventory/adjust', requiredPermission: 'inventory:update' },
                { key: 'inventory.transfer', label: 'Stock Transfer', labelLao: 'ໂອນຍ້າຍສິນຄ້າ', icon: 'ArrowRightLeft', path: '/inventory/transfer', requiredPermission: 'inventory:update' },
                { key: 'inventory.count', label: 'Stock Count', labelLao: 'ກວດນັບສະຕ໋ອກ', icon: 'ClipboardCheck', path: '/inventory/count', requiredPermission: 'inventory:update' },
                { key: 'inventory.purchase-orders', label: 'Purchase Orders', labelLao: 'ສັ່ງຊື້ (PO)', icon: 'ClipboardList', path: '/inventory/purchase-orders', requiredPermission: 'inventory:create' },
                { key: 'inventory.vendors', label: 'Vendors', labelLao: 'ຜູ້ສະໜອງ', icon: 'Truck', path: '/inventory/vendors', requiredPermission: 'inventory:view' },
                { key: 'inventory.expiry', label: 'Expiry Tracking', labelLao: 'ວັນໝົດອາຍຸ', icon: 'CalendarClock', path: '/inventory/expiry', requiredPermission: 'inventory:view' },
                { key: 'inventory.out-of-stock', label: 'Out of Stock', labelLao: 'ສິນຄ້າໝົດສະຕ໋ອກ', icon: 'PackageX', path: '/inventory/out-of-stock', requiredPermission: 'inventory:view' },
            ]},
            { key: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ', icon: 'UtensilsCrossed', requiredPermission: 'restaurant:view', children: [
                { key: 'restaurant.tables', label: 'Tables', labelLao: 'ໂຕະ', icon: 'UtensilsCrossed', path: '/restaurant/tables', requiredPermission: 'restaurant:view' },
                { key: 'restaurant.orders', label: 'Orders', labelLao: 'ອໍເດີ', icon: 'ClipboardList', path: '/restaurant/orders', requiredPermission: 'restaurant:view' },
                { key: 'restaurant.kitchen', label: 'Kitchen (KDS)', labelLao: 'ຄົວ (KDS)', icon: 'ChefHat', path: '/restaurant/kitchen', requiredPermission: 'restaurant:manage' },
                { key: 'restaurant.reservations', label: 'Reservations', labelLao: 'ຈອງໂຕະ', icon: 'CalendarClock', path: '/restaurant/reservations', requiredPermission: 'restaurant:view' },
                { key: 'restaurant.emenu', label: 'e-Menu', labelLao: 'e-Menu', icon: 'QrCode', path: '/restaurant/e-menu', requiredPermission: 'restaurant:view' },
            ]},
            { key: 'promotions', label: 'Promotions', labelLao: 'ໂປຣໂມຊັ່ນ', icon: 'Gift', requiredPermission: 'promotions:view', children: [
                { key: 'promotions.list', label: 'Promotions', labelLao: 'ໂປຣໂມຊັ່ນ', icon: 'Gift', path: '/promotions', requiredPermission: 'promotions:view' },
                { key: 'promotions.coupons', label: 'Coupons', labelLao: 'ຄູປອງ', icon: 'TicketPercent', path: '/promotions/coupons', requiredPermission: 'promotions:view' },
                { key: 'promotions.discounts', label: 'Discounts', labelLao: 'ສ່ວນຫຼຸດ', icon: 'Percent', path: '/promotions/discounts', requiredPermission: 'promotions:view' },
            ]},
            { key: 'crm', label: 'CRM', labelLao: 'ລູກຄ້າ (CRM)', icon: 'Users', requiredPermission: 'customers:view', children: [
                { key: 'crm.customers', label: 'Customers', labelLao: 'ລູກຄ້າ', icon: 'Users', path: '/customers', requiredPermission: 'customers:view' },
                { key: 'crm.members', label: 'Members', labelLao: 'ສະມາຊິກ', icon: 'Crown', path: '/customers/members', requiredPermission: 'customers:view' },
                { key: 'crm.points', label: 'Points', labelLao: 'ຄະແນນສະສົມ', icon: 'Star', path: '/customers/points', requiredPermission: 'customers:view' },
                { key: 'crm.loyalty', label: 'Loyalty Program', labelLao: 'ໂປຣແກຣມ Loyalty', icon: 'Heart', path: '/customers/loyalty', requiredPermission: 'customers:update' },
            ]},
            { key: 'payments', label: 'Payments', labelLao: 'ການຊຳລະ', icon: 'Wallet', requiredPermission: 'payments:view', children: [
                { key: 'payments.methods', label: 'Payment Methods', labelLao: 'ວິທີຊຳລະ', icon: 'CreditCard', path: '/payments', requiredPermission: 'payments:view' },
                { key: 'payments.transactions', label: 'Transactions', labelLao: 'ລາຍການຊຳລະ', icon: 'Receipt', path: '/payments/transactions', requiredPermission: 'payments:view' },
                { key: 'payments.settlements', label: 'Settlements', labelLao: 'ປິດບັນຊີ', icon: 'DollarSign', path: '/payments/settlements', requiredPermission: 'payments:manage' },
            ]},
            { key: 'documents', label: 'Documents', labelLao: 'ເອກະສານ', icon: 'FileText', requiredPermission: 'documents:view', children: [
                { key: 'documents.receipts', label: 'Receipts', labelLao: 'ໃບບິນ', icon: 'Receipt', path: '/documents', requiredPermission: 'documents:view' },
                { key: 'documents.design', label: 'Receipt Design', labelLao: 'ອອກແບບໃບບິນ', icon: 'Printer', path: '/documents/design', requiredPermission: 'documents:update' },
                { key: 'documents.invoices', label: 'Invoices', labelLao: 'ໃບແຈ້ງໜີ້', icon: 'FileText', path: '/documents/invoices', requiredPermission: 'documents:view' },
                { key: 'documents.tax-invoices', label: 'Tax Invoices', labelLao: 'ໃບກຳກັບພາສີ', icon: 'FileSpreadsheet', path: '/documents/tax-invoices', requiredPermission: 'documents:view' },
            ]},
            { key: 'reports', label: 'Reports', labelLao: 'ລາຍງານ', icon: 'BarChart3', requiredPermission: 'reports:view', children: [
                { key: 'reports.sales', label: 'Sales Report', labelLao: 'ລາຍງານການຂາຍ', icon: 'BarChart3', path: '/reports', requiredPermission: 'reports:view' },
                { key: 'reports.products', label: 'Product Report', labelLao: 'ລາຍງານສິນຄ້າ', icon: 'Package', path: '/reports/products', requiredPermission: 'reports:view' },
                { key: 'reports.inventory', label: 'Inventory Report', labelLao: 'ລາຍງານສາງ', icon: 'Boxes', path: '/reports/inventory', requiredPermission: 'reports:view' },
                { key: 'reports.financial', label: 'Financial Report', labelLao: 'ລາຍງານການເງິນ', icon: 'DollarSign', path: '/reports/financial', requiredPermission: 'reports:view' },
                { key: 'reports.staff', label: 'Staff Report', labelLao: 'ລາຍງານພະນັກງານ', icon: 'UserCog', path: '/reports/staff', requiredPermission: 'reports:view' },
                { key: 'reports.customers', label: 'Customer Report', labelLao: 'ລາຍງານລູກຄ້າ', icon: 'Users', path: '/reports/customers', requiredPermission: 'reports:view' },
            ]},
            { key: 'management', label: 'Management', labelLao: 'ຈັດການ', icon: 'Building2', requiredPermission: 'staff:view', children: [
                { key: 'management.branches', label: 'Branches', labelLao: 'ສາຂາ', icon: 'Building2', path: '/branches', requiredPermission: 'branches:view' },
                { key: 'management.stores', label: 'Stores', labelLao: 'ຮ້ານຄ້າ', icon: 'Store', path: '/management/stores', requiredPermission: 'stores:view' },
                { key: 'management.staff', label: 'Staff', labelLao: 'ພະນັກງານ', icon: 'UserCog', path: '/staff', requiredPermission: 'staff:view' },
                { key: 'management.roles', label: 'Roles', labelLao: 'ບົດບາດ', icon: 'Users', path: '/staff/roles', requiredPermission: 'roles:view' },
                { key: 'management.cashregisters', label: 'Cash Registers', labelLao: 'ເຄື່ອງ POS', icon: 'Monitor', path: '/management/cashregisters', requiredPermission: 'settings:view' },
                { key: 'management.shifts', label: 'Shifts', labelLao: 'ກະການເຮັດວຽກ', icon: 'Timer', path: '/staff/shifts', requiredPermission: 'staff:view' },
            ]},
            { key: 'settings', label: 'Settings', labelLao: 'ຕັ້ງຄ່າ', icon: 'Settings', requiredPermission: 'settings:view', children: [
                { key: 'settings.general', label: 'General', labelLao: 'ຕັ້ງຄ່າທົ່ວໄປ', icon: 'Settings', path: '/settings', requiredPermission: 'settings:view' },
                { key: 'settings.display', label: 'Display', labelLao: 'ຕັ້ງຄ່າຈໍສະແດງ', icon: 'Monitor', path: '/settings/display', requiredPermission: 'settings:view' },
                { key: 'settings.receipt', label: 'Receipt', labelLao: 'ຕັ້ງຄ່າໃບບິນ', icon: 'Receipt', path: '/settings/receipt', requiredPermission: 'settings:update' },
                { key: 'settings.tax', label: 'Tax', labelLao: 'ຕັ້ງຄ່າພາສີ', icon: 'Percent', path: '/settings/tax', requiredPermission: 'settings:update' },
                { key: 'settings.payments', label: 'Payments', labelLao: 'ຕັ້ງຄ່າການຊຳລະ', icon: 'CreditCard', path: '/settings/payments', requiredPermission: 'settings:update' },
                { key: 'settings.printers', label: 'Printers', labelLao: 'ຕັ້ງຄ່າເຄື່ອງພິມ', icon: 'Printer', path: '/settings/printers', requiredPermission: 'settings:update' },
                { key: 'settings.notifications', label: 'Notifications', labelLao: 'ຕັ້ງຄ່າແຈ້ງເຕືອນ', icon: 'BellRing', path: '/settings/notifications', requiredPermission: 'settings:view' },
                { key: 'settings.integrations', label: 'Integrations', labelLao: 'ເຊື່ອມຕໍ່', icon: 'Plug', path: '/settings/integrations', requiredPermission: 'settings:update' },
                { key: 'settings.branch-identity', label: 'Branch Identity', labelLao: 'ຂໍ້ມູນສາຂາ', icon: 'Building2', path: '/settings/branch-identity', requiredPermission: 'settings:update' },
                { key: 'settings.receipt-template', label: 'Receipt Template', labelLao: 'ແບບໃບບິນ', icon: 'Printer', path: '/settings/receipt-template', requiredPermission: 'settings:update' },
            ]},
            { key: 'super-admin', label: 'Super Admin', labelLao: 'Super Admin', icon: 'ShieldCheck', requiredPermission: 'admin:view', children: [
                { key: 'super-admin.dashboard', label: 'Admin Dashboard', labelLao: 'ແຜງຄວບຄຸມ', icon: 'Shield', path: '/admin', requiredPermission: 'admin:view' },
                { key: 'super-admin.requests', label: 'Requests', labelLao: 'ຄຳຂໍເປີດຮ້ານ', icon: 'FileCheck', path: '/admin/requests', requiredPermission: 'admin:view' },
                { key: 'super-admin.stores', label: 'Stores Overview', labelLao: 'ພາບລວມຮ້ານ/ສາຂາ', icon: 'Store', path: '/admin/stores', requiredPermission: 'admin:view' },
                { key: 'super-admin.branches', label: 'Branches', labelLao: 'ຈັດການສາຂາ', icon: 'Building2', path: '/admin/branches', requiredPermission: 'admin:view' },
                { key: 'super-admin.users', label: 'Users', labelLao: 'ຈັດການຜູ້ໃຊ້', icon: 'Users', path: '/admin/users', requiredPermission: 'admin:view' },
                { key: 'super-admin.roles', label: 'Roles', labelLao: 'ຈັດການບົດບາດ', icon: 'Key', path: '/admin/roles', requiredPermission: 'admin:manage' },
                { key: 'super-admin.positions', label: 'Positions', labelLao: 'ຕຳແໜ່ງພະນັກງານ', icon: 'Briefcase', path: '/admin/positions', requiredPermission: 'staff:create' },
                { key: 'super-admin.rules', label: 'Rules', labelLao: 'ຈັດການ Rules', icon: 'ShieldCheck', path: '/admin/rules', requiredPermission: 'admin:manage' },
                { key: 'super-admin.permissions', label: 'Permissions', labelLao: 'ຈັດການສິດ', icon: 'Shield', path: '/admin/permissions', requiredPermission: 'admin:manage' },
                { key: 'super-admin.audit', label: 'Audit Log', labelLao: 'ປະຫວັດການໃຊ້ງານ', icon: 'History', path: '/admin/audit', requiredPermission: 'admin:view' },
            ]},
            { key: 'help', label: 'Help', labelLao: 'ຊ່ວຍເຫຼືອ', icon: 'HelpCircle', path: '/help', requiredPermission: null, children: [] },
        ];

        let menuCount = 0;
        for (let i = 0; i < MENU_STRUCTURE.length; i++) {
            const menu = MENU_STRUCTURE[i];
            const [parent] = await db.insert(menuPermissions).values({
                key: menu.key, label: menu.label, labelLao: menu.labelLao, icon: menu.icon,
                path: (menu as any).path || null, requiredPermission: menu.requiredPermission || null,
                order: i, isActive: true,
            }).returning();
            menuCount++;

            if (menu.children?.length) {
                for (let j = 0; j < menu.children.length; j++) {
                    const child = menu.children[j];
                    await db.insert(menuPermissions).values({
                        key: child.key, label: child.label, labelLao: child.labelLao, icon: child.icon,
                        path: child.path, requiredPermission: child.requiredPermission || null,
                        parentId: parent.id, order: j, isActive: true,
                    });
                    menuCount++;
                }
            }
        }
        console.log(`   ✅ Created ${menuCount} menu items`);
    }

    console.log('\n✅ Seed completed successfully!\n');
    console.log('📋 Summary:');
    console.log(`   Tenant:     ${defaultTenant.name} (${defaultTenant.code})`);
    console.log(`   Branch:     ${defaultBranch.name} (${defaultBranch.code})`);
    console.log(`   Store:      ${defaultStore.name}`);
    console.log(`   Roles:      ${DEFAULT_ROLES.length}`);
    console.log(`   Rules:      ${DEFAULT_RULES.length}`);
    console.log(`   Admin:      ${SUPER_ADMIN_EMAIL}`);
    console.log('\n💡 Login with: ' + SUPER_ADMIN_EMAIL + ' / ' + SUPER_ADMIN_PASSWORD);
}

// ─── Execute ─────────────────────────────────────────────────────────────

seed()
    .then(() => { process.exit(0); })
    .catch((err) => {
        console.error('❌ Seed failed:', err);
        process.exit(1);
    });
