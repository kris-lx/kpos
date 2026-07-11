// KPOS – Production Seed
//
// Seeds ONLY the immutable system data that every fresh deployment needs:
//   • Menu items (full navigation tree)
//   • System roles  (DEFAULT_ROLES)
//   • System rules  (DEFAULT_RULES)
//   • Role-rule mappings (DEFAULT_ROLE_RULES)
//   • One superadmin user
//
// Safe to re-run (fully idempotent – upserts only).
// Does NOT create any tenant, branch, store, product or demo data.
//
// Usage:
//   npm run db:seed:prod
//   SEED_ADMIN_EMAIL=… SEED_ADMIN_PASSWORD=… npm run db:seed:prod

import 'dotenv/config';
import postgres from 'postgres';
import argon2 from 'argon2';
import { DEFAULT_ROLES, DEFAULT_RULES, DEFAULT_ROLE_RULES } from '../shared/defaultAccessControl';
import { permissionsToMask } from '../infrastructure/permissions';

// Seeds write across all tenants (and creates the platform superadmin) — needs
// the superuser/migration connection, not the restricted kpos_app role
// (DATABASE_URL, used by the running API).
const DATABASE_URL = process.env.DATABASE_MIGRATE_URL || process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('❌  DATABASE_MIGRATE_URL (or DATABASE_URL) is required');
    process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

const SUPER_ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL ?? 'admin@kpos.la';
const SUPER_ADMIN_NAME     = process.env.SEED_ADMIN_NAME  ?? 'Super Admin';

// No fallback: a hardcoded default here means every fresh deploy that forgets
// to set this env var gets a platform superadmin with a publicly-known password.
if (!process.env.SEED_ADMIN_PASSWORD) {
    console.error('❌  SEED_ADMIN_PASSWORD is required (no default — this account has full platform access)');
    process.exit(1);
}
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

// This script is idempotent by design (safe to re-run on every deploy), but that
// must not mean silently rotating a live admin's password on every run. Password
// is only set on first creation unless this is explicitly opted into.
const RESET_PASSWORD_ON_EXISTING = process.env.SEED_ADMIN_RESET_PASSWORD === 'true';

type Row = Record<string, any>;

type MenuItem = {
    key: string;
    label: string;
    labelLao?: string;
    icon?: string;
    path?: string;
    requiredPermission?: string;
    children?: MenuItem[];
};

function first<T extends Row>(rows: T[]): T {
    if (!rows[0]) throw new Error('Expected a row but got none');
    return rows[0];
}
function optional<T extends Row>(rows: T[]): T | null {
    return rows[0] ?? null;
}

// ── roles ────────────────────────────────────────────────────────────────────

async function ensureRole(role: (typeof DEFAULT_ROLES)[number]): Promise<Row> {
    const existing = optional(await sql`
        select * from roles
        where tenant_id is null and branch_id is null and name = ${role.name}
        limit 1
    `);
    const mask = permissionsToMask(role.permissions);
    if (existing) {
        return first(await sql`
            update roles set
                display_name = ${role.displayName},
                description  = ${role.description},
                permissions  = ${role.permissions},
                is_system    = ${role.isSystem},
                mask_low     = ${mask.low.toString()},
                mask_high    = ${mask.high.toString()},
                updated_at   = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into roles (
            tenant_id, branch_id, name, display_name, description,
            permissions, is_system, mask_low, mask_high
        ) values (
            null, null,
            ${role.name}, ${role.displayName}, ${role.description},
            ${role.permissions}, ${role.isSystem},
            ${mask.low.toString()}, ${mask.high.toString()}
        )
        returning *
    `);
}

// ── rules ────────────────────────────────────────────────────────────────────

async function ensureRule(rule: (typeof DEFAULT_RULES)[number]): Promise<Row> {
    const existing = optional(await sql`
        select * from rules
        where tenant_id is null and name = ${rule.name}
        limit 1
    `);
    if (existing) {
        return first(await sql`
            update rules set
                display_name = ${rule.displayName},
                description  = ${rule.description},
                module       = ${rule.module},
                icon         = ${rule.icon},
                routes       = ${rule.routes},
                permissions  = ${rule.permissions},
                "order"      = ${rule.order},
                is_active    = true,
                is_system    = ${rule.isSystem},
                updated_at   = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into rules (
            tenant_id, name, display_name, description, module, icon,
            routes, permissions, "order", is_active, is_system
        ) values (
            null,
            ${rule.name}, ${rule.displayName}, ${rule.description}, ${rule.module}, ${rule.icon},
            ${rule.routes}, ${rule.permissions}, ${rule.order}, true, ${rule.isSystem}
        )
        returning *
    `);
}

// ── role-rule mappings ────────────────────────────────────────────────────────

async function ensureRoleRule(input: {
    roleId: string;
    ruleId: string;
    flags: { r: boolean; c: boolean; u: boolean; d: boolean };
}): Promise<void> {
    const existing = optional(await sql`
        select * from role_rules
        where role_id = ${input.roleId} and rule_id = ${input.ruleId}
        limit 1
    `);
    if (existing) {
        await sql`
            update role_rules set
                can_read   = ${input.flags.r},
                can_create = ${input.flags.c},
                can_update = ${input.flags.u},
                can_delete = ${input.flags.d}
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into role_rules (
            tenant_id, role_id, rule_id,
            can_read, can_create, can_update, can_delete
        ) values (
            null, ${input.roleId}, ${input.ruleId},
            ${input.flags.r}, ${input.flags.c}, ${input.flags.u}, ${input.flags.d}
        )
    `;
}

// ── menu ─────────────────────────────────────────────────────────────────────

async function ensureMenuItem(item: MenuItem, parentId: string | null, order: number): Promise<Row> {
    const existing = optional(await sql`
        select * from menu_permissions where key = ${item.key} limit 1
    `);
    if (existing) {
        return first(await sql`
            update menu_permissions set
                label               = ${item.label},
                label_lao           = ${item.labelLao ?? null},
                icon                = ${item.icon ?? null},
                path                = ${item.path ?? null},
                parent_id           = ${parentId},
                required_permission = ${item.requiredPermission ?? null},
                "order"             = ${order},
                is_active           = true,
                updated_at          = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into menu_permissions (
            key, label, label_lao, icon, path, parent_id,
            required_permission, "order", is_active
        ) values (
            ${item.key}, ${item.label}, ${item.labelLao ?? null}, ${item.icon ?? null},
            ${item.path ?? null}, ${parentId}, ${item.requiredPermission ?? null},
            ${order}, true
        )
        returning *
    `);
}

async function seedMenu(items: MenuItem[], parentId: string | null = null): Promise<void> {
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row  = await ensureMenuItem(item, parentId, i);
        if (item.children?.length) await seedMenu(item.children, row.id);
    }
}

// ── superadmin user ───────────────────────────────────────────────────────────

async function ensureSuperAdmin(roleId: string): Promise<Row> {
    const existing = optional(await sql`
        select * from users
        where email = ${SUPER_ADMIN_EMAIL} and tenant_id is null
        limit 1
    `);
    if (existing) {
        if (RESET_PASSWORD_ON_EXISTING) {
            const passwordHash = await argon2.hash(SUPER_ADMIN_PASSWORD);
            return first(await sql`
                update users set
                    password       = ${passwordHash},
                    name           = ${SUPER_ADMIN_NAME},
                    role           = 'super_admin',
                    role_id        = ${roleId},
                    permissions    = ${'{"*"}'},
                    is_active      = true,
                    is_super_admin = true,
                    email_verified = true,
                    tenant_id      = null,
                    branch_id      = null,
                    updated_at     = now()
                where id = ${existing.id}
                returning *
            `);
        }
        // Re-run without explicit opt-in: keep the live password untouched,
        // only refresh role/permission metadata (e.g. after a role rename).
        return first(await sql`
            update users set
                name           = ${SUPER_ADMIN_NAME},
                role           = 'super_admin',
                role_id        = ${roleId},
                permissions    = ${'{"*"}'},
                is_active      = true,
                is_super_admin = true,
                email_verified = true,
                tenant_id      = null,
                branch_id      = null,
                updated_at     = now()
            where id = ${existing.id}
            returning *
        `);
    }
    const passwordHash = await argon2.hash(SUPER_ADMIN_PASSWORD);
    return first(await sql`
        insert into users (
            tenant_id, branch_id, email, password, name,
            role, role_id, permissions,
            is_active, is_super_admin, email_verified
        ) values (
            null, null,
            ${SUPER_ADMIN_EMAIL}, ${passwordHash}, ${SUPER_ADMIN_NAME},
            'super_admin', ${roleId}, ${'{"*"}'},
            true, true, true
        )
        returning *
    `);
}

// ── full navigation tree ──────────────────────────────────────────────────────

const MENU_STRUCTURE: MenuItem[] = [
    {
        key: 'dashboard', label: 'Dashboard', labelLao: 'ແຜງຄວບຄຸມ',
        icon: 'LayoutDashboard', path: '/dashboard', requiredPermission: 'dashboard:view',
    },
    {
        key: 'sales', label: 'Sales', labelLao: 'ຂາຍ',
        icon: 'ShoppingCart', requiredPermission: 'sales:create',
        children: [
            { key: 'sales.pos',    label: 'POS',          labelLao: 'ຂາຍ POS',  icon: 'ShoppingCart',  path: '/pos',         requiredPermission: 'sales:create' },
            { key: 'sales.credit', label: 'Credit Sales', labelLao: 'ຂາຍເຊື່ອ', icon: 'CreditCard',    path: '/pos/credit',  requiredPermission: 'sales:create' },
            { key: 'sales.held',   label: 'Held Orders',  labelLao: 'ບິນພັກ',    icon: 'ClipboardList', path: '/pos/held',    requiredPermission: 'sales:create' },
        ],
    },
    {
        key: 'products', label: 'Products', labelLao: 'ສິນຄ້າ',
        icon: 'Package', requiredPermission: 'products:view',
        children: [
            { key: 'products.list',       label: 'Product List',   labelLao: 'ລາຍການສິນຄ້າ', icon: 'Package',     path: '/products',          requiredPermission: 'products:view'   },
            { key: 'products.categories', label: 'Categories',     labelLao: 'ໝວດໝູ່',        icon: 'Tags',        path: '/categories',        requiredPermission: 'categories:view' },
            { key: 'products.barcode',    label: 'Barcode / QR',                              icon: 'Barcode',     path: '/barcode',           requiredPermission: 'products:view'   },
            { key: 'products.sku',        label: 'SKU / Variants',                            icon: 'Layers',      path: '/products/sku',      requiredPermission: 'products:view'   },
            { key: 'products.pricing',    label: 'Pricing Levels',                            icon: 'DollarSign',  path: '/products/pricing',  requiredPermission: 'products:update' },
        ],
    },
    {
        key: 'inventory', label: 'Inventory', labelLao: 'ສາງ',
        icon: 'Boxes', requiredPermission: 'inventory:view',
        children: [
            { key: 'inventory.stock',           label: 'Stock',           path: '/inventory',                   icon: 'Boxes',          requiredPermission: 'inventory:view'   },
            { key: 'inventory.stockin',         label: 'Stock In',        path: '/inventory/stockin',           icon: 'TrendingUp',     requiredPermission: 'inventory:create' },
            { key: 'inventory.stockout',        label: 'Stock Out',       path: '/inventory/stockout',          icon: 'TrendingDown',   requiredPermission: 'inventory:create' },
            { key: 'inventory.adjust',          label: 'Stock Adjust',    path: '/inventory/adjust',            icon: 'Scale',          requiredPermission: 'inventory:update' },
            { key: 'inventory.transfer',        label: 'Stock Transfer',  path: '/inventory/transfer',          icon: 'ArrowRightLeft', requiredPermission: 'inventory:update' },
            { key: 'inventory.count',           label: 'Stock Count',     path: '/inventory/count',             icon: 'ClipboardCheck', requiredPermission: 'inventory:update' },
            { key: 'inventory.purchase-orders', label: 'Purchase Orders', path: '/inventory/purchase-orders',   icon: 'ClipboardList',  requiredPermission: 'inventory:create' },
            { key: 'inventory.vendors',         label: 'Vendors',         path: '/inventory/vendors',           icon: 'Truck',          requiredPermission: 'inventory:view'   },
            { key: 'inventory.expiry',          label: 'Expiry Tracking', path: '/inventory/expiry',            icon: 'CalendarClock',  requiredPermission: 'inventory:view'   },
        ],
    },
    {
        key: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ',
        icon: 'UtensilsCrossed', requiredPermission: 'restaurant:view',
        children: [
            { key: 'restaurant.tables',       label: 'Tables',        path: '/restaurant/tables',       icon: 'UtensilsCrossed', requiredPermission: 'restaurant:view'   },
            { key: 'restaurant.orders',       label: 'Orders',        path: '/restaurant/orders',       icon: 'ClipboardList',   requiredPermission: 'restaurant:view'   },
            { key: 'restaurant.kitchen',      label: 'Kitchen (KDS)', path: '/restaurant/kitchen',      icon: 'ChefHat',         requiredPermission: 'restaurant:manage' },
            { key: 'restaurant.reservations', label: 'Reservations',  path: '/restaurant/reservations', icon: 'CalendarClock',   requiredPermission: 'restaurant:view'   },
            { key: 'restaurant.emenu',        label: 'e-Menu',        path: '/restaurant/e-menu',       icon: 'QrCode',          requiredPermission: 'restaurant:view'   },
        ],
    },
    {
        key: 'promotions', label: 'Promotions', labelLao: 'ໂປຣໂມຊັ່ນ',
        icon: 'Gift', requiredPermission: 'promotions:view',
        children: [
            { key: 'promotions.list',      label: 'Promotions', path: '/promotions',          icon: 'Gift',          requiredPermission: 'promotions:view' },
            { key: 'promotions.coupons',   label: 'Coupons',    path: '/promotions/coupons',  icon: 'TicketPercent', requiredPermission: 'promotions:view' },
            { key: 'promotions.discounts', label: 'Discounts',  path: '/promotions/discounts',icon: 'Percent',       requiredPermission: 'promotions:view' },
        ],
    },
    {
        key: 'crm', label: 'Members', labelLao: 'ສະມາຊິກ',
        icon: 'Users', requiredPermission: 'customers:view',
        children: [
            { key: 'crm.members', label: 'Members',        path: '/customers/members', icon: 'Crown', requiredPermission: 'customers:view'   },
            { key: 'crm.points',  label: 'Points',         path: '/customers/points',  icon: 'Star',  requiredPermission: 'customers:view'   },
            { key: 'crm.loyalty', label: 'Loyalty Program',path: '/customers/loyalty', icon: 'Heart', requiredPermission: 'customers:update' },
        ],
    },
    {
        key: 'payments', label: 'Payments', labelLao: 'ຊຳລະ',
        icon: 'Wallet', requiredPermission: 'payments:view',
        children: [
            { key: 'payments.methods',      label: 'Payment Methods', path: '/payments',              icon: 'CreditCard',  requiredPermission: 'payments:view'   },
            { key: 'payments.transactions', label: 'Transactions',    path: '/payments/transactions', icon: 'Receipt',     requiredPermission: 'payments:view'   },
            { key: 'payments.settlements',  label: 'Settlements',     path: '/payments/settlements',  icon: 'DollarSign',  requiredPermission: 'payments:manage' },
        ],
    },
    {
        key: 'documents', label: 'Documents', labelLao: 'ເອກະສານ',
        icon: 'FileText', requiredPermission: 'documents:view',
        children: [
            { key: 'documents.receipts',    label: 'Receipts',       path: '/documents',              icon: 'Receipt',         requiredPermission: 'documents:view'   },
            { key: 'documents.design',      label: 'Receipt Design', path: '/documents/design',       icon: 'Printer',         requiredPermission: 'documents:update' },
            { key: 'documents.invoices',    label: 'Invoices',       path: '/documents/invoices',     icon: 'FileText',        requiredPermission: 'documents:view'   },
            { key: 'documents.tax-invoices',label: 'Tax Invoices',   path: '/documents/tax-invoices', icon: 'FileSpreadsheet', requiredPermission: 'documents:view'   },
        ],
    },
    {
        key: 'reports', label: 'Reports', labelLao: 'ລາຍງານ',
        icon: 'BarChart3', requiredPermission: 'reports:view',
        children: [
            { key: 'reports.sales',          label: 'Sales Report',       path: '/reports',                    icon: 'BarChart3',    requiredPermission: 'reports:view'      },
            { key: 'reports.products',       label: 'Product Report',     path: '/reports/products',           icon: 'Package',      requiredPermission: 'reports:view'      },
            { key: 'reports.inventory',      label: 'Inventory Report',   path: '/reports/inventory',          icon: 'Boxes',        requiredPermission: 'reports:view'      },
            { key: 'reports.financial',      label: 'Financial Report',   path: '/reports/financial',          icon: 'DollarSign',   requiredPermission: 'reports:view'      },
            { key: 'reports.staff',          label: 'Staff Report',       path: '/reports/staff',              icon: 'UserCog',      requiredPermission: 'reports:view'      },
            { key: 'reports.customers',      label: 'Members Report',     path: '/reports/customers',          icon: 'Users',        requiredPermission: 'reports:view'      },
            { key: 'reports.promotions',     label: 'Promotions Report',  path: '/reports/promotions',         icon: 'Gift',         requiredPermission: 'reports:view'      },
            { key: 'reports.period-compare', label: 'Period Compare',     path: '/reports/period-compare',     icon: 'CalendarRange',requiredPermission: 'reports:view'      },
            { key: 'reports.branch-compare', label: 'Branch Compare',     path: '/reports/branch-compare',     icon: 'GitCompare',   requiredPermission: 'reports:view'      },
            { key: 'reports.gl',             label: 'GL / Finance & Compliance', path: '/reports/gl',          icon: 'BookOpen',     requiredPermission: 'reports:financial' },
        ],
    },
    {
        key: 'management', label: 'Management', labelLao: 'ຈັດການ',
        icon: 'Building2', requiredPermission: 'staff:view',
        children: [
            { key: 'management.branches',       label: 'Branches',        path: '/branches',                   icon: 'Building2',  requiredPermission: 'branches:view' },
            { key: 'management.stores',         label: 'Stores',          path: '/management/stores',          icon: 'Store',      requiredPermission: 'stores:view'   },
            { key: 'management.staff',          label: 'Staff',           path: '/staff',                      icon: 'UserCog',    requiredPermission: 'staff:view'    },
            { key: 'management.roles',          label: 'Roles',           path: '/staff/roles',                icon: 'Shield',     requiredPermission: 'roles:view'    },
            { key: 'management.cashregisters',  label: 'Cash Registers',  path: '/management/cashregisters',   icon: 'Monitor',    requiredPermission: 'stores:view'   },
            { key: 'management.shifts',         label: 'Shifts',          path: '/staff/shifts',               icon: 'Timer',      requiredPermission: 'staff:view'    },
        ],
    },
    {
        key: 'settings', label: 'Settings', labelLao: 'ຕັ້ງຄ່າ',
        icon: 'Settings', requiredPermission: 'settings:view',
        children: [
            { key: 'settings.general',       label: 'General',       path: '/settings',                   icon: 'Settings',   requiredPermission: 'settings:view'   },
            { key: 'settings.display',       label: 'Display',       path: '/settings/display',           icon: 'Monitor',    requiredPermission: 'settings:view'   },
            { key: 'settings.receipt',       label: 'Receipt',       path: '/settings/receipt',           icon: 'Receipt',    requiredPermission: 'settings:view'   },
            { key: 'settings.tax',           label: 'Tax',           path: '/settings/tax',               icon: 'Percent',    requiredPermission: 'settings:update' },
            { key: 'settings.payments',      label: 'Payments',      path: '/settings/payments',          icon: 'CreditCard', requiredPermission: 'settings:update' },
            { key: 'settings.printers',      label: 'Printers',      path: '/settings/printers',          icon: 'Printer',    requiredPermission: 'settings:update' },
            { key: 'settings.notifications', label: 'Notifications', path: '/settings/notifications',     icon: 'Bell',       requiredPermission: 'settings:view'   },
        ],
    },
    {
        key: 'admin', label: 'Super Admin',
        icon: 'ShieldCheck', requiredPermission: 'admin:view',
        children: [
            { key: 'admin.dashboard',   label: 'Admin Dashboard',  path: '/admin',              icon: 'Shield',      requiredPermission: 'admin:view'   },
            { key: 'admin.requests',    label: 'Store Requests',   path: '/admin/requests',     icon: 'FileCheck',   requiredPermission: 'admin:view'   },
            { key: 'admin.stores',      label: 'Stores Overview',  path: '/admin/stores',       icon: 'Store',       requiredPermission: 'admin:view'   },
            { key: 'admin.branches',    label: 'All Branches',     path: '/admin/branches',     icon: 'Building2',   requiredPermission: 'admin:view'   },
            { key: 'admin.users',       label: 'All Users',        path: '/admin/users',        icon: 'Users',       requiredPermission: 'admin:view'   },
            { key: 'admin.roles',       label: 'System Roles',     path: '/admin/roles',        icon: 'Key',         requiredPermission: 'admin:manage' },
            { key: 'admin.rules',       label: 'Rules',            path: '/admin/rules',        icon: 'ShieldCheck', requiredPermission: 'admin:manage' },
            { key: 'admin.permissions', label: 'Permissions',      path: '/admin/permissions',  icon: 'Shield',      requiredPermission: 'admin:manage' },
            { key: 'admin.audit',       label: 'Audit Log',        path: '/admin/audit',        icon: 'History',     requiredPermission: 'admin:view'   },
        ],
    },
];

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n┌─────────────────────────────────────────────┐');
    console.log('│       KPOS  —  Production Seed              │');
    console.log('└─────────────────────────────────────────────┘\n');

    // 1. Roles
    console.log(`Seeding ${DEFAULT_ROLES.length} system roles…`);
    const roleMap: Record<string, Row> = {};
    for (const role of DEFAULT_ROLES) {
        roleMap[role.name] = await ensureRole(role);
        process.stdout.write(`  ✓ ${role.name.padEnd(20)} ${role.displayName}\n`);
    }

    // 2. Rules
    console.log(`\nSeeding ${DEFAULT_RULES.length} system rules…`);
    const ruleMap: Record<string, Row> = {};
    for (const rule of DEFAULT_RULES) {
        ruleMap[rule.name] = await ensureRule(rule);
        process.stdout.write(`  ✓ ${rule.name.padEnd(25)} ${rule.displayName}\n`);
    }

    // 3. Role-rule mappings
    console.log('\nSeeding role-rule mappings…');
    let mappingCount = 0;
    for (const [roleName, entries] of Object.entries(DEFAULT_ROLE_RULES)) {
        const role = roleMap[roleName];
        if (!role) { console.warn(`  ⚠  Role '${roleName}' not in roleMap – skipping`); continue; }
        for (const [ruleName, flags] of Object.entries(entries)) {
            const rule = ruleMap[ruleName];
            if (!rule) { console.warn(`  ⚠  Rule '${ruleName}' not in ruleMap – skipping`); continue; }
            await ensureRoleRule({ roleId: role.id, ruleId: rule.id, flags });
            mappingCount++;
        }
    }
    console.log(`  ✓ ${mappingCount} role-rule rows upserted`);

    // 4. Menu
    console.log('\nSeeding menu tree…');
    const totalMenuItems = (items: MenuItem[]): number =>
        items.reduce((n, i) => n + 1 + totalMenuItems(i.children ?? []), 0);
    await seedMenu(MENU_STRUCTURE);
    console.log(`  ✓ ${totalMenuItems(MENU_STRUCTURE)} menu items upserted`);

    // 5. Super admin
    console.log('\nSeeding superadmin user…');
    const saRole = roleMap['super_admin'];
    if (!saRole) throw new Error("'super_admin' role not found after seeding – this should not happen");
    const sa = await ensureSuperAdmin(saRole.id);
    console.log(`  ✓ ${sa.email}  (id: ${sa.id})`);

    // Summary
    console.log('\n┌─────────────────────────────────────────────┐');
    console.log('│  Production seed completed successfully ✅   │');
    console.log('└─────────────────────────────────────────────┘');
    console.log(`
  Roles    : ${DEFAULT_ROLES.length}
  Rules    : ${DEFAULT_RULES.length}
  Mappings : ${mappingCount}
  Menu     : ${totalMenuItems(MENU_STRUCTURE)} items
  User     : ${SUPER_ADMIN_EMAIL}

  ⚠  Password is set from env SEED_ADMIN_PASSWORD.
     Change it immediately after first login in production.
`);
}

main()
    .catch((err) => {
        console.error('\n❌  Production seed failed\n', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await sql.end({ timeout: 5 });
    });
