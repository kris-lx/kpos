// KPOS - Database Seed Script
// Current-schema, idempotent demo seed.
//
// Run:
//   npm run db:seed
//   npm run db:seed:demo

import 'dotenv/config';
import postgres from 'postgres';
import argon2 from 'argon2';
import { DEFAULT_ROLES, DEFAULT_RULES, DEFAULT_ROLE_RULES } from '../shared/defaultAccessControl';
import { permissionsToMask } from '../infrastructure/permissions';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@kpos.la';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123456';
const SUPER_ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Super Admin';
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || 'Demo@123456';

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

const now = () => new Date();
const daysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
};
const daysFromNow = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
};

function first<T extends Row>(rows: T[]): T {
    if (!rows[0]) throw new Error('Expected row but got none');
    return rows[0];
}

function optional<T extends Row>(rows: T[]): T | null {
    return rows[0] ?? null;
}

async function ensureTenant() {
    const existing = optional(await sql`
        select * from tenants where code = 'KPOS' limit 1
    `);
    const values = {
        name: 'KPOS Demo Merchant',
        logo: null,
        businessType: 'retail',
        taxId: 'LA-TAX-0001',
        phone: '020-5555-0000',
        email: 'demo@kpos.la',
        address: 'Vientiane, Laos',
        plan: 'enterprise',
        isActive: true,
        status: 'active',
        settings: sql.json({ currency: 'LAK', language: 'lo', timezone: 'Asia/Vientiane' }),
    };

    if (existing) {
        return first(await sql`
            update tenants set
                name = ${values.name},
                logo = ${values.logo},
                business_type = ${values.businessType},
                tax_id = ${values.taxId},
                phone = ${values.phone},
                email = ${values.email},
                address = ${values.address},
                plan = ${values.plan},
                is_active = ${values.isActive},
                status = ${values.status},
                settings = ${values.settings},
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }

    return first(await sql`
        insert into tenants (
            name, code, logo, business_type, tax_id, phone, email, address,
            plan, is_active, status, settings
        ) values (
            ${values.name}, 'KPOS', ${values.logo}, ${values.businessType}, ${values.taxId},
            ${values.phone}, ${values.email}, ${values.address}, ${values.plan},
            ${values.isActive}, ${values.status}, ${values.settings}
        )
        returning *
    `);
}

async function ensureBranch(input: {
    tenantId: string;
    parentBranchId?: string | null;
    name: string;
    code: string;
    address: string;
    phone: string;
    email: string;
    isMain?: boolean;
}) {
    const existing = optional(await sql`
        select * from branches where tenant_id = ${input.tenantId} and code = ${input.code} limit 1
    `);
    const path = input.parentBranchId ? `${input.parentBranchId}/${input.code}` : input.code;
    if (existing) {
        return first(await sql`
            update branches set
                parent_branch_id = ${input.parentBranchId ?? null},
                branch_path = ${path},
                name = ${input.name},
                address = ${input.address},
                phone = ${input.phone},
                email = ${input.email},
                is_main = ${!!input.isMain},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into branches (
            tenant_id, parent_branch_id, branch_path, name, code, address,
            phone, email, is_main, is_active
        ) values (
            ${input.tenantId}, ${input.parentBranchId ?? null}, ${path}, ${input.name},
            ${input.code}, ${input.address}, ${input.phone}, ${input.email},
            ${!!input.isMain}, true
        )
        returning *
    `);
}

async function ensureStore(input: {
    tenantId: string;
    branchId: string;
    name: string;
    code: string;
    address: string;
    phone: string;
    email: string;
    description: string;
    isDefault?: boolean;
}) {
    const existing = optional(await sql`
        select * from stores where tenant_id = ${input.tenantId} and code = ${input.code} limit 1
    `);
    if (existing) {
        return first(await sql`
            update stores set
                branch_id = ${input.branchId},
                name = ${input.name},
                address = ${input.address},
                phone = ${input.phone},
                email = ${input.email},
                description = ${input.description},
                is_default = ${!!input.isDefault},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into stores (
            tenant_id, branch_id, name, code, address, phone, email,
            description, is_default, is_active, settings
        ) values (
            ${input.tenantId}, ${input.branchId}, ${input.name}, ${input.code},
            ${input.address}, ${input.phone}, ${input.email}, ${input.description},
            ${!!input.isDefault}, true, ${sql.json({ receiptLanguage: 'lo' })}
        )
        returning *
    `);
}

async function ensureRole(role: (typeof DEFAULT_ROLES)[number]) {
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
                description = ${role.description},
                permissions = ${role.permissions},
                is_system = ${role.isSystem},
                mask_low = ${mask.low.toString()},
                mask_high = ${mask.high.toString()},
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into roles (
            tenant_id, branch_id, name, display_name, description, permissions,
            is_system, mask_low, mask_high
        ) values (
            null, null, ${role.name}, ${role.displayName}, ${role.description},
            ${role.permissions}, ${role.isSystem}, ${mask.low.toString()}, ${mask.high.toString()}
        )
        returning *
    `);
}

async function ensureBranchRole(input: {
    tenantId: string;
    branchId: string;
    name: string;
    displayName: string;
    description: string;
    permissions: string[];
}) {
    const existing = optional(await sql`
        select * from roles
        where tenant_id = ${input.tenantId} and branch_id = ${input.branchId} and name = ${input.name}
        limit 1
    `);
    const mask = permissionsToMask(input.permissions);
    if (existing) {
        return first(await sql`
            update roles set
                display_name = ${input.displayName},
                description = ${input.description},
                permissions = ${input.permissions},
                is_system = false,
                mask_low = ${mask.low.toString()},
                mask_high = ${mask.high.toString()},
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into roles (
            tenant_id, branch_id, name, display_name, description, permissions,
            is_system, mask_low, mask_high
        ) values (
            ${input.tenantId}, ${input.branchId}, ${input.name}, ${input.displayName},
            ${input.description}, ${input.permissions}, false,
            ${mask.low.toString()}, ${mask.high.toString()}
        )
        returning *
    `);
}

async function ensureRule(rule: (typeof DEFAULT_RULES)[number]) {
    const existing = optional(await sql`
        select * from rules where tenant_id is null and name = ${rule.name} limit 1
    `);
    if (existing) {
        return first(await sql`
            update rules set
                display_name = ${rule.displayName},
                description = ${rule.description},
                module = ${rule.module},
                icon = ${rule.icon},
                routes = ${rule.routes},
                permissions = ${rule.permissions},
                "order" = ${rule.order},
                is_active = true,
                is_system = ${rule.isSystem},
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into rules (
            tenant_id, name, display_name, description, module, icon, routes,
            permissions, "order", is_active, is_system
        ) values (
            null, ${rule.name}, ${rule.displayName}, ${rule.description}, ${rule.module},
            ${rule.icon}, ${rule.routes}, ${rule.permissions}, ${rule.order}, true, ${rule.isSystem}
        )
        returning *
    `);
}

async function ensureRoleRule(input: {
    roleId: string;
    ruleId: string;
    flags: { r: boolean; c: boolean; u: boolean; d: boolean };
}) {
    const existing = optional(await sql`
        select * from role_rules where role_id = ${input.roleId} and rule_id = ${input.ruleId} limit 1
    `);
    if (existing) {
        await sql`
            update role_rules set
                can_read = ${input.flags.r},
                can_create = ${input.flags.c},
                can_update = ${input.flags.u},
                can_delete = ${input.flags.d}
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into role_rules (
            tenant_id, role_id, rule_id, can_read, can_create, can_update, can_delete
        ) values (
            null, ${input.roleId}, ${input.ruleId},
            ${input.flags.r}, ${input.flags.c}, ${input.flags.u}, ${input.flags.d}
        )
    `;
}

async function ensureUser(input: {
    tenantId: string | null;
    branchId: string | null;
    email: string;
    password: string;
    name: string;
    phone?: string;
    roleName: string;
    roleId: string;
    permissions?: string[];
    isSuperAdmin?: boolean;
}) {
    const existing = optional(await sql`
        select * from users
        where tenant_id is not distinct from ${input.tenantId} and email = ${input.email}
        limit 1
    `);
    const passwordHash = await argon2.hash(input.password);
    const permissions = input.permissions ?? [];
    if (existing) {
        return first(await sql`
            update users set
                tenant_id = ${input.tenantId},
                branch_id = ${input.branchId},
                password = ${passwordHash},
                name = ${input.name},
                phone = ${input.phone ?? null},
                role = ${input.roleName},
                role_id = ${input.roleId},
                permissions = ${permissions},
                is_active = true,
                is_super_admin = ${!!input.isSuperAdmin},
                email_verified = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into users (
            tenant_id, branch_id, email, password, name, phone, role, role_id,
            permissions, is_active, is_super_admin, email_verified
        ) values (
            ${input.tenantId}, ${input.branchId}, ${input.email}, ${passwordHash},
            ${input.name}, ${input.phone ?? null}, ${input.roleName}, ${input.roleId},
            ${permissions}, true, ${!!input.isSuperAdmin}, true
        )
        returning *
    `);
}

async function ensureUserStore(input: {
    tenantId: string;
    userId: string;
    storeId: string;
    branchId: string;
    isDefault?: boolean;
    canManage?: boolean;
}) {
    const existing = optional(await sql`
        select * from user_stores where user_id = ${input.userId} and store_id = ${input.storeId} limit 1
    `);
    if (existing) {
        await sql`
            update user_stores set
                tenant_id = ${input.tenantId},
                branch_id = ${input.branchId},
                is_default = ${!!input.isDefault},
                can_read = true,
                can_write = true,
                can_delete = ${!!input.canManage},
                can_manage = ${!!input.canManage},
                updated_at = now()
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into user_stores (
            tenant_id, user_id, store_id, branch_id, is_default,
            can_read, can_write, can_delete, can_manage
        ) values (
            ${input.tenantId}, ${input.userId}, ${input.storeId}, ${input.branchId},
            ${!!input.isDefault}, true, true, ${!!input.canManage}, ${!!input.canManage}
        )
    `;
}

async function ensureMenuItem(item: MenuItem, parentId: string | null, order: number): Promise<Row> {
    const existing = optional(await sql`
        select * from menu_permissions where key = ${item.key} limit 1
    `);
    if (existing) {
        return first(await sql`
            update menu_permissions set
                label = ${item.label},
                label_lao = ${item.labelLao ?? null},
                icon = ${item.icon ?? null},
                path = ${item.path ?? null},
                parent_id = ${parentId},
                required_permission = ${item.requiredPermission ?? null},
                "order" = ${order},
                is_active = true,
                updated_at = now()
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

async function seedMenu(items: MenuItem[], parentId: string | null = null) {
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const row = await ensureMenuItem(item, parentId, i);
        if (item.children?.length) await seedMenu(item.children, row.id);
    }
}

async function ensurePaymentMethod(tenantId: string, pm: Row) {
    const existing = optional(await sql`
        select * from payment_methods where tenant_id = ${tenantId} and code = ${pm.code} limit 1
    `);
    if (existing) {
        return first(await sql`
            update payment_methods set
                name = ${pm.name},
                type = ${pm.type},
                icon = ${pm.icon},
                is_default = ${!!pm.isDefault},
                is_active = true,
                sort_order = ${pm.sortOrder},
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into payment_methods (
            tenant_id, name, code, type, icon, is_default, is_active, sort_order
        ) values (
            ${tenantId}, ${pm.name}, ${pm.code}, ${pm.type}, ${pm.icon},
            ${!!pm.isDefault}, true, ${pm.sortOrder}
        )
        returning *
    `);
}

async function ensureEnum(row: Row) {
    const existing = optional(await sql`
        select * from system_enums where type = ${row.type} and value = ${row.value} limit 1
    `);
    if (existing) {
        await sql`
            update system_enums set
                label = ${row.label},
                label_lao = ${row.labelLao ?? null},
                "order" = ${row.order},
                is_active = true,
                is_system = true,
                updated_at = now()
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into system_enums (type, value, label, label_lao, "order", is_active, is_system)
        values (${row.type}, ${row.value}, ${row.label}, ${row.labelLao ?? null}, ${row.order}, true, true)
    `;
}

async function ensureSetting(input: {
    tenantId: string;
    category: string;
    key: string;
    value: postgres.JSONValue;
    branchId?: string | null;
    storeId?: string | null;
}) {
    const branchId = input.branchId ?? null;
    const storeId = input.storeId ?? null;
    const existing = optional(await sql`
        select * from settings
        where tenant_id = ${input.tenantId}
          and category = ${input.category}
          and key = ${input.key}
          and branch_id is not distinct from ${branchId}
          and store_id is not distinct from ${storeId}
        limit 1
    `);
    if (existing) {
        await sql`
            update settings set value = ${sql.json(input.value)}, updated_at = now()
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into settings (tenant_id, category, key, value, branch_id, store_id)
        values (${input.tenantId}, ${input.category}, ${input.key}, ${sql.json(input.value)}, ${branchId}, ${storeId})
    `;
}

async function ensureVendor(tenantId: string, input: Row) {
    const existing = optional(await sql`
        select * from vendors where tenant_id = ${tenantId} and code = ${input.code} limit 1
    `);
    if (existing) {
        return first(await sql`
            update vendors set
                name = ${input.name},
                contact_name = ${input.contactName},
                email = ${input.email},
                phone = ${input.phone},
                address = ${input.address},
                payment_terms = ${input.paymentTerms},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into vendors (
            tenant_id, name, code, contact_name, email, phone, address, payment_terms, is_active
        ) values (
            ${tenantId}, ${input.name}, ${input.code}, ${input.contactName},
            ${input.email}, ${input.phone}, ${input.address}, ${input.paymentTerms}, true
        )
        returning *
    `);
}

async function ensureCategory(input: Row) {
    const existing = optional(await sql`
        select * from categories where tenant_id = ${input.tenantId} and slug = ${input.slug} limit 1
    `);
    if (existing) {
        return first(await sql`
            update categories set
                name = ${input.name},
                description = ${input.description ?? null},
                store_id = ${input.storeId ?? null},
                sort_order = ${input.sortOrder ?? 0},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into categories (
            tenant_id, name, slug, description, store_id, sort_order, is_active
        ) values (
            ${input.tenantId}, ${input.name}, ${input.slug}, ${input.description ?? null},
            ${input.storeId ?? null}, ${input.sortOrder ?? 0}, true
        )
        returning *
    `);
}

async function ensureProduct(input: Row) {
    const existing = optional(await sql`
        select * from products where tenant_id = ${input.tenantId} and sku = ${input.sku} limit 1
    `);
    if (existing) {
        return first(await sql`
            update products set
                name = ${input.name},
                description = ${input.description},
                barcode = ${input.barcode ?? null},
                category_id = ${input.categoryId},
                vendor_id = ${input.vendorId ?? null},
                branch_id = ${input.branchId},
                price = ${input.price},
                cost = ${input.cost},
                unit = ${input.unit},
                is_active = true,
                is_vat = ${input.isVat},
                vat_rate = ${input.vatRate},
                track_stock = ${input.trackStock},
                low_stock_threshold = ${input.lowStockThreshold},
                tags = ${input.tags ?? []},
                attributes = ${sql.json(input.attributes ?? {})},
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into products (
            tenant_id, name, description, sku, barcode, category_id, vendor_id,
            branch_id, price, cost, unit, is_active, is_vat, vat_rate,
            track_stock, low_stock_threshold, tags, attributes
        ) values (
            ${input.tenantId}, ${input.name}, ${input.description}, ${input.sku},
            ${input.barcode ?? null}, ${input.categoryId}, ${input.vendorId ?? null},
            ${input.branchId}, ${input.price}, ${input.cost}, ${input.unit}, true,
            ${input.isVat}, ${input.vatRate}, ${input.trackStock},
            ${input.lowStockThreshold}, ${input.tags ?? []}, ${sql.json(input.attributes ?? {})}
        )
        returning *
    `);
}

async function ensureProductStore(input: Row) {
    const existing = optional(await sql`
        select * from product_stores where product_id = ${input.productId} and store_id = ${input.storeId} limit 1
    `);
    if (existing) {
        await sql`
            update product_stores set
                tenant_id = ${input.tenantId},
                is_active = true,
                price = ${input.price},
                stock = ${input.stock},
                min_stock = ${input.minStock},
                updated_at = now()
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into product_stores (tenant_id, product_id, store_id, is_active, price, stock, min_stock)
        values (${input.tenantId}, ${input.productId}, ${input.storeId}, true, ${input.price}, ${input.stock}, ${input.minStock})
    `;
}

async function ensureInventory(input: Row) {
    const existing = optional(await sql`
        select * from inventory
        where tenant_id = ${input.tenantId}
          and product_id = ${input.productId}
          and branch_id = ${input.branchId}
          and store_id is not distinct from ${input.storeId ?? null}
          and sku_variant_id is null
          and batch_number is not distinct from ${input.batchNumber ?? null}
        limit 1
    `);
    if (existing) {
        await sql`
            update inventory set
                quantity = ${input.quantity},
                reserved = 0,
                available = ${input.quantity},
                location = ${input.location},
                expiry_date = ${input.expiryDate ?? null},
                updated_at = now()
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into inventory (
            tenant_id, product_id, branch_id, store_id, quantity, reserved,
            available, location, batch_number, expiry_date
        ) values (
            ${input.tenantId}, ${input.productId}, ${input.branchId}, ${input.storeId ?? null},
            ${input.quantity}, 0, ${input.quantity}, ${input.location},
            ${input.batchNumber ?? null}, ${input.expiryDate ?? null}
        )
    `;
}

async function ensurePriceLevel(tenantId: string, name: string, isDefault = false) {
    const existing = optional(await sql`
        select * from price_levels where tenant_id = ${tenantId} and name = ${name} limit 1
    `);
    if (existing) {
        return first(await sql`
            update price_levels set is_default = ${isDefault}, updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into price_levels (tenant_id, name, description, is_default)
        values (${tenantId}, ${name}, ${`${name} pricing`}, ${isDefault})
        returning *
    `);
}

async function ensureProductPriceLevel(tenantId: string, productId: string, priceLevelId: string, price: number) {
    const existing = optional(await sql`
        select * from product_price_levels where product_id = ${productId} and price_level_id = ${priceLevelId} limit 1
    `);
    if (existing) {
        await sql`
            update product_price_levels set tenant_id = ${tenantId}, price = ${price}
            where id = ${existing.id}
        `;
        return;
    }
    await sql`
        insert into product_price_levels (tenant_id, product_id, price_level_id, price)
        values (${tenantId}, ${productId}, ${priceLevelId}, ${price})
    `;
}

async function ensureSkuVariant(input: Row) {
    const existing = optional(await sql`
        select * from sku_variants where tenant_id = ${input.tenantId} and sku = ${input.sku} limit 1
    `);
    if (existing) {
        return first(await sql`
            update sku_variants set
                product_id = ${input.productId},
                barcode = ${input.barcode ?? null},
                name = ${input.name},
                attributes = ${sql.json(input.attributes)},
                price = ${input.price},
                cost = ${input.cost},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into sku_variants (
            tenant_id, product_id, sku, barcode, name, attributes, price, cost, is_active
        ) values (
            ${input.tenantId}, ${input.productId}, ${input.sku}, ${input.barcode ?? null},
            ${input.name}, ${sql.json(input.attributes)}, ${input.price}, ${input.cost}, true
        )
        returning *
    `);
}

async function ensureCustomer(input: Row) {
    const existing = optional(await sql`
        select * from customers where tenant_id = ${input.tenantId} and phone = ${input.phone} limit 1
    `);
    if (existing) {
        return first(await sql`
            update customers set
                member_code = ${input.memberCode},
                name = ${input.name},
                email = ${input.email},
                points = ${input.points},
                total_spent = ${input.totalSpent},
                visit_count = ${input.visitCount},
                branch_id = ${input.branchId},
                store_id = ${input.storeId},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into customers (
            tenant_id, member_code, name, email, phone, points, total_spent,
            visit_count, branch_id, store_id, is_active
        ) values (
            ${input.tenantId}, ${input.memberCode}, ${input.name}, ${input.email},
            ${input.phone}, ${input.points}, ${input.totalSpent}, ${input.visitCount},
            ${input.branchId}, ${input.storeId}, true
        )
        returning *
    `);
}

async function ensureMember(input: Row) {
    const existing = optional(await sql`
        select * from members where tenant_id = ${input.tenantId} and phone = ${input.phone} limit 1
    `);
    if (existing) {
        return first(await sql`
            update members set
                card_number = ${input.cardNumber},
                first_name = ${input.firstName},
                last_name = ${input.lastName},
                email = ${input.email},
                tier_id = ${input.tierId},
                points = ${input.points},
                total_spent = ${input.totalSpent},
                visit_count = ${input.visitCount},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into members (
            tenant_id, card_number, first_name, last_name, email, phone,
            tier_id, points, total_spent, visit_count, is_active
        ) values (
            ${input.tenantId}, ${input.cardNumber}, ${input.firstName}, ${input.lastName},
            ${input.email}, ${input.phone}, ${input.tierId}, ${input.points},
            ${input.totalSpent}, ${input.visitCount}, true
        )
        returning *
    `);
}

async function ensureMembershipTier(input: Row) {
    const existing = optional(await sql`
        select * from membership_tiers where tenant_id = ${input.tenantId} and name = ${input.name} limit 1
    `);
    if (existing) {
        return first(await sql`
            update membership_tiers set
                min_points = ${input.minPoints},
                point_multiplier = ${input.pointMultiplier},
                discount_percent = ${input.discountPercent},
                benefits = ${sql.json(input.benefits ?? [])},
                color = ${input.color},
                sort_order = ${input.sortOrder},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into membership_tiers (
            tenant_id, name, min_points, point_multiplier, discount_percent,
            benefits, color, sort_order, is_active
        ) values (
            ${input.tenantId}, ${input.name}, ${input.minPoints}, ${input.pointMultiplier},
            ${input.discountPercent}, ${sql.json(input.benefits ?? [])},
            ${input.color}, ${input.sortOrder}, true
        )
        returning *
    `);
}

async function ensureByTenantColumn(
    table: string,
    column: string,
    tenantId: string,
    value: string,
    insertSql: () => Promise<Row[]>,
) {
    const existing = optional(await sql.unsafe(`select * from ${table} where tenant_id = $1 and ${column} = $2 limit 1`, [tenantId, value]));
    if (existing) return existing;
    return first(await insertSql());
}

async function ensureCashRegister(input: Row) {
    const existing = optional(await sql`
        select * from cash_registers
        where tenant_id = ${input.tenantId} and branch_id = ${input.branchId} and name = ${input.name}
        limit 1
    `);
    if (existing) {
        return first(await sql`
            update cash_registers set
                store_id = ${input.storeId},
                is_active = true,
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into cash_registers (tenant_id, branch_id, store_id, name, is_active)
        values (${input.tenantId}, ${input.branchId}, ${input.storeId}, ${input.name}, true)
        returning *
    `);
}

async function ensureShift(input: Row) {
    const existing = optional(await sql`
        select * from shifts where tenant_id = ${input.tenantId} and shift_no = ${input.shiftNo} limit 1
    `);
    if (existing) {
        return first(await sql`
            update shifts set
                branch_id = ${input.branchId},
                store_id = ${input.storeId},
                user_id = ${input.userId},
                register_id = ${input.registerId},
                opening_balance = ${input.openingBalance},
                closing_balance = ${input.closingBalance},
                expected_balance = ${input.expectedBalance},
                difference = ${input.difference},
                status = ${input.status},
                opened_at = ${input.openedAt},
                closed_at = ${input.closedAt},
                updated_at = now()
            where id = ${existing.id}
            returning *
        `);
    }
    return first(await sql`
        insert into shifts (
            tenant_id, shift_no, branch_id, store_id, user_id, register_id,
            opening_balance, closing_balance, expected_balance, difference,
            status, opened_at, closed_at
        ) values (
            ${input.tenantId}, ${input.shiftNo}, ${input.branchId}, ${input.storeId},
            ${input.userId}, ${input.registerId}, ${input.openingBalance},
            ${input.closingBalance}, ${input.expectedBalance}, ${input.difference},
            ${input.status}, ${input.openedAt}, ${input.closedAt}
        )
        returning *
    `);
}

async function ensureTransaction(input: Row) {
    const existing = optional(await sql`
        select * from transactions where tenant_id = ${input.tenantId} and transaction_no = ${input.transactionNo} limit 1
    `);
    if (existing) return existing;
    return first(await sql`
        insert into transactions (
            tenant_id, transaction_no, type, status, branch_id, store_id, user_id,
            shift_id, member_id, customer_id, order_type, subtotal, discount_value,
            discount_amount, tax_amount, total, received, change, points_earned,
            created_at, updated_at
        ) values (
            ${input.tenantId}, ${input.transactionNo}, 'SALE', 'COMPLETED',
            ${input.branchId}, ${input.storeId}, ${input.userId}, ${input.shiftId},
            ${input.memberId ?? null}, ${input.customerId ?? null}, 'WALKIN',
            ${input.subtotal}, ${input.discountValue}, ${input.discountAmount},
            ${input.taxAmount}, ${input.total}, ${input.received}, ${input.change},
            ${input.pointsEarned}, ${input.createdAt}, ${input.createdAt}
        )
        returning *
    `);
}

const MENU_STRUCTURE: MenuItem[] = [
    { key: 'dashboard', label: 'Dashboard', labelLao: 'ແຜງຄວບຄຸມ', icon: 'LayoutDashboard', path: '/dashboard', requiredPermission: 'dashboard:view' },
    { key: 'sales', label: 'Sales', labelLao: 'ຂາຍ', icon: 'ShoppingCart', requiredPermission: 'sales:create', children: [
        { key: 'sales.pos', label: 'POS', labelLao: 'ຂາຍ POS', icon: 'ShoppingCart', path: '/pos', requiredPermission: 'sales:create' },
        { key: 'sales.credit', label: 'Credit Sales', labelLao: 'ຂາຍເຊື່ອ', icon: 'CreditCard', path: '/pos/credit', requiredPermission: 'sales:create' },
        { key: 'sales.held', label: 'Held Orders', labelLao: 'ບິນພັກ', icon: 'ClipboardList', path: '/pos/held', requiredPermission: 'sales:create' },
    ] },
    { key: 'products', label: 'Products', labelLao: 'ສິນຄ້າ', icon: 'Package', requiredPermission: 'products:view', children: [
        { key: 'products.list', label: 'Product List', labelLao: 'ລາຍການສິນຄ້າ', icon: 'Package', path: '/products', requiredPermission: 'products:view' },
        { key: 'products.categories', label: 'Categories', labelLao: 'ໝວດໝູ່', icon: 'Tags', path: '/categories', requiredPermission: 'categories:view' },
        { key: 'products.barcode', label: 'Barcode / QR', icon: 'Barcode', path: '/barcode', requiredPermission: 'products:view' },
        { key: 'products.sku', label: 'SKU / Variants', icon: 'Layers', path: '/products/sku', requiredPermission: 'products:view' },
        { key: 'products.pricing', label: 'Pricing Levels', icon: 'DollarSign', path: '/products/pricing', requiredPermission: 'products:update' },
    ] },
    { key: 'inventory', label: 'Inventory', labelLao: 'ສາງ', icon: 'Boxes', requiredPermission: 'inventory:view', children: [
        { key: 'inventory.stock', label: 'Stock', path: '/inventory', icon: 'Boxes', requiredPermission: 'inventory:view' },
        { key: 'inventory.stockin', label: 'Stock In', path: '/inventory/stockin', icon: 'TrendingUp', requiredPermission: 'inventory:create' },
        { key: 'inventory.stockout', label: 'Stock Out', path: '/inventory/stockout', icon: 'TrendingDown', requiredPermission: 'inventory:create' },
        { key: 'inventory.adjust', label: 'Stock Adjust', path: '/inventory/adjust', icon: 'Scale', requiredPermission: 'inventory:update' },
        { key: 'inventory.transfer', label: 'Stock Transfer', path: '/inventory/transfer', icon: 'ArrowRightLeft', requiredPermission: 'inventory:update' },
        { key: 'inventory.count', label: 'Stock Count', path: '/inventory/count', icon: 'ClipboardCheck', requiredPermission: 'inventory:update' },
        { key: 'inventory.purchase-orders', label: 'Purchase Orders', path: '/inventory/purchase-orders', icon: 'ClipboardList', requiredPermission: 'inventory:create' },
        { key: 'inventory.vendors', label: 'Vendors', path: '/inventory/vendors', icon: 'Truck', requiredPermission: 'inventory:view' },
        { key: 'inventory.expiry', label: 'Expiry Tracking', path: '/inventory/expiry', icon: 'CalendarClock', requiredPermission: 'inventory:view' },
    ] },
    { key: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ', icon: 'UtensilsCrossed', requiredPermission: 'restaurant:view', children: [
        { key: 'restaurant.tables', label: 'Tables', path: '/restaurant/tables', icon: 'UtensilsCrossed', requiredPermission: 'restaurant:view' },
        { key: 'restaurant.orders', label: 'Orders', path: '/restaurant/orders', icon: 'ClipboardList', requiredPermission: 'restaurant:view' },
        { key: 'restaurant.kitchen', label: 'Kitchen (KDS)', path: '/restaurant/kitchen', icon: 'ChefHat', requiredPermission: 'restaurant:manage' },
        { key: 'restaurant.reservations', label: 'Reservations', path: '/restaurant/reservations', icon: 'CalendarClock', requiredPermission: 'restaurant:view' },
        { key: 'restaurant.emenu', label: 'e-Menu', path: '/restaurant/e-menu', icon: 'QrCode', requiredPermission: 'restaurant:view' },
    ] },
    { key: 'promotions', label: 'Promotions', labelLao: 'ໂປຣໂມຊັ່ນ', icon: 'Gift', requiredPermission: 'promotions:view', children: [
        { key: 'promotions.list', label: 'Promotions', path: '/promotions', icon: 'Gift', requiredPermission: 'promotions:view' },
        { key: 'promotions.coupons', label: 'Coupons', path: '/promotions/coupons', icon: 'TicketPercent', requiredPermission: 'promotions:view' },
        { key: 'promotions.discounts', label: 'Discounts', path: '/promotions/discounts', icon: 'Percent', requiredPermission: 'promotions:view' },
    ] },
    { key: 'crm', label: 'Members', labelLao: 'ສະມາຊິກ', icon: 'Users', requiredPermission: 'customers:view', children: [
        { key: 'crm.members', label: 'Members', path: '/customers/members', icon: 'Crown', requiredPermission: 'customers:view' },
        { key: 'crm.points', label: 'Points', path: '/customers/points', icon: 'Star', requiredPermission: 'customers:view' },
        { key: 'crm.loyalty', label: 'Loyalty Program', path: '/customers/loyalty', icon: 'Heart', requiredPermission: 'customers:update' },
    ] },
    { key: 'payments', label: 'Payments', labelLao: 'ຊຳລະ', icon: 'Wallet', requiredPermission: 'payments:view', children: [
        { key: 'payments.methods', label: 'Payment Methods', path: '/payments', icon: 'CreditCard', requiredPermission: 'payments:view' },
        { key: 'payments.transactions', label: 'Transactions', path: '/payments/transactions', icon: 'Receipt', requiredPermission: 'payments:view' },
        { key: 'payments.settlements', label: 'Settlements', path: '/payments/settlements', icon: 'DollarSign', requiredPermission: 'payments:manage' },
    ] },
    { key: 'documents', label: 'Documents', labelLao: 'ເອກະສານ', icon: 'FileText', requiredPermission: 'documents:view', children: [
        { key: 'documents.receipts', label: 'Receipts', path: '/documents', icon: 'Receipt', requiredPermission: 'documents:view' },
        { key: 'documents.design', label: 'Receipt Design', path: '/documents/design', icon: 'Printer', requiredPermission: 'documents:update' },
        { key: 'documents.invoices', label: 'Invoices', path: '/documents/invoices', icon: 'FileText', requiredPermission: 'documents:view' },
        { key: 'documents.tax-invoices', label: 'Tax Invoices', path: '/documents/tax-invoices', icon: 'FileSpreadsheet', requiredPermission: 'documents:view' },
    ] },
    { key: 'reports', label: 'Reports', labelLao: 'ລາຍງານ', icon: 'BarChart3', requiredPermission: 'reports:view', children: [
        { key: 'reports.sales', label: 'Sales Report', path: '/reports', icon: 'BarChart3', requiredPermission: 'reports:view' },
        { key: 'reports.products', label: 'Product Report', path: '/reports/products', icon: 'Package', requiredPermission: 'reports:view' },
        { key: 'reports.inventory', label: 'Inventory Report', path: '/reports/inventory', icon: 'Boxes', requiredPermission: 'reports:view' },
        { key: 'reports.financial', label: 'Financial Report', path: '/reports/financial', icon: 'DollarSign', requiredPermission: 'reports:view' },
        { key: 'reports.staff', label: 'Staff Report', path: '/reports/staff', icon: 'UserCog', requiredPermission: 'reports:view' },
        { key: 'reports.customers', label: 'Members Report', path: '/reports/customers', icon: 'Users', requiredPermission: 'reports:view' },
        { key: 'reports.promotions', label: 'Promotions Report', path: '/reports/promotions', icon: 'Gift', requiredPermission: 'reports:view' },
        { key: 'reports.period-compare', label: 'Period Compare', path: '/reports/period-compare', icon: 'CalendarRange', requiredPermission: 'reports:view' },
        { key: 'reports.branch-compare', label: 'Branch Compare', path: '/reports/branch-compare', icon: 'GitCompare', requiredPermission: 'reports:view' },
        { key: 'reports.gl', label: 'GL / Finance & Compliance', path: '/reports/gl', icon: 'BookOpen', requiredPermission: 'reports:financial' },
    ] },
    { key: 'management', label: 'Management', labelLao: 'ຈັດການ', icon: 'Building2', requiredPermission: 'staff:view', children: [
        { key: 'management.branches', label: 'Branches', path: '/branches', icon: 'Building2', requiredPermission: 'branches:view' },
        { key: 'management.stores', label: 'Stores', path: '/management/stores', icon: 'Store', requiredPermission: 'stores:view' },
        { key: 'management.staff', label: 'Staff', path: '/staff', icon: 'UserCog', requiredPermission: 'staff:view' },
        { key: 'management.roles', label: 'Roles', path: '/staff/roles', icon: 'Shield', requiredPermission: 'roles:view' },
        { key: 'management.cashregisters', label: 'Cash Registers', path: '/management/cashregisters', icon: 'Monitor', requiredPermission: 'stores:view' },
        { key: 'management.shifts', label: 'Shifts', path: '/staff/shifts', icon: 'Timer', requiredPermission: 'staff:view' },
    ] },
    { key: 'settings', label: 'Settings', labelLao: 'ຕັ້ງຄ່າ', icon: 'Settings', requiredPermission: 'settings:view', children: [
        { key: 'settings.general', label: 'General', path: '/settings', icon: 'Settings', requiredPermission: 'settings:view' },
        { key: 'settings.display', label: 'Display', path: '/settings/display', icon: 'Monitor', requiredPermission: 'settings:view' },
        { key: 'settings.receipt', label: 'Receipt', path: '/settings/receipt', icon: 'Receipt', requiredPermission: 'settings:view' },
        { key: 'settings.tax', label: 'Tax', path: '/settings/tax', icon: 'Percent', requiredPermission: 'settings:update' },
        { key: 'settings.payments', label: 'Payments', path: '/settings/payments', icon: 'CreditCard', requiredPermission: 'settings:update' },
        { key: 'settings.printers', label: 'Printers', path: '/settings/printers', icon: 'Printer', requiredPermission: 'settings:update' },
        { key: 'settings.notifications', label: 'Notifications', path: '/settings/notifications', icon: 'Bell', requiredPermission: 'settings:view' },
    ] },
    { key: 'admin', label: 'Super Admin', icon: 'ShieldCheck', requiredPermission: 'admin:view', children: [
        { key: 'admin.dashboard', label: 'Admin Dashboard', path: '/admin', icon: 'Shield', requiredPermission: 'admin:view' },
        { key: 'admin.requests', label: 'Store Requests', path: '/admin/requests', icon: 'FileCheck', requiredPermission: 'admin:view' },
        { key: 'admin.stores', label: 'Stores Overview', path: '/admin/stores', icon: 'Store', requiredPermission: 'admin:view' },
        { key: 'admin.branches', label: 'All Branches', path: '/admin/branches', icon: 'Building2', requiredPermission: 'admin:view' },
        { key: 'admin.users', label: 'All Users', path: '/admin/users', icon: 'Users', requiredPermission: 'admin:view' },
        { key: 'admin.roles', label: 'System Roles', path: '/admin/roles', icon: 'Key', requiredPermission: 'admin:manage' },
        { key: 'admin.rules', label: 'Rules', path: '/admin/rules', icon: 'ShieldCheck', requiredPermission: 'admin:manage' },
        { key: 'admin.permissions', label: 'Permissions', path: '/admin/permissions', icon: 'Shield', requiredPermission: 'admin:manage' },
        { key: 'admin.audit', label: 'Audit Log', path: '/admin/audit', icon: 'History', requiredPermission: 'admin:view' },
    ] },
];

async function main() {
    console.log('\nKPOS seed-demo: current-schema idempotent seed\n');

    const tenant = await ensureTenant();
    const tenantId = tenant.id;

    const hqBranch = await ensureBranch({
        tenantId, name: 'HQ Branch', code: 'HQ', address: 'Vientiane Center',
        phone: '020-5555-0001', email: 'hq@kpos.la', isMain: true,
    });
    const branch1 = await ensureBranch({
        tenantId, parentBranchId: hqBranch.id, name: 'Downtown Branch', code: 'B001',
        address: 'Downtown Vientiane', phone: '020-5555-0002', email: 'downtown@kpos.la',
    });
    const branch2 = await ensureBranch({
        tenantId, parentBranchId: hqBranch.id, name: 'Restaurant Branch', code: 'B002',
        address: 'Riverside Vientiane', phone: '020-5555-0003', email: 'restaurant@kpos.la',
    });

    const hqStore = await ensureStore({
        tenantId, branchId: hqBranch.id, name: 'HQ Main Store', code: 'STORE-HQ',
        address: 'Vientiane Center', phone: '020-5555-1001', email: 'store.hq@kpos.la',
        description: 'Default HQ retail store', isDefault: true,
    });
    const retailStore = await ensureStore({
        tenantId, branchId: branch1.id, name: 'Downtown Retail', code: 'STORE-B001',
        address: 'Downtown Vientiane', phone: '020-5555-1002', email: 'retail@kpos.la',
        description: 'Retail branch store',
    });
    const restaurantStore = await ensureStore({
        tenantId, branchId: branch2.id, name: 'Riverside Restaurant', code: 'STORE-B002',
        address: 'Riverside Vientiane', phone: '020-5555-1003', email: 'restaurant@kpos.la',
        description: 'Restaurant/e-menu demo store',
    });

    console.log('Structure ready');

    const roleMap: Record<string, Row> = {};
    for (const role of DEFAULT_ROLES) roleMap[role.name] = await ensureRole(role);

    const ruleMap: Record<string, Row> = {};
    for (const rule of DEFAULT_RULES) ruleMap[rule.name] = await ensureRule(rule);

    for (const [roleName, entries] of Object.entries(DEFAULT_ROLE_RULES)) {
        const role = roleMap[roleName];
        if (!role) continue;
        for (const [ruleName, flags] of Object.entries(entries)) {
            const rule = ruleMap[ruleName];
            if (rule) await ensureRoleRule({ roleId: role.id, ruleId: rule.id, flags });
        }
    }

    const branchStaffRole = await ensureBranchRole({
        tenantId,
        branchId: branch1.id,
        name: 'branch1_staff',
        displayName: 'Branch 1 Staff',
        description: 'Branch-private staff role for testing branch scoping',
        permissions: ['dashboard:view', 'sales:view', 'sales:create', 'pos:access', 'products:view', 'customers:view', 'payments:view', 'payments:create'],
    });

    console.log(`Roles/rules ready (${Object.keys(roleMap).length} roles, ${Object.keys(ruleMap).length} rules)`);

    const superAdmin = await ensureUser({
        tenantId: null, branchId: null, email: SUPER_ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD,
        name: SUPER_ADMIN_NAME, roleName: 'super_admin', roleId: roleMap.super_admin.id,
        permissions: ['*'], isSuperAdmin: true,
    });
    const merchantOwner = await ensureUser({
        tenantId, branchId: hqBranch.id, email: 'owner@kpos.la', password: DEMO_PASSWORD,
        name: 'Merchant Owner', phone: '020-1000-0001', roleName: 'merchant_owner', roleId: roleMap.merchant_owner.id,
    });
    const merchantManager = await ensureUser({
        tenantId, branchId: hqBranch.id, email: 'manager@kpos.la', password: DEMO_PASSWORD,
        name: 'Merchant Manager', phone: '020-1000-0002', roleName: 'merchant_manager', roleId: roleMap.merchant_manager.id,
    });
    const accountant = await ensureUser({
        tenantId, branchId: hqBranch.id, email: 'accountant@kpos.la', password: DEMO_PASSWORD,
        name: 'Accountant', phone: '020-1000-0003', roleName: 'accountant', roleId: roleMap.accountant.id,
    });
    const supervisor = await ensureUser({
        tenantId, branchId: branch1.id, email: 'supervisor@kpos.la', password: DEMO_PASSWORD,
        name: 'Supervisor', phone: '020-1000-0004', roleName: 'supervisor', roleId: roleMap.supervisor.id,
    });
    const storeAdmin = await ensureUser({
        tenantId, branchId: branch1.id, email: 'store.admin@kpos.la', password: DEMO_PASSWORD,
        name: 'Store Admin', phone: '020-1000-0005', roleName: 'store_admin', roleId: roleMap.store_admin.id,
    });
    const cashier = await ensureUser({
        tenantId, branchId: branch1.id, email: 'cashier@kpos.la', password: DEMO_PASSWORD,
        name: 'Cashier', phone: '020-1000-0006', roleName: 'cashier', roleId: roleMap.cashier.id,
    });
    const inventoryUser = await ensureUser({
        tenantId, branchId: branch1.id, email: 'inventory@kpos.la', password: DEMO_PASSWORD,
        name: 'Inventory Staff', phone: '020-1000-0007', roleName: 'inventory_staff', roleId: roleMap.inventory_staff.id,
    });
    const kitchenUser = await ensureUser({
        tenantId, branchId: branch2.id, email: 'kitchen@kpos.la', password: DEMO_PASSWORD,
        name: 'Kitchen Staff', phone: '020-1000-0008', roleName: 'kitchen_staff', roleId: roleMap.kitchen_staff.id,
    });
    const waiter = await ensureUser({
        tenantId, branchId: branch2.id, email: 'waiter@kpos.la', password: DEMO_PASSWORD,
        name: 'Waiter', phone: '020-1000-0009', roleName: 'waiter', roleId: roleMap.waiter.id,
    });
    const branchPrivateUser = await ensureUser({
        tenantId, branchId: branch1.id, email: 'branch1.staff@kpos.la', password: DEMO_PASSWORD,
        name: 'Branch 1 Staff', phone: '020-1000-0010', roleName: 'branch1_staff', roleId: branchStaffRole.id,
    });

    const storeAssignments = [
        [merchantOwner, hqStore, hqBranch, true, true],
        [merchantOwner, retailStore, branch1, false, true],
        [merchantOwner, restaurantStore, branch2, false, true],
        [merchantManager, hqStore, hqBranch, true, true],
        [merchantManager, retailStore, branch1, false, true],
        [merchantManager, restaurantStore, branch2, false, true],
        [accountant, hqStore, hqBranch, true, false],
        [supervisor, retailStore, branch1, true, true],
        [storeAdmin, retailStore, branch1, true, true],
        [cashier, retailStore, branch1, true, false],
        [inventoryUser, retailStore, branch1, true, false],
        [kitchenUser, restaurantStore, branch2, true, false],
        [waiter, restaurantStore, branch2, true, false],
        [branchPrivateUser, retailStore, branch1, true, false],
    ] as const;
    for (const [user, store, branch, isDefault, canManage] of storeAssignments) {
        await ensureUserStore({ tenantId, userId: user.id, storeId: store.id, branchId: branch.id, isDefault, canManage });
    }

    console.log('Users and store access ready');

    await seedMenu(MENU_STRUCTURE);

    const paymentMethods = [
        { name: 'Cash', code: 'CASH', type: 'CASH', icon: 'Banknote', isDefault: true, sortOrder: 0 },
        { name: 'Card', code: 'CARD', type: 'CARD', icon: 'CreditCard', isDefault: false, sortOrder: 1 },
        { name: 'QR / Bank Transfer', code: 'QR', type: 'QR', icon: 'QrCode', isDefault: false, sortOrder: 2 },
        { name: 'Bank Transfer', code: 'TRANSFER', type: 'TRANSFER', icon: 'Landmark', isDefault: false, sortOrder: 3 },
    ];
    const pmRows: Record<string, Row> = {};
    for (const pm of paymentMethods) pmRows[pm.code] = await ensurePaymentMethod(tenantId, pm);

    const enums = [
        { type: 'business_type', value: 'retail', label: 'Retail', labelLao: 'ຂາຍຍ່ອຍ', order: 0 },
        { type: 'business_type', value: 'restaurant', label: 'Restaurant', labelLao: 'ຮ້ານອາຫານ', order: 1 },
        { type: 'stockin_reason', value: 'purchase', label: 'Purchase', labelLao: 'ຊື້ເຂົ້າ', order: 0 },
        { type: 'stockin_reason', value: 'return', label: 'Customer Return', labelLao: 'ລູກຄ້າສົ່ງຄືນ', order: 1 },
        { type: 'stockout_reason', value: 'damaged', label: 'Damaged', labelLao: 'ເສຍຫາຍ', order: 0 },
        { type: 'stockout_reason', value: 'expired', label: 'Expired', labelLao: 'ໝົດອາຍຸ', order: 1 },
        { type: 'payment_type', value: 'cash', label: 'Cash', labelLao: 'ເງິນສົດ', order: 0 },
        { type: 'payment_type', value: 'qr', label: 'QR Payment', labelLao: 'ຈ່າຍຜ່ານ QR', order: 1 },
    ];
    for (const row of enums) await ensureEnum(row);

    for (const row of [
        { category: 'store', key: 'currency', value: 'LAK' },
        { category: 'store', key: 'currencySymbol', value: '₭' },
        { category: 'store', key: 'timezone', value: 'Asia/Vientiane' },
        { category: 'display', key: 'language', value: 'lo' },
        { category: 'pos', key: 'defaultTaxRate', value: 10 },
        { category: 'pos', key: 'enableTax', value: true },
        { category: 'pos', key: 'priceIncludesTax', value: true },
        { category: 'payments', key: 'qrMerchantCode', value: '' },
    ]) {
        await ensureSetting({ tenantId, ...row });
    }

    console.log('Menu, payment methods, enums, settings ready');

    const vendorA = await ensureVendor(tenantId, {
        name: 'Lao Supply Co.', code: 'VEN-LAO', contactName: 'Mr. Somchai',
        email: 'supply@example.com', phone: '020-2000-0001', address: 'Vientiane', paymentTerms: 30,
    });
    const vendorB = await ensureVendor(tenantId, {
        name: 'Fresh Food Partner', code: 'VEN-FOOD', contactName: 'Ms. Dao',
        email: 'food@example.com', phone: '020-2000-0002', address: 'Vientiane', paymentTerms: 15,
    });

    const catRetail = await ensureCategory({ tenantId, storeId: retailStore.id, name: 'Retail Goods', slug: 'retail-goods', description: 'Retail demo products', sortOrder: 0 });
    const catDrink = await ensureCategory({ tenantId, storeId: restaurantStore.id, name: 'Drinks', slug: 'drinks', description: 'Restaurant drinks', sortOrder: 1 });
    const catFood = await ensureCategory({ tenantId, storeId: restaurantStore.id, name: 'Food', slug: 'food', description: 'Restaurant food', sortOrder: 2 });

    const productInputs = [
        { name: 'Premium Rice 5kg', sku: 'RICE-5KG', barcode: '885000000001', categoryId: catRetail.id, vendorId: vendorA.id, branchId: branch1.id, storeId: retailStore.id, price: 85000, cost: 62000, unit: 'bag', tags: ['retail'] },
        { name: 'Drinking Water 600ml', sku: 'WATER-600', barcode: '885000000002', categoryId: catDrink.id, vendorId: vendorB.id, branchId: branch2.id, storeId: restaurantStore.id, price: 5000, cost: 2500, unit: 'bottle', tags: ['drink', 'restaurant'] },
        { name: 'Iced Coffee', sku: 'COFFEE-ICED', barcode: '885000000003', categoryId: catDrink.id, vendorId: vendorB.id, branchId: branch2.id, storeId: restaurantStore.id, price: 18000, cost: 7000, unit: 'cup', tags: ['drink', 'restaurant'] },
        { name: 'Chicken Fried Rice', sku: 'FOOD-FRICE', barcode: '885000000004', categoryId: catFood.id, vendorId: vendorB.id, branchId: branch2.id, storeId: restaurantStore.id, price: 35000, cost: 17000, unit: 'plate', tags: ['food', 'restaurant'] },
        { name: 'USB-C Cable', sku: 'USB-CABLE', barcode: '885000000005', categoryId: catRetail.id, vendorId: vendorA.id, branchId: branch1.id, storeId: retailStore.id, price: 45000, cost: 22000, unit: 'piece', tags: ['retail'] },
        { name: 'Notebook A5', sku: 'NOTE-A5', barcode: '885000000006', categoryId: catRetail.id, vendorId: vendorA.id, branchId: branch1.id, storeId: retailStore.id, price: 12000, cost: 6000, unit: 'piece', tags: ['retail'] },
    ];

    const products: Row[] = [];
    for (const [idx, p] of productInputs.entries()) {
        const product = await ensureProduct({
            tenantId,
            name: p.name,
            description: `${p.name} demo item`,
            sku: p.sku,
            barcode: p.barcode,
            categoryId: p.categoryId,
            vendorId: p.vendorId,
            branchId: p.branchId,
            price: p.price,
            cost: p.cost,
            unit: p.unit,
            isVat: true,
            vatRate: 10,
            trackStock: true,
            lowStockThreshold: idx % 2 === 0 ? 10 : 5,
            tags: p.tags,
            attributes: { demo: true },
        });
        products.push({ ...product, storeId: p.storeId });
        await ensureProductStore({ tenantId, productId: product.id, storeId: p.storeId, price: p.price, stock: 100 + idx * 10, minStock: 5 });
        await ensureInventory({
            tenantId, productId: product.id, branchId: p.branchId, storeId: p.storeId,
            quantity: 100 + idx * 10, location: idx % 2 === 0 ? 'A-01' : 'B-01',
            batchNumber: `BATCH-${idx + 1}`, expiryDate: idx < 3 ? daysFromNow(120 + idx * 10) : null,
        });
    }

    const retailPrice = await ensurePriceLevel(tenantId, 'Retail', true);
    const wholesalePrice = await ensurePriceLevel(tenantId, 'Wholesale', false);
    for (const product of products) {
        await ensureProductPriceLevel(tenantId, product.id, retailPrice.id, product.price);
        await ensureProductPriceLevel(tenantId, product.id, wholesalePrice.id, Math.round(product.price * 0.9));
    }
    await ensureSkuVariant({
        tenantId, productId: products[0].id, sku: 'RICE-5KG-PACK2', barcode: '885000001001',
        name: 'Premium Rice 5kg x 2', attributes: { pack: '2 bags' },
        price: 165000, cost: 120000,
    });

    console.log(`Products/inventory ready (${products.length} products)`);

    const tiers = [
        { name: 'Bronze', minPoints: 0, pointMultiplier: 1, discountPercent: 0, color: '#CD7F32', sortOrder: 0, benefits: ['Basic points'] },
        { name: 'Silver', minPoints: 500, pointMultiplier: 1.2, discountPercent: 3, color: '#C0C0C0', sortOrder: 1, benefits: ['3% discount'] },
        { name: 'Gold', minPoints: 2000, pointMultiplier: 1.5, discountPercent: 5, color: '#FFD700', sortOrder: 2, benefits: ['5% discount'] },
    ];
    const tierRows: Row[] = [];
    for (const tier of tiers) tierRows.push(await ensureMembershipTier({ tenantId, ...tier }));

    const existingPointSettings = optional(await sql`select * from point_settings where tenant_id = ${tenantId} limit 1`);
    if (existingPointSettings) {
        await sql`
            update point_settings set
                points_per_currency = 1,
                min_spend_to_earn = 10000,
                redemption_rate = 100,
                min_points_to_redeem = 100,
                expiry_months = 12,
                is_active = true,
                updated_at = now()
            where id = ${existingPointSettings.id}
        `;
    } else {
        await sql`
            insert into point_settings (
                tenant_id, points_per_currency, min_spend_to_earn,
                redemption_rate, min_points_to_redeem, expiry_months, is_active
            ) values (${tenantId}, 1, 10000, 100, 100, 12, true)
        `;
    }

    const memberInputs = [
        { firstName: 'Som', lastName: 'Thong', email: 'som@example.com', phone: '020-3000-0001', points: 1500, totalSpent: 1500000, visitCount: 12, tierId: tierRows[1].id },
        { firstName: 'Dao', lastName: 'Chan', email: 'dao@example.com', phone: '020-3000-0002', points: 3200, totalSpent: 4200000, visitCount: 24, tierId: tierRows[2].id },
        { firstName: 'Kham', lastName: 'La', email: 'kham@example.com', phone: '020-3000-0003', points: 120, totalSpent: 250000, visitCount: 3, tierId: tierRows[0].id },
    ];
    const membersList: Row[] = [];
    const customersList: Row[] = [];
    for (const [idx, m] of memberInputs.entries()) {
        const member = await ensureMember({ tenantId, cardNumber: `MEM-${String(idx + 1).padStart(5, '0')}`, ...m });
        membersList.push(member);
        const customer = await ensureCustomer({
            tenantId, memberCode: member.card_number, name: `${m.firstName} ${m.lastName}`,
            email: m.email, phone: m.phone, points: m.points, totalSpent: m.totalSpent,
            visitCount: m.visitCount, branchId: branch1.id, storeId: retailStore.id,
        });
        customersList.push(customer);

        const hasMemberPoints = optional(await sql`select * from point_history where tenant_id = ${tenantId} and member_id = ${member.id} limit 1`);
        if (!hasMemberPoints) {
            await sql`
                insert into point_history (tenant_id, member_id, type, points, balance, reference, reference_type, description)
                values (${tenantId}, ${member.id}, 'earn', ${m.points}, ${m.points}, 'SEED', 'seed', 'Initial seed points')
            `;
        }
        const hasCustomerPoints = optional(await sql`select * from points_history where tenant_id = ${tenantId} and customer_id = ${customer.id} limit 1`);
        if (!hasCustomerPoints) {
            await sql`
                insert into points_history (tenant_id, customer_id, points, type, reason, created_by)
                values (${tenantId}, ${customer.id}, ${m.points}, 'earn', 'Initial seed points', ${merchantOwner.id})
            `;
        }
    }

    console.log('Members/customers/loyalty ready');

    const promotion = await ensureByTenantColumn('promotions', 'name', tenantId, 'Member 10% Discount', () => sql`
        insert into promotions (
            tenant_id, name, description, type, value, conditions, applicable_to,
            start_date, end_date, is_active, priority, usage_limit, usage_count, member_only, store_id
        ) values (
            ${tenantId}, 'Member 10% Discount', '10% for active members',
            'PERCENTAGE', 10, ${sql.json({ minPurchase: 50000 })},
            ${sql.json({ scope: 'members' })}, ${daysAgo(7)}, ${daysFromNow(60)},
            true, 1, 1000, 12, true, ${retailStore.id}
        )
        returning *
    `);
    await sql`
        update promotions set
            description = '10% for active members',
            type = 'PERCENTAGE',
            value = 10,
            conditions = ${sql.json({ minPurchase: 50000 })},
            applicable_to = ${sql.json({ scope: 'members' })},
            start_date = ${daysAgo(7)},
            end_date = ${daysFromNow(60)},
            is_active = true,
            priority = 1,
            usage_limit = 1000,
            member_only = true,
            store_id = ${retailStore.id},
            updated_at = now()
        where id = ${promotion.id}
    `;

    const couponExisting = optional(await sql`select * from coupons where tenant_id = ${tenantId} and code = 'WELCOME10' limit 1`);
    if (couponExisting) {
        await sql`
            update coupons set
                name = 'Welcome 10%', type = 'percentage', value = 10,
                min_purchase = 50000, start_date = ${daysAgo(7)}, end_date = ${daysFromNow(60)},
                usage_limit = 500, is_active = true, store_id = ${retailStore.id},
                updated_at = now()
            where id = ${couponExisting.id}
        `;
    } else {
        await sql`
            insert into coupons (
                tenant_id, code, name, type, value, min_purchase,
                start_date, end_date, usage_limit, usage_count, is_active, store_id
            ) values (
                ${tenantId}, 'WELCOME10', 'Welcome 10%', 'percentage', 10, 50000,
                ${daysAgo(7)}, ${daysFromNow(60)}, 500, 0, true, ${retailStore.id}
            )
        `;
    }

    const discount = await ensureByTenantColumn('discounts', 'name', tenantId, 'Weekend 5%', () => sql`
        insert into discounts (
            tenant_id, name, description, discount_type, discount_value, apply_to,
            category_ids, min_purchase, start_date, end_date, is_active, store_id
        ) values (
            ${tenantId}, 'Weekend 5%', 'Weekend promo for retail goods',
            'percentage', 5, 'category', ${[catRetail.id]}, 0,
            ${daysAgo(7)}, ${daysFromNow(60)}, true, ${retailStore.id}
        )
        returning *
    `);
    await sql`
        update discounts set
            discount_type = 'percentage',
            discount_value = 5,
            apply_to = 'category',
            category_ids = ${[catRetail.id]},
            start_date = ${daysAgo(7)},
            end_date = ${daysFromNow(60)},
            is_active = true,
            store_id = ${retailStore.id},
            updated_at = now()
        where id = ${discount.id}
    `;

    console.log('Promotions/coupons/discounts ready');

    const cashRegister = await ensureCashRegister({
        tenantId, branchId: branch1.id, storeId: retailStore.id, name: 'POS Main',
    });
    const shift = await ensureShift({
        tenantId,
        shiftNo: 'SHIFT-DEMO-001',
        branchId: branch1.id,
        storeId: retailStore.id,
        userId: cashier.id,
        registerId: cashRegister.id,
        openingBalance: 500000,
        closingBalance: 1850000,
        expectedBalance: 1850000,
        difference: 0,
        status: 'CLOSED',
        openedAt: daysAgo(1),
        closedAt: now(),
    });

    for (let i = 0; i < 20; i++) {
        const product = products[i % products.length];
        const qty = (i % 3) + 1;
        const subtotal = product.price * qty;
        const discountAmount = i % 5 === 0 ? Math.round(subtotal * 0.05) : 0;
        const taxable = subtotal - discountAmount;
        const taxAmount = Math.round(taxable * 0.1);
        const total = taxable + taxAmount;
        const transaction = await ensureTransaction({
            tenantId,
            transactionNo: `TXN-DEMO-${String(i + 1).padStart(4, '0')}`,
            branchId: branch1.id,
            storeId: retailStore.id,
            userId: cashier.id,
            shiftId: shift.id,
            memberId: membersList[i % membersList.length]?.id,
            customerId: customersList[i % customersList.length]?.id,
            subtotal,
            discountValue: discountAmount ? 5 : 0,
            discountAmount,
            taxAmount,
            total,
            received: total,
            change: 0,
            pointsEarned: Math.floor(total / 10000),
            createdAt: daysAgo(i % 14),
        });

        const itemExists = optional(await sql`select * from transaction_items where transaction_id = ${transaction.id} limit 1`);
        if (!itemExists) {
            await sql`
                insert into transaction_items (
                    tenant_id, transaction_id, product_id, product_name, sku, barcode,
                    quantity, unit_price, cost, discount_value, discount_amount,
                    tax_rate, tax_amount, total
                ) values (
                    ${tenantId}, ${transaction.id}, ${product.id}, ${product.name},
                    ${product.sku}, ${product.barcode}, ${qty}, ${product.price},
                    ${product.cost}, ${discountAmount ? 5 : 0}, ${discountAmount},
                    10, ${taxAmount}, ${total}
                )
            `;
        }

        const paymentExists = optional(await sql`select * from transaction_payments where transaction_id = ${transaction.id} limit 1`);
        if (!paymentExists) {
            const pm = i % 3 === 0 ? pmRows.CARD : i % 3 === 1 ? pmRows.QR : pmRows.CASH;
            await sql`
                insert into transaction_payments (tenant_id, transaction_id, method_id, method_name, amount)
                values (${tenantId}, ${transaction.id}, ${pm.id}, ${pm.name}, ${total})
            `;
        }
    }

    const po = await ensureByTenantColumn('purchase_orders', 'po_number', tenantId, 'PO-DEMO-001', () => sql`
        insert into purchase_orders (
            tenant_id, po_number, vendor_id, branch_id, status, subtotal, tax, discount,
            total, expected_date, notes, created_by
        ) values (
            ${tenantId}, 'PO-DEMO-001', ${vendorA.id}, ${branch1.id}, 'APPROVED',
            1200000, 120000, 0, 1320000, ${daysFromNow(7)}, 'Demo purchase order', ${merchantOwner.id}
        )
        returning *
    `);
    const poItemExists = optional(await sql`select * from purchase_order_items where purchase_order_id = ${po.id} limit 1`);
    if (!poItemExists) {
        await sql`
            insert into purchase_order_items (
                tenant_id, purchase_order_id, product_id, product_name, quantity,
                received_qty, unit_cost, total
            ) values (
                ${tenantId}, ${po.id}, ${products[0].id}, ${products[0].name},
                20, 0, ${products[0].cost}, ${products[0].cost * 20}
            )
        `;
    }

    const count = await ensureByTenantColumn('stock_counts', 'count_no', tenantId, 'COUNT-DEMO-001', () => sql`
        insert into stock_counts (
            tenant_id, count_no, branch_id, date, status, notes,
            has_discrepancy, counted_by
        ) values (
            ${tenantId}, 'COUNT-DEMO-001', ${branch1.id}, ${daysAgo(2)},
            'completed', 'Demo stock count', true, ${inventoryUser.id}
        )
        returning *
    `);
    const countItemExists = optional(await sql`select * from stock_count_items where count_id = ${count.id} limit 1`);
    if (!countItemExists) {
        await sql`
            insert into stock_count_items (
                tenant_id, count_id, product_id, product_name, system_qty, actual_qty, difference
            ) values (
                ${tenantId}, ${count.id}, ${products[0].id}, ${products[0].name}, 100, 98, -2
            )
        `;
    }

    const transfer = await ensureByTenantColumn('stock_transfers', 'transfer_no', tenantId, 'TR-DEMO-001', () => sql`
        insert into stock_transfers (
            tenant_id, transfer_no, from_branch_id, to_branch_id,
            status, notes, requested_by
        ) values (
            ${tenantId}, 'TR-DEMO-001', ${branch1.id}, ${branch2.id},
            'PENDING', 'Demo stock transfer', ${inventoryUser.id}
        )
        returning *
    `);
    const transferItemExists = optional(await sql`select * from stock_transfer_items where transfer_id = ${transfer.id} limit 1`);
    if (!transferItemExists) {
        await sql`
            insert into stock_transfer_items (
                tenant_id, transfer_id, product_id, product_name, quantity, received_qty
            ) values (
                ${tenantId}, ${transfer.id}, ${products[1].id}, ${products[1].name}, 10, 0
            )
        `;
    }

    for (let i = 1; i <= 6; i++) {
        const tableName = `T${i}`;
        const existing = optional(await sql`
            select * from tables where tenant_id = ${tenantId} and branch_id = ${branch2.id} and name = ${tableName} limit 1
        `);
        if (existing) {
            await sql`
                update tables set capacity = ${i <= 2 ? 2 : 4}, status = 'AVAILABLE', is_active = true, updated_at = now()
                where id = ${existing.id}
            `;
        } else {
            await sql`
                insert into tables (tenant_id, branch_id, name, capacity, status, pos_x, pos_y, shape, is_active)
                values (${tenantId}, ${branch2.id}, ${tableName}, ${i <= 2 ? 2 : 4}, 'AVAILABLE', ${i * 40}, ${i * 30}, 'SQUARE', true)
            `;
        }
    }

    const table1 = optional(await sql`select * from tables where tenant_id = ${tenantId} and branch_id = ${branch2.id} and name = 'T1' limit 1`);
    if (table1) {
        const reservationExists = optional(await sql`select * from reservations where tenant_id = ${tenantId} and phone = '020-3000-0001' limit 1`);
        if (!reservationExists) {
            await sql`
                insert into reservations (
                    tenant_id, branch_id, table_id, member_id, customer_name, phone,
                    email, guest_count, date, time, duration, status, note
                ) values (
                    ${tenantId}, ${branch2.id}, ${table1.id}, ${membersList[0].id},
                    'Som Thong', '020-3000-0001', 'som@example.com', 2,
                    ${daysFromNow(1)}, '18:30', 120, 'CONFIRMED', 'Demo reservation'
                )
            `;
        }

        const orderExists = optional(await sql`select * from orders where tenant_id = ${tenantId} and order_no = 'ORD-DEMO-001' limit 1`);
        if (!orderExists) {
            const restaurantProduct = products.find((p) => p.sku === 'FOOD-FRICE') ?? products[0];
            const order = first(await sql`
                insert into orders (
                    tenant_id, order_no, branch_id, table_id, type, status,
                    guest_count, subtotal, discount, tax, total, note
                ) values (
                    ${tenantId}, 'ORD-DEMO-001', ${branch2.id}, ${table1.id},
                    'DINE_IN', 'COMPLETED', 2, ${restaurantProduct.price}, 0,
                    ${Math.round(restaurantProduct.price * 0.1)}, ${Math.round(restaurantProduct.price * 1.1)},
                    'Demo restaurant order'
                )
                returning *
            `);
            await sql`
                insert into order_items (
                    tenant_id, order_id, product_id, product_name, quantity,
                    unit_price, total, status
                ) values (
                    ${tenantId}, ${order.id}, ${restaurantProduct.id}, ${restaurantProduct.name},
                    1, ${restaurantProduct.price}, ${restaurantProduct.price}, 'SERVED'
                )
            `;
        }
    }

    console.log('Transactions, inventory operations, restaurant data ready');

    console.log('\nSeed completed successfully\n');
    console.log('Accounts');
    console.log(`  Super Admin      ${SUPER_ADMIN_EMAIL} / ${SUPER_ADMIN_PASSWORD}`);
    console.log(`  Merchant Owner   owner@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Manager          manager@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Accountant       accountant@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Store Admin      store.admin@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Supervisor       supervisor@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Cashier          cashier@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Inventory        inventory@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Kitchen          kitchen@kpos.la / ${DEMO_PASSWORD}`);
    console.log(`  Waiter           waiter@kpos.la / ${DEMO_PASSWORD}`);
    console.log('');
    console.log(`Tenant: ${tenant.name} (${tenant.code})`);
    console.log(`Branches: ${hqBranch.name}, ${branch1.name}, ${branch2.name}`);
    console.log(`Stores: ${hqStore.name}, ${retailStore.name}, ${restaurantStore.name}`);
    console.log(`Roles: ${DEFAULT_ROLES.length}, Rules: ${DEFAULT_RULES.length}, Products: ${products.length}`);
}

main()
    .catch((error) => {
        console.error('\nSeed failed');
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await sql.end({ timeout: 5 });
    });
