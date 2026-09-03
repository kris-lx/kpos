// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Drizzle Schema Tables (PostgreSQL)
// ═══════════════════════════════════════════════════════════════════════════

import {
    pgTable, uuid, text, boolean, timestamp, integer, doublePrecision,
    jsonb, index, uniqueIndex, bigint,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ═══════════════════════════════════════════════════════════════════════════
// TENANT / ORGANIZATION
// ═══════════════════════════════════════════════════════════════════════════

export const tenants = pgTable('tenants', {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    code: text('code').notNull().unique(),
    logo: text('logo'),
    businessType: text('business_type'),
    taxId: text('tax_id'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    plan: text('plan').notNull().default('free'),
    isActive: boolean('is_active').notNull().default(true),
    status: text('status').notNull().default('active'),
    deleteAfter: timestamp('delete_after'),
    settings: jsonb('settings'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export const branches = pgTable('branches', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    // A branch is a physical outlet location and belongs to exactly one
    // store (the shop/company entity) — Tenant → Store → Branch. Denormalized
    // alongside tenantId, matching the userStores pattern, so branch-scoped
    // queries don't need a join to resolve tenant isolation.
    storeId: uuid('store_id').notNull(),
    parentBranchId: uuid('parent_branch_id'),
    branchPath: text('branch_path').notNull().default(''),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    taxId: text('tax_id'),
    logo: text('logo'),
    // Owner / identity fields (Phase 2)
    ownerName: text('owner_name'),
    ownerPhone: text('owner_phone'),
    ownerEmail: text('owner_email'),
    registrationNo: text('registration_no'),
    website: text('website'),
    receiptSettings: jsonb('receipt_settings'),
    isActive: boolean('is_active').notNull().default(true),
    isMain: boolean('is_main').notNull().default(false),
    settings: jsonb('settings'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('branches_tenant_idx').on(t.tenantId),
    index('branches_store_idx').on(t.storeId),
    index('branches_parent_idx').on(t.parentBranchId),
    index('branches_path_idx').on(t.branchPath),
    uniqueIndex('branches_tenant_code_idx').on(t.tenantId, t.code),
    index('branches_tenant_active_name_idx').on(t.tenantId, t.isActive, t.name),
]);

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION & USERS
// ═══════════════════════════════════════════════════════════════════════════

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    email: text('email').notNull(),
    password: text('password').notNull(),
    name: text('name').notNull(),
    phone: text('phone'),
    avatar: text('avatar'),
    role: text('role').notNull().default('staff'),
    roleId: uuid('role_id'),
    // Single-value anchors, used as a fallback when a user has no explicit
    // userStores grant rows (mirrors each other: storeId for the broad
    // store-owner tier, branchId for a specific branch-level assignment).
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    permissions: text('permissions').array().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    // Workflow flags are assigned per user by an owner/branch admin. They
    // complement (and never bypass) the role permission checks: a checker
    // still needs the relevant approval permission, and a maker still needs
    // the relevant create permission.
    makerEnabled: boolean('maker_enabled').notNull().default(true),
    checkerEnabled: boolean('checker_enabled').notNull().default(false),
    requiresShift: boolean('requires_shift').notNull().default(true),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    emailVerified: boolean('email_verified').notNull().default(false),
    twoFAEnabled: boolean('two_fa_enabled').notNull().default(false),
    twoFASecret: text('two_fa_secret'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
    index('users_tenant_branch_idx').on(t.tenantId, t.branchId),
    index('users_tenant_store_idx').on(t.tenantId, t.storeId),
]);

export const sessions = pgTable('sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    jti: text('jti').notNull().unique(),
    token: text('token').notNull().unique(),
    refreshToken: text('refresh_token').notNull().unique(),
    device: text('device'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('sessions_user_idx').on(t.userId),
    index('sessions_revoked_idx').on(t.revokedAt).where(sql`${t.revokedAt} IS NOT NULL`),
]);

export const roles = pgTable('roles', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    // null  = tenant-wide role (visible to all branches)
    // uuid  = branch-specific role (visible only to that branch + HQ)
    branchId: uuid('branch_id'),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    permissions: text('permissions').array().notNull().default([]),
    isSystem: boolean('is_system').notNull().default(false),
    maskLow: bigint('mask_low', { mode: 'bigint' }).notNull().default(sql`0`),
    maskHigh: bigint('mask_high', { mode: 'bigint' }).notNull().default(sql`0`),
    // Numeric privilege tier (1 = platform .. 7 = lowest/specialist), the DB-
    // backed replacement for name-keyed ROLE_LEVELS lookups. A role name a
    // caller invented (anything outside the ~20 built-in names) always
    // resolved to the hardcoded map's `?? 7` fallback — which ladder checks
    // (assign this role / create a role no more privileged than yourself)
    // read as "harmless," regardless of what permissions the role actually
    // held. This column makes level an explicit, per-row fact set at
    // creation time and validated against the creator's own level, instead
    // of an inference from a name string.
    level: integer('level').notNull().default(7),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('roles_tenant_branch_name_idx').on(t.tenantId, t.branchId, t.name),
    index('roles_branch_idx').on(t.branchId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// RULE-BASED ACCESS CONTROL
// ═══════════════════════════════════════════════════════════════════════════

export const rules = pgTable('rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description'),
    module: text('module').notNull(),
    icon: text('icon'),
    routes: text('routes').array().notNull().default([]),
    permissions: text('permissions').array().notNull().default([]),
    order: integer('order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('rules_tenant_name_idx').on(t.tenantId, t.name),
]);

export const roleRules = pgTable('role_rules', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    roleId: uuid('role_id').notNull(),
    ruleId: uuid('rule_id').notNull(),
    canRead: boolean('can_read').notNull().default(true),
    canCreate: boolean('can_create').notNull().default(false),
    canUpdate: boolean('can_update').notNull().default(false),
    canDelete: boolean('can_delete').notNull().default(false),
}, (t) => [
    uniqueIndex('role_rules_role_rule_idx').on(t.roleId, t.ruleId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// PERMISSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export const permissionGroups = pgTable('permission_groups', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    icon: text('icon'),
    color: text('color'),
    order: integer('order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const permissions = pgTable('permissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    groupId: uuid('group_id').notNull(),
    order: integer('order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════
// MENU PERMISSIONS
// ═══════════════════════════════════════════════════════════════════════════

export const menuPermissions = pgTable('menu_permissions', {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull().unique(),
    label: text('label').notNull(),
    labelLao: text('label_lao'),
    icon: text('icon'),
    path: text('path'),
    parentId: uuid('parent_id'),
    requiredPermission: text('required_permission'),
    order: integer('order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('menu_permissions_parent_idx').on(t.parentId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// STORE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export const stores = pgTable('stores', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    // Stores are the top-level, tenant-rooted entity — Tenant → Store →
    // Branch. A store can itself have a sub-tree of stores (parentStoreId +
    // storePath materialized path, mirroring branches' own parentBranchId/
    // branchPath), independent of the branch tree nested inside each store.
    parentStoreId: uuid('parent_store_id'),
    storePath: text('store_path').notNull().default(''),
    name: text('name').notNull(),
    code: text('code').notNull(),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    description: text('description'),
    logo: text('logo'),
    theme: jsonb('theme'),
    merchantId: text('merchant_id'),
    paymentGateway: text('payment_gateway'),
    isActive: boolean('is_active').notNull().default(true),
    // Repurposed: previously "the default store within a branch"; now "the
    // tenant's root/default store", analogous to branches.isMain.
    isDefault: boolean('is_default').notNull().default(false),
    settings: jsonb('settings'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('stores_tenant_idx').on(t.tenantId),
    index('stores_parent_idx').on(t.parentStoreId),
    index('stores_path_idx').on(t.storePath),
    uniqueIndex('stores_tenant_code_idx').on(t.tenantId, t.code),
]);

export const userStores = pgTable('user_stores', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id').notNull(),
    // Grants access to a whole store (all its branches). branchId narrows
    // that grant to just ONE specific branch within the store when set —
    // previously notNull (store was the narrow/leaf unit); now optional,
    // since store is the broad tier and a grant may or may not be narrowed
    // further down to a single branch.
    storeId: uuid('store_id').notNull(),
    branchId: uuid('branch_id'),
    isDefault: boolean('is_default').notNull().default(false),
    canRead: boolean('can_read').notNull().default(true),
    canWrite: boolean('can_write').notNull().default(true),
    canDelete: boolean('can_delete').notNull().default(false),
    canManage: boolean('can_manage').notNull().default(false),
    assignedBy: uuid('assigned_by'),
    assignedAt: timestamp('assigned_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    // A whole-store grant is unique, while a user may hold several explicit
    // branch grants inside the same store. PostgreSQL treats NULL values as
    // distinct, so partial indexes make both invariants explicit.
    uniqueIndex('user_stores_user_store_whole_idx').on(t.userId, t.storeId).where(sql`${t.branchId} IS NULL`),
    uniqueIndex('user_stores_user_store_branch_idx').on(t.userId, t.storeId, t.branchId).where(sql`${t.branchId} IS NOT NULL`),
]);

export const productStores = pgTable('product_stores', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    productId: uuid('product_id').notNull(),
    storeId: uuid('store_id').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    price: doublePrecision('price'),
    stock: doublePrecision('stock').notNull().default(0),
    minStock: integer('min_stock').notNull().default(10),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('product_stores_product_store_idx').on(t.productId, t.storeId),
    index('product_stores_tenant_idx').on(t.tenantId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// STORE REQUESTS
// ═══════════════════════════════════════════════════════════════════════════

export const storeRequests = pgTable('store_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    requesterId: uuid('requester_id').notNull(),
    branchId: uuid('branch_id'),
    type: text('type').notNull(),
    storeName: text('store_name'),
    storeCode: text('store_code'),
    storeAddress: text('store_address'),
    storePhone: text('store_phone'),
    storeEmail: text('store_email'),
    branchName: text('branch_name'),
    branchCode: text('branch_code'),
    branchAddress: text('branch_address'),
    branchPhone: text('branch_phone'),
    branchEmail: text('branch_email'),
    reason: text('reason'),
    documents: text('documents').array().notNull().default([]),
    metadata: jsonb('metadata'),
    status: text('status').notNull().default('pending'),
    priority: text('priority').notNull().default('normal'),
    reviewerId: uuid('reviewer_id'),
    reviewNote: text('review_note'),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
    expiresAt: timestamp('expires_at'),
}, (t) => [
    index('store_requests_status_created_idx').on(t.status, t.createdAt),
    index('store_requests_requester_idx').on(t.requesterId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS & CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

export const categories = pgTable('categories', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    image: text('image'),
    parentId: uuid('parent_id'),
    storeId: uuid('store_id'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('categories_store_idx').on(t.storeId),
    uniqueIndex('categories_tenant_slug_idx').on(t.tenantId, t.slug),
]);

export const products = pgTable('products', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    description: text('description'),
    sku: text('sku'),
    barcode: text('barcode'),
    categoryId: uuid('category_id'),
    vendorId: uuid('vendor_id'),
    // Every product belongs to exactly one store (its brand). branchId is
    // nullable: null = shared across every branch under that store (the
    // brand's catalog, inherited by every franchise branch); set = exclusive
    // to that one branch (a franchisee's own local item).
    storeId: uuid('store_id').notNull(),
    branchId: uuid('branch_id'),
    price: doublePrecision('price').notNull(),
    cost: doublePrecision('cost').notNull().default(0),
    unit: text('unit').notNull().default('piece'),
    image: text('image'),
    images: text('images').array().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    isVat: boolean('is_vat').notNull().default(true),
    vatRate: doublePrecision('vat_rate').notNull().default(7),
    trackStock: boolean('track_stock').notNull().default(true),
    lowStockThreshold: integer('low_stock_threshold').notNull().default(10),
    allowDecimal: boolean('allow_decimal').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    tags: text('tags').array().notNull().default([]),
    attributes: jsonb('attributes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('products_tenant_idx').on(t.tenantId),
    index('products_branch_idx').on(t.branchId),
    index('products_store_idx').on(t.storeId),
]);

export const skuVariants = pgTable('sku_variants', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    productId: uuid('product_id').notNull(),
    sku: text('sku').notNull(),
    barcode: text('barcode'),
    name: text('name').notNull(),
    attributes: jsonb('attributes').notNull(),
    price: doublePrecision('price'),
    cost: doublePrecision('cost'),
    image: text('image'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('sku_variants_tenant_sku_idx').on(t.tenantId, t.sku),
]);

export const billOfMaterials = pgTable('bill_of_materials', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    productId: uuid('product_id').notNull(),
    ingredientId: uuid('ingredient_id').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unit: text('unit').notNull(),
    cost: doublePrecision('cost').notNull().default(0),
});

export const priceLevels = pgTable('price_levels', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('price_levels_tenant_name_idx').on(t.tenantId, t.name),
]);

export const productPriceLevels = pgTable('product_price_levels', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    productId: uuid('product_id').notNull(),
    priceLevelId: uuid('price_level_id').notNull(),
    price: doublePrecision('price').notNull(),
}, (t) => [
    uniqueIndex('product_price_levels_product_level_idx').on(t.productId, t.priceLevelId),
    index('product_price_levels_tenant_idx').on(t.tenantId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════════════════════

export const inventory = pgTable('inventory', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    productId: uuid('product_id').notNull(),
    skuVariantId: uuid('sku_variant_id'),
    branchId: uuid('branch_id').notNull(),
    storeId: uuid('store_id'),
    quantity: doublePrecision('quantity').notNull().default(0),
    reserved: doublePrecision('reserved').notNull().default(0),
    available: doublePrecision('available').notNull().default(0),
    location: text('location'),
    batchNumber: text('batch_number'),
    expiryDate: timestamp('expiry_date'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('inventory_product_branch_sku_batch_idx').on(t.productId, t.branchId, t.skuVariantId, t.batchNumber),
    index('inventory_store_idx').on(t.storeId),
    index('inventory_tenant_idx').on(t.tenantId),
    index('inventory_branch_idx').on(t.branchId),
]);

export const stockMovements = pgTable('stock_movements', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    productId: uuid('product_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    storeId: uuid('store_id'),
    type: text('type').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    previousQty: doublePrecision('previous_qty').notNull(),
    newQty: doublePrecision('new_qty').notNull(),
    unitCost: doublePrecision('unit_cost'),
    supplier: text('supplier'),
    reason: text('reason'),
    reference: text('reference'),
    referenceType: text('reference_type'),
    userId: uuid('user_id').notNull(),
    notes: text('notes'),
    expiryDate: timestamp('expiry_date'),
    batchNumber: text('batch_number'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('stock_movements_store_idx').on(t.storeId),
    index('stock_movements_tenant_idx').on(t.tenantId),
    index('stock_movements_branch_created_idx').on(t.branchId, t.createdAt),
    index('stock_movements_product_idx').on(t.productId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════

export const customers = pgTable('customers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    memberCode: text('member_code'),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    taxId: text('tax_id'),
    birthDate: timestamp('birth_date'),
    gender: text('gender'),
    notes: text('notes'),
    points: integer('points').notNull().default(0),
    totalSpent: doublePrecision('total_spent').notNull().default(0),
    visitCount: integer('visit_count').notNull().default(0),
    lastVisitAt: timestamp('last_visit_at'),
    branchId: uuid('branch_id'),
    storeId: uuid('store_id'),
    priceLevelId: uuid('price_level_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('customers_store_idx').on(t.storeId),
    index('customers_tenant_idx').on(t.tenantId),
]);

export const pointsHistory = pgTable('points_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    customerId: uuid('customer_id').notNull(),
    points: integer('points').notNull(),
    type: text('type').notNull(),
    reason: text('reason'),
    referenceId: text('reference_id'),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('points_history_customer_idx').on(t.customerId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// SALES & TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════

export const transactions = pgTable('transactions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    transactionNo: text('transaction_no').notNull(),
    type: text('type').notNull().default('SALE'),
    status: text('status').notNull().default('COMPLETED'),
    branchId: uuid('branch_id').notNull(),
    storeId: uuid('store_id'),
    userId: uuid('user_id').notNull(),
    shiftId: uuid('shift_id'),
    memberId: uuid('member_id'),
    customerId: uuid('customer_id'),
    tableId: uuid('table_id'),
    orderId: uuid('order_id'),
    orderType: text('order_type').notNull().default('WALKIN'),
    subtotal: doublePrecision('subtotal').notNull(),
    discountType: text('discount_type'),
    discountValue: doublePrecision('discount_value').notNull().default(0),
    discountAmount: doublePrecision('discount_amount').notNull().default(0),
    taxAmount: doublePrecision('tax_amount').notNull().default(0),
    serviceCharge: doublePrecision('service_charge').notNull().default(0),
    total: doublePrecision('total').notNull(),
    received: doublePrecision('received').notNull().default(0),
    change: doublePrecision('change').notNull().default(0),
    pointsEarned: integer('points_earned').notNull().default(0),
    pointsRedeemed: integer('points_redeemed').notNull().default(0),
    // Monetary value of redeemed loyalty points. Keeping this separate from
    // the point count prevents financial reports from silently omitting the
    // discount applied to the final payable amount.
    pointsRedeemAmount: doublePrecision('points_redeem_amount').notNull().default(0),
    note: text('note'),
    voidReason: text('void_reason'),
    refundReason: text('refund_reason'),
    parentId: uuid('parent_id'),
    isCredit: boolean('is_credit').notNull().default(false),
    creditStatus: text('credit_status'),
    dueDate: timestamp('due_date'),
    paidAmount: doublePrecision('paid_amount').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('transactions_store_idx').on(t.storeId),
    index('transactions_tenant_idx').on(t.tenantId),
    uniqueIndex('transactions_tenant_no_idx').on(t.tenantId, t.transactionNo),
    index('transactions_branch_created_idx').on(t.branchId, t.createdAt),
    index('transactions_tenant_status_idx').on(t.tenantId, t.status),
    index('transactions_user_idx').on(t.userId),
    index('transactions_customer_idx').on(t.customerId),
]);

export const transactionItems = pgTable('transaction_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    transactionId: uuid('transaction_id').notNull(),
    productId: uuid('product_id').notNull(),
    productName: text('product_name').notNull(),
    sku: text('sku'),
    barcode: text('barcode'),
    quantity: doublePrecision('quantity').notNull(),
    unitPrice: doublePrecision('unit_price').notNull(),
    cost: doublePrecision('cost').notNull().default(0),
    discountType: text('discount_type'),
    discountValue: doublePrecision('discount_value').notNull().default(0),
    discountAmount: doublePrecision('discount_amount').notNull().default(0),
    taxRate: doublePrecision('tax_rate').notNull().default(0),
    taxAmount: doublePrecision('tax_amount').notNull().default(0),
    total: doublePrecision('total').notNull(),
    note: text('note'),
    modifiers: jsonb('modifiers'),
    // Denormalized copy of the parent transaction's createdAt — added when
    // this table was partitioned by month (migration 0029). transaction_items
    // never had its own timestamp before; a partition key has to live on
    // the partitioned table itself, not be derived via a join.
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('transaction_items_tenant_idx').on(t.tenantId),
    index('transaction_items_transaction_idx').on(t.transactionId),
    index('transaction_items_product_idx').on(t.productId),
]);

export const transactionPayments = pgTable('transaction_payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    transactionId: uuid('transaction_id').notNull(),
    methodId: uuid('method_id').notNull(),
    methodName: text('method_name').notNull(),
    amount: doublePrecision('amount').notNull(),
    reference: text('reference'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const heldSales = pgTable('held_sales', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name'),
    branchId: uuid('branch_id').notNull(),
    userId: uuid('user_id').notNull(),
    memberId: uuid('member_id'),
    tableId: uuid('table_id'),
    items: jsonb('items').notNull(),
    subtotal: doublePrecision('subtotal').notNull(),
    discount: doublePrecision('discount').notNull().default(0),
    total: doublePrecision('total').notNull(),
    note: text('note'),
    storeId: uuid('store_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('held_sales_store_idx').on(t.storeId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════

export const paymentMethods = pgTable('payment_methods', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    code: text('code').notNull(),
    type: text('type').notNull(),
    icon: text('icon'),
    isActive: boolean('is_active').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    settings: jsonb('settings'),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('payment_methods_tenant_code_idx').on(t.tenantId, t.code),
]);

// ═══════════════════════════════════════════════════════════════════════════
// SHIFTS & CASH MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export const employeeWorkSchedules = pgTable('employee_work_schedules', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    storeId: uuid('store_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    userId: uuid('user_id').notNull(),
    dayOfWeek: integer('day_of_week').notNull(),
    startTime: text('start_time').notNull(),
    endTime: text('end_time').notNull(),
    timezone: text('timezone').notNull().default('Asia/Vientiane'),
    earlyClockOutGraceMinutes: integer('early_clock_out_grace_minutes').notNull().default(0),
    effectiveFrom: timestamp('effective_from').notNull().defaultNow(),
    effectiveTo: timestamp('effective_to'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('employee_work_schedules_user_branch_effective_idx').on(t.userId, t.branchId, t.effectiveFrom),
    index('employee_work_schedules_tenant_idx').on(t.tenantId),
    index('employee_work_schedules_scope_active_idx').on(t.branchId, t.isActive, t.dayOfWeek),
]);

// Work attendance is intentionally separate from `shifts`. A shift is a
// cash-drawer session and therefore only applies to users who operate a POS
// register; attendance applies to every employee and is the source of truth
// for payroll hours, late arrivals, and early departures.
export const attendanceRecords = pgTable('attendance_records', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    storeId: uuid('store_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    userId: uuid('user_id').notNull(),
    workDate: text('work_date').notNull(),
    clockInAt: timestamp('clock_in_at').notNull(),
    clockOutAt: timestamp('clock_out_at'),
    scheduledStartAt: timestamp('scheduled_start_at'),
    scheduledEndAt: timestamp('scheduled_end_at'),
    timezone: text('timezone').notNull().default('Asia/Vientiane'),
    status: text('status').notNull().default('OPEN'),
    lateMinutes: integer('late_minutes').notNull().default(0),
    earlyLeaveMinutes: integer('early_leave_minutes').notNull().default(0),
    workedMinutes: integer('worked_minutes').notNull().default(0),
    clockInSource: text('clock_in_source').notNull().default('WEB'),
    clockOutSource: text('clock_out_source'),
    note: text('note'),
    adjustmentReason: text('adjustment_reason'),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('attendance_records_tenant_date_idx').on(t.tenantId, t.workDate),
    index('attendance_records_branch_clock_in_idx').on(t.branchId, t.clockInAt),
    index('attendance_records_user_clock_in_idx').on(t.userId, t.clockInAt),
    uniqueIndex('attendance_records_one_open_per_user_idx').on(t.userId).where(sql`status = 'OPEN'`),
]);

export const shifts = pgTable('shifts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    shiftNo: text('shift_no').notNull(),
    branchId: uuid('branch_id').notNull(),
    userId: uuid('user_id').notNull(),
    registerId: uuid('register_id'),
    openingBalance: doublePrecision('opening_balance').notNull(),
    closingBalance: doublePrecision('closing_balance'),
    expectedBalance: doublePrecision('expected_balance'),
    difference: doublePrecision('difference'),
    status: text('status').notNull().default('OPEN'),
    openedAt: timestamp('opened_at').notNull().defaultNow(),
    closedAt: timestamp('closed_at'),
    notes: text('notes'),
    storeId: uuid('store_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('shifts_store_idx').on(t.storeId),
    index('shifts_tenant_idx').on(t.tenantId),
    uniqueIndex('shifts_tenant_no_idx').on(t.tenantId, t.shiftNo),
    // Partial unique index (drizzle/0022) — one OPEN shift per user, enforced
    // at the DB level so a check-then-insert race can't create two.
    uniqueIndex('shifts_one_open_per_user_idx').on(t.userId).where(sql`status = 'OPEN'`),
]);

export const cashRegisters = pgTable('cash_registers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    branchId: uuid('branch_id').notNull(),
    storeId: uuid('store_id'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('cash_registers_tenant_idx').on(t.tenantId),
    index('cash_registers_store_idx').on(t.storeId),
]);

export const cashMovements = pgTable('cash_movements', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    shiftId: uuid('shift_id').notNull(),
    type: text('type').notNull(),
    amount: doublePrecision('amount').notNull(),
    reason: text('reason'),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════
// FINANCE — EXPENSE LEDGER & PAYROLL
// ═══════════════════════════════════════════════════════════════════════════

export const expenses = pgTable('expenses', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id').notNull(),
    category: text('category').notNull(),
    vendor: text('vendor'),
    reference: text('reference'),
    description: text('description'),
    amount: doublePrecision('amount').notNull(),
    taxAmount: doublePrecision('tax_amount').notNull().default(0),
    paymentMethod: text('payment_method'),
    expenseDate: timestamp('expense_date').notNull().defaultNow(),
    status: text('status').notNull().default('DRAFT'),
    createdBy: uuid('created_by').notNull(),
    submittedBy: uuid('submitted_by'),
    approvedBy: uuid('approved_by'),
    paidBy: uuid('paid_by'),
    approvedAt: timestamp('approved_at'),
    paidAt: timestamp('paid_at'),
    rejectionReason: text('rejection_reason'),
    attachmentUrl: text('attachment_url'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('expenses_tenant_date_idx').on(t.tenantId, t.expenseDate),
    index('expenses_branch_date_idx').on(t.branchId, t.expenseDate),
    index('expenses_status_idx').on(t.status),
]);

export const employeeCompensation = pgTable('employee_compensation', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    userId: uuid('user_id').notNull(),
    payType: text('pay_type').notNull().default('MONTHLY'),
    baseRate: doublePrecision('base_rate').notNull().default(0),
    allowance: doublePrecision('allowance').notNull().default(0),
    defaultDeduction: doublePrecision('default_deduction').notNull().default(0),
    taxExemptAmount: doublePrecision('tax_exempt_amount').notNull().default(0),
    socialSecurityEnabled: boolean('social_security_enabled').notNull().default(true),
    overtimeEligible: boolean('overtime_eligible').notNull().default(true),
    commissionRate: doublePrecision('commission_rate').notNull().default(0),
    effectiveFrom: timestamp('effective_from').notNull(),
    effectiveTo: timestamp('effective_to'),
    status: text('status').notNull().default('ACTIVE'),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('employee_compensation_user_effective_idx').on(t.userId, t.effectiveFrom),
    index('employee_compensation_tenant_idx').on(t.tenantId),
]);

export const payrollTaxProfiles = pgTable('payroll_tax_profiles', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('LAK'),
    effectiveFrom: timestamp('effective_from').notNull(),
    effectiveTo: timestamp('effective_to'),
    // Progressive cumulative brackets: [{ upTo: 5000000, rate: 0.05 },
    // { upTo: null, rate: 0.1 }]. Rates are stored as decimal fractions.
    taxBrackets: jsonb('tax_brackets').notNull().default(sql`'[]'::jsonb`),
    taxableDeduction: doublePrecision('taxable_deduction').notNull().default(0),
    employeeSocialRate: doublePrecision('employee_social_rate').notNull().default(0),
    employerSocialRate: doublePrecision('employer_social_rate').notNull().default(0),
    socialContributionCap: doublePrecision('social_contribution_cap').notNull().default(0),
    sourceReference: text('source_reference'),
    status: text('status').notNull().default('ACTIVE'),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('payroll_tax_profiles_tenant_effective_idx').on(t.tenantId, t.effectiveFrom),
    index('payroll_tax_profiles_scope_idx').on(t.storeId, t.branchId, t.status),
]);

export const payrollWorkPolicies = pgTable('payroll_work_policies', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    storeId: uuid('store_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    name: text('name').notNull(),
    timezone: text('timezone').notNull().default('Asia/Vientiane'),
    effectiveFrom: timestamp('effective_from').notNull(),
    effectiveTo: timestamp('effective_to'),
    standardHoursPerDay: doublePrecision('standard_hours_per_day').notNull(),
    monthlyWorkDays: doublePrecision('monthly_work_days').notNull(),
    overtimeMultiplier: doublePrecision('overtime_multiplier').notNull(),
    overtimeEveningMultiplier: doublePrecision('overtime_evening_multiplier').notNull().default(2),
    overtimeNightMultiplier: doublePrecision('overtime_night_multiplier').notNull().default(3),
    weekendMultiplier: doublePrecision('weekend_multiplier').notNull(),
    weekendEveningMultiplier: doublePrecision('weekend_evening_multiplier').notNull().default(3),
    weekendNightMultiplier: doublePrecision('weekend_night_multiplier').notNull().default(3.5),
    holidayMultiplier: doublePrecision('holiday_multiplier').notNull(),
    holidayEveningMultiplier: doublePrecision('holiday_evening_multiplier').notNull().default(3),
    holidayNightMultiplier: doublePrecision('holiday_night_multiplier').notNull().default(3.5),
    nightShiftPremiumRate: doublePrecision('night_shift_premium_rate').notNull().default(0.15),
    roundingMinutes: integer('rounding_minutes').notNull().default(1),
    maxShiftHours: doublePrecision('max_shift_hours').notNull().default(24),
    weekendDays: jsonb('weekend_days').notNull().default(sql`'[0]'::jsonb`),
    holidayDates: jsonb('holiday_dates').notNull().default(sql`'[]'::jsonb`),
    lateGraceMinutes: integer('late_grace_minutes').notNull().default(0),
    earlyLeaveGraceMinutes: integer('early_leave_grace_minutes').notNull().default(0),
    lateDeductionMultiplier: doublePrecision('late_deduction_multiplier').notNull().default(1),
    earlyLeaveDeductionMultiplier: doublePrecision('early_leave_deduction_multiplier').notNull().default(1),
    sourceReference: text('source_reference'),
    status: text('status').notNull().default('ACTIVE'),
    createdBy: uuid('created_by').notNull(),
    updatedBy: uuid('updated_by'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('payroll_work_policies_scope_effective_idx').on(t.branchId, t.status, t.effectiveFrom),
    index('payroll_work_policies_tenant_idx').on(t.tenantId),
]);

export const payrollPeriods = pgTable('payroll_periods', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    status: text('status').notNull().default('OPEN'),
    totalGross: doublePrecision('total_gross').notNull().default(0),
    totalDeductions: doublePrecision('total_deductions').notNull().default(0),
    totalIncomeTax: doublePrecision('total_income_tax').notNull().default(0),
    totalEmployeeSocial: doublePrecision('total_employee_social').notNull().default(0),
    totalEmployerSocial: doublePrecision('total_employer_social').notNull().default(0),
    totalEmployerCost: doublePrecision('total_employer_cost').notNull().default(0),
    totalNet: doublePrecision('total_net').notNull().default(0),
    taxProfileId: uuid('tax_profile_id'),
    workPolicyId: uuid('work_policy_id'),
    currency: text('currency').notNull().default('LAK'),
    createdBy: uuid('created_by').notNull(),
    submittedBy: uuid('submitted_by'),
    approvedBy: uuid('approved_by'),
    paidBy: uuid('paid_by'),
    approvedAt: timestamp('approved_at'),
    paidAt: timestamp('paid_at'),
    closedAt: timestamp('closed_at'),
    rejectionReason: text('rejection_reason'),
    reversalReason: text('reversal_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('payroll_periods_tenant_start_idx').on(t.tenantId, t.periodStart),
    index('payroll_periods_branch_start_idx').on(t.branchId, t.periodStart),
    index('payroll_periods_status_idx').on(t.status),
]);

export const payrollItems = pgTable('payroll_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    currency: text('currency').notNull().default('LAK'),
    periodId: uuid('period_id').notNull(),
    userId: uuid('user_id').notNull(),
    payType: text('pay_type').notNull(),
    hoursWorked: doublePrecision('hours_worked').notNull().default(0),
    regularHours: doublePrecision('regular_hours').notNull().default(0),
    overtimeHours: doublePrecision('overtime_hours').notNull().default(0),
    weekendHours: doublePrecision('weekend_hours').notNull().default(0),
    holidayHours: doublePrecision('holiday_hours').notNull().default(0),
    attendanceDays: doublePrecision('attendance_days').notNull().default(0),
    scheduledDays: doublePrecision('scheduled_days').notNull().default(0),
    absenceDays: doublePrecision('absence_days').notNull().default(0),
    lateMinutes: integer('late_minutes').notNull().default(0),
    earlyLeaveMinutes: integer('early_leave_minutes').notNull().default(0),
    attendanceDeduction: doublePrecision('attendance_deduction').notNull().default(0),
    basePay: doublePrecision('base_pay').notNull().default(0),
    overtimePay: doublePrecision('overtime_pay').notNull().default(0),
    commission: doublePrecision('commission').notNull().default(0),
    allowance: doublePrecision('allowance').notNull().default(0),
    reimbursement: doublePrecision('reimbursement').notNull().default(0),
    taxableIncome: doublePrecision('taxable_income').notNull().default(0),
    incomeTax: doublePrecision('income_tax').notNull().default(0),
    employeeSocialSecurity: doublePrecision('employee_social_security').notNull().default(0),
    employerSocialSecurity: doublePrecision('employer_social_security').notNull().default(0),
    otherDeductions: doublePrecision('other_deductions').notNull().default(0),
    deductions: doublePrecision('deductions').notNull().default(0),
    grossPay: doublePrecision('gross_pay').notNull().default(0),
    netPay: doublePrecision('net_pay').notNull().default(0),
    employerCost: doublePrecision('employer_cost').notNull().default(0),
    taxProfileId: uuid('tax_profile_id'),
    calculationDetails: jsonb('calculation_details'),
    adjustmentReason: text('adjustment_reason'),
    expenseId: uuid('expense_id'),
    status: text('status').notNull().default('DRAFT'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('payroll_items_period_user_idx').on(t.periodId, t.userId),
    index('payroll_items_tenant_idx').on(t.tenantId),
]);

export const payrollAdjustments = pgTable('payroll_adjustments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    storeId: uuid('store_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    periodId: uuid('period_id').notNull(),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    amount: doublePrecision('amount').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('PENDING_APPROVAL'),
    createdBy: uuid('created_by').notNull(),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    reviewReason: text('review_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('payroll_adjustments_period_user_idx').on(t.periodId, t.userId),
    index('payroll_adjustments_scope_status_idx').on(t.branchId, t.status),
]);

export const payrollPayments = pgTable('payroll_payments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    currency: text('currency').notNull().default('LAK'),
    periodId: uuid('period_id').notNull(),
    payrollItemId: uuid('payroll_item_id').notNull(),
    userId: uuid('user_id').notNull(),
    amount: doublePrecision('amount').notNull(),
    paymentMethod: text('payment_method').notNull(),
    reference: text('reference'),
    idempotencyKey: text('idempotency_key'),
    reversalOfPaymentId: uuid('reversal_of_payment_id'),
    paidBy: uuid('paid_by').notNull(),
    paidAt: timestamp('paid_at').notNull().defaultNow(),
}, (t) => [
    uniqueIndex('payroll_payments_idempotency_idx').on(t.idempotencyKey),
    index('payroll_payments_item_history_idx').on(t.payrollItemId, t.paidAt),
    index('payroll_payments_tenant_date_idx').on(t.tenantId, t.paidAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// RESTAURANT MODULE
// ═══════════════════════════════════════════════════════════════════════════

export const tables = pgTable('tables', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    branchId: uuid('branch_id').notNull(),
    areaId: uuid('area_id'),
    capacity: integer('capacity').notNull().default(4),
    status: text('status').notNull().default('AVAILABLE'),
    posX: doublePrecision('pos_x').notNull().default(0),
    posY: doublePrecision('pos_y').notNull().default(0),
    shape: text('shape').notNull().default('SQUARE'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orders = pgTable('orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    orderNo: text('order_no').notNull(),
    branchId: uuid('branch_id').notNull(),
    tableId: uuid('table_id'),
    type: text('type').notNull().default('DINE_IN'),
    status: text('status').notNull().default('PENDING'),
    guestCount: integer('guest_count').notNull().default(1),
    subtotal: doublePrecision('subtotal').notNull().default(0),
    discount: doublePrecision('discount').notNull().default(0),
    tax: doublePrecision('tax').notNull().default(0),
    total: doublePrecision('total').notNull().default(0),
    note: text('note'),
    kitchenNote: text('kitchen_note'),
    servedAt: timestamp('served_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('orders_tenant_no_idx').on(t.tenantId, t.orderNo),
]);

export const orderItems = pgTable('order_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    orderId: uuid('order_id').notNull(),
    productId: uuid('product_id').notNull(),
    productName: text('product_name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    unitPrice: doublePrecision('unit_price').notNull(),
    total: doublePrecision('total').notNull(),
    status: text('status').notNull().default('PENDING'),
    note: text('note'),
    modifiers: jsonb('modifiers'),
    sentAt: timestamp('sent_at'),
    preparedAt: timestamp('prepared_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

export const reservations = pgTable('reservations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    branchId: uuid('branch_id').notNull(),
    tableId: uuid('table_id'),
    memberId: uuid('member_id'),
    customerName: text('customer_name').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),
    guestCount: integer('guest_count').notNull(),
    date: timestamp('date').notNull(),
    time: text('time').notNull(),
    duration: integer('duration').notNull().default(120),
    status: text('status').notNull().default('PENDING'),
    note: text('note'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════
// CRM & MEMBERS
// ═══════════════════════════════════════════════════════════════════════════

export const members = pgTable('members', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    cardNumber: text('card_number'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name'),
    email: text('email'),
    phone: text('phone').notNull(),
    birthdate: timestamp('birthdate'),
    gender: text('gender'),
    address: text('address'),
    tierId: uuid('tier_id'),
    points: integer('points').notNull().default(0),
    totalSpent: doublePrecision('total_spent').notNull().default(0),
    visitCount: integer('visit_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('members_tenant_phone_idx').on(t.tenantId, t.phone),
]);

export const membershipTiers = pgTable('membership_tiers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    minPoints: integer('min_points').notNull().default(0),
    pointMultiplier: doublePrecision('point_multiplier').notNull().default(1),
    discountPercent: doublePrecision('discount_percent').notNull().default(0),
    benefits: jsonb('benefits'),
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('membership_tiers_tenant_name_idx').on(t.tenantId, t.name),
]);

export const pointHistory = pgTable('point_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    memberId: uuid('member_id').notNull(),
    type: text('type').notNull(),
    points: integer('points').notNull(),
    balance: integer('balance').notNull(),
    reference: text('reference'),
    referenceType: text('reference_type'),
    description: text('description'),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const pointSettings = pgTable('point_settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    pointsPerCurrency: doublePrecision('points_per_currency').notNull().default(1),
    minSpendToEarn: doublePrecision('min_spend_to_earn').notNull().default(0),
    redemptionRate: doublePrecision('redemption_rate').notNull().default(1),
    minPointsToRedeem: integer('min_points_to_redeem').notNull().default(100),
    expiryMonths: integer('expiry_months').default(12),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ═══════════════════════════════════════════════════════════════════════════
// PROMOTIONS & DISCOUNTS
// ═══════════════════════════════════════════════════════════════════════════

export const promotions = pgTable('promotions', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    value: doublePrecision('value').notNull(),
    conditions: jsonb('conditions'),
    applicableTo: jsonb('applicable_to'),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date'),
    isActive: boolean('is_active').notNull().default(true),
    priority: integer('priority').notNull().default(0),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    memberOnly: boolean('member_only').notNull().default(false),
    storeId: uuid('store_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('promotions_store_idx').on(t.storeId),
]);

export const coupons = pgTable('coupons', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    type: text('type').notNull(),
    value: doublePrecision('value').notNull(),
    minPurchase: doublePrecision('min_purchase').notNull().default(0),
    maxDiscount: doublePrecision('max_discount'),
    startDate: timestamp('start_date').notNull(),
    endDate: timestamp('end_date'),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    perUserLimit: integer('per_user_limit').default(1),
    isActive: boolean('is_active').notNull().default(true),
    storeId: uuid('store_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('coupons_store_idx').on(t.storeId),
    uniqueIndex('coupons_tenant_code_idx').on(t.tenantId, t.code),
]);

export const discounts = pgTable('discounts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    description: text('description'),
    discountType: text('discount_type').notNull().default('percentage'),
    discountValue: doublePrecision('discount_value').notNull(),
    applyTo: text('apply_to').notNull().default('all'),
    productIds: uuid('product_ids').array().notNull().default([]),
    categoryIds: uuid('category_ids').array().notNull().default([]),
    minQuantity: integer('min_quantity').notNull().default(1),
    minPurchase: doublePrecision('min_purchase').notNull().default(0),
    maxDiscount: doublePrecision('max_discount'),
    startDate: timestamp('start_date'),
    endDate: timestamp('end_date'),
    usageLimit: integer('usage_limit'),
    usageCount: integer('usage_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    storeId: uuid('store_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('discounts_store_idx').on(t.storeId),
]);

export const settlements = pgTable('settlements', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    branchId: uuid('branch_id'),
    storeId: uuid('store_id'),
    settlementDate: timestamp('settlement_date').notNull(),
    totalAmount: doublePrecision('total_amount').notNull().default(0),
    cashAmount: doublePrecision('cash_amount').notNull().default(0),
    cardAmount: doublePrecision('card_amount').notNull().default(0),
    otherAmount: doublePrecision('other_amount').notNull().default(0),
    transactionCount: integer('transaction_count').notNull().default(0),
    status: text('status').notNull().default('pending'),
    settledBy: uuid('settled_by'),
    notes: text('notes'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('settlements_tenant_idx').on(t.tenantId),
    index('settlements_branch_idx').on(t.branchId),
    index('settlements_store_idx').on(t.storeId),
    // One settlement per tenant+branch+day (drizzle/0023) — the route
    // normalizes settlementDate to midnight before insert so this actually
    // catches same-day duplicates regardless of time-of-day.
    uniqueIndex('settlements_branch_date_idx').on(t.tenantId, t.branchId, t.settlementDate),
]);

// ═══════════════════════════════════════════════════════════════════════════
// VENDORS & PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════

export const vendors = pgTable('vendors', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    code: text('code'),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    address: text('address'),
    taxId: text('tax_id'),
    paymentTerms: integer('payment_terms').notNull().default(30),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    isStarred: boolean('is_starred').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('vendors_tenant_idx').on(t.tenantId),
]);

export const purchaseOrders = pgTable('purchase_orders', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    poNumber: text('po_number').notNull(),
    vendorId: uuid('vendor_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    status: text('status').notNull().default('DRAFT'),
    subtotal: doublePrecision('subtotal').notNull(),
    tax: doublePrecision('tax').notNull().default(0),
    discount: doublePrecision('discount').notNull().default(0),
    total: doublePrecision('total').notNull(),
    expectedDate: timestamp('expected_date'),
    receivedDate: timestamp('received_date'),
    notes: text('notes'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at'),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('purchase_orders_tenant_po_idx').on(t.tenantId, t.poNumber),
]);

export const purchaseOrderItems = pgTable('purchase_order_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    purchaseOrderId: uuid('purchase_order_id').notNull(),
    productId: uuid('product_id').notNull(),
    productName: text('product_name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    receivedQty: doublePrecision('received_qty').notNull().default(0),
    unitCost: doublePrecision('unit_cost').notNull(),
    total: doublePrecision('total').notNull(),
});

export const stockTransfers = pgTable('stock_transfers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    transferNo: text('transfer_no').notNull(),
    fromBranchId: uuid('from_branch_id').notNull(),
    toBranchId: uuid('to_branch_id').notNull(),
    status: text('status').notNull().default('PENDING'),
    notes: text('notes'),
    requestedBy: uuid('requested_by').notNull(),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at'),
    completedBy: uuid('completed_by'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('stock_transfers_tenant_no_idx').on(t.tenantId, t.transferNo),
]);

export const stockTransferItems = pgTable('stock_transfer_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    transferId: uuid('transfer_id').notNull(),
    productId: uuid('product_id').notNull(),
    productName: text('product_name').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    receivedQty: doublePrecision('received_qty').notNull().default(0),
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK COUNTS
// ═══════════════════════════════════════════════════════════════════════════

export const stockCounts = pgTable('stock_counts', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    countNo: text('count_no').notNull(),
    branchId: uuid('branch_id').notNull(),
    date: timestamp('date').notNull().defaultNow(),
    status: text('status').notNull().default('pending'),
    notes: text('notes'),
    hasDiscrepancy: boolean('has_discrepancy').notNull().default(false),
    countedBy: uuid('counted_by').notNull(),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('stock_counts_tenant_no_idx').on(t.tenantId, t.countNo),
]);

export const stockCountItems = pgTable('stock_count_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    countId: uuid('count_id').notNull(),
    productId: uuid('product_id').notNull(),
    productName: text('product_name').notNull(),
    systemQty: doublePrecision('system_qty').notNull(),
    actualQty: doublePrecision('actual_qty').notNull(),
    difference: doublePrecision('difference').notNull(),
});

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENTS
// ═══════════════════════════════════════════════════════════════════════════

export const documents = pgTable('documents', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    type: text('type').notNull(),
    documentNo: text('document_no').notNull(),
    referenceId: uuid('reference_id').notNull(),
    referenceType: text('reference_type').notNull(),
    branchId: uuid('branch_id'),
    storeId: uuid('store_id'),
    data: jsonb('data').notNull(),
    status: text('status').notNull().default('CREATED'),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at'),
    rejectedBy: uuid('rejected_by'),
    rejectedAt: timestamp('rejected_at'),
    printCount: integer('print_count').notNull().default(0),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    index('documents_branch_idx').on(t.branchId),
    index('documents_store_idx').on(t.storeId),
    uniqueIndex('documents_tenant_no_idx').on(t.tenantId, t.documentNo),
]);

export const documentTemplates = pgTable('document_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    type: text('type').notNull(),
    name: text('name').notNull(),
    template: text('template').notNull(),
    settings: jsonb('settings'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('document_templates_tenant_type_idx').on(t.tenantId, t.type),
]);

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL PROVIDERS (Phase 11 — per-tenant email config, no more hardcoded Brevo)
// ═══════════════════════════════════════════════════════════════════════════

export const emailProviders = pgTable('email_providers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // smtp | brevo | sendgrid | mailgun
    config: jsonb('config').notNull(), // AES-256-GCM encrypted at app level
    isActive: boolean('is_active').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('email_providers_tenant_name_idx').on(t.tenantId, t.name),
    index('email_providers_tenant_idx').on(t.tenantId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// SSO PROVIDERS (per-tenant OIDC config — same shape as emailProviders)
// ═══════════════════════════════════════════════════════════════════════════

export const ssoProviders = pgTable('sso_providers', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(), // oidc (SAML may be added later)
    config: jsonb('config').notNull(), // AES-256-GCM encrypted at app level
    isActive: boolean('is_active').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('sso_providers_tenant_name_idx').on(t.tenantId, t.name),
    index('sso_providers_tenant_idx').on(t.tenantId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// TENANT INTEGRATIONS (LINE, Google Sheets, ... — one credential set per
// tenant per type, unlike emailProviders/ssoProviders which support multiple
// named providers)
// ═══════════════════════════════════════════════════════════════════════════

export const tenantIntegrations = pgTable('tenant_integrations', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    type: text('type').notNull(), // 'line' | 'google_sheets'
    config: jsonb('config').notNull(), // AES-256-GCM encrypted at app level
    isActive: boolean('is_active').notNull().default(false),
    connectedAt: timestamp('connected_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('tenant_integrations_tenant_type_idx').on(t.tenantId, t.type),
    index('tenant_integrations_tenant_idx').on(t.tenantId),
]);

export const emailTemplates = pgTable('email_templates', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'), // NULL = system default
    key: text('key').notNull(), // receipt, password_reset, low_stock_alert, shift_summary
    subject: text('subject').notNull(),
    htmlBody: text('html_body').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('email_templates_tenant_key_idx').on(t.tenantId, t.key),
]);

export const emailLogs = pgTable('email_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    toEmail: text('to_email').notNull(),
    templateKey: text('template_key'),
    status: text('status').notNull(), // sent | failed | queued
    error: text('error'),
    sentAt: timestamp('sent_at').notNull().defaultNow(),
}, (t) => [
    index('email_logs_tenant_idx').on(t.tenantId),
    index('email_logs_tenant_sent_idx').on(t.tenantId, t.sentAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT GATEWAYS (SwiftPass Alipay/WeChat QR, JDB Yes Pay) — per-tenant
// merchant credentials + dynamic QR payment requests
// ═══════════════════════════════════════════════════════════════════════════

export const paymentGatewayConfigs = pgTable('payment_gateway_configs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    provider: text('provider').notNull(), // swiftpass_alipay | swiftpass_wechat | jdb_yespay
    config: jsonb('config').notNull(), // AES-256-GCM encrypted at app level (encryptJson)
    isActive: boolean('is_active').notNull().default(false),
    environment: text('environment').notNull().default('sandbox'), // sandbox | production
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('payment_gateway_configs_tenant_provider_idx').on(t.tenantId, t.provider),
]);

export const qrPaymentRequests = pgTable('qr_payment_requests', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    provider: text('provider').notNull(),
    outTradeNo: text('out_trade_no').notNull(), // idempotency key sent to the gateway
    amount: doublePrecision('amount').notNull(),
    status: text('status').notNull().default('pending'), // pending | paid | expired | failed
    qrPayload: text('qr_payload'), // pay_url / pay_info / emv string to encode as QR
    gatewayRef: text('gateway_ref'), // provider's own transaction id once confirmed
    lastCheckedAt: timestamp('last_checked_at'),
    saleTransactionId: uuid('sale_transaction_id'), // linked back after POS finalizes the sale
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    confirmedAt: timestamp('confirmed_at'),
}, (t) => [
    uniqueIndex('qr_payment_requests_tenant_outtrade_idx').on(t.tenantId, t.outTradeNo),
    index('qr_payment_requests_tenant_idx').on(t.tenantId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

export const settings = pgTable('settings', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    category: text('category').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    branchId: uuid('branch_id'),
    storeId: uuid('store_id'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('settings_tenant_cat_key_branch_store_idx').on(t.tenantId, t.category, t.key, t.branchId, t.storeId),
    index('settings_tenant_idx').on(t.tenantId),
]);

// Durable record of every direct thermal/label print request. The raw printer
// payload is retained so failed jobs can be retried without rebuilding a
// receipt from mutable browser state.
export const printJobs = pgTable('print_jobs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    printerSettingId: uuid('printer_setting_id').notNull(),
    documentType: text('document_type').notNull(), // receipt | label
    reference: text('reference'),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('QUEUED'), // QUEUED | PROCESSING | PRINTED | FAILED
    transport: text('transport').notNull().default('network'),
    protocol: text('protocol').notNull(),
    payload: jsonb('payload').notNull(),
    requestedBy: uuid('requested_by').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    lastError: text('last_error'),
    queuedAt: timestamp('queued_at').notNull().defaultNow(),
    startedAt: timestamp('started_at'),
    printedAt: timestamp('printed_at'),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('print_jobs_tenant_idempotency_idx').on(t.tenantId, t.idempotencyKey),
    index('print_jobs_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('print_jobs_branch_created_idx').on(t.branchId, t.createdAt),
    index('print_jobs_status_queued_idx').on(t.status, t.queuedAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM ENUMS (dropdown/select values stored in DB, editable by admin)
// ═══════════════════════════════════════════════════════════════════════════

export const systemEnums = pgTable('system_enums', {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),       // e.g. 'business_type', 'stockout_reason'
    value: text('value').notNull(),     // e.g. 'retail', 'damaged'
    label: text('label').notNull(),     // English label
    labelLao: text('label_lao'),        // Lao label
    order: integer('order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    isSystem: boolean('is_system').notNull().default(false), // system enums can't be deleted
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('system_enums_type_value_idx').on(t.type, t.value),
    index('system_enums_type_idx').on(t.type),
]);

// ═══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS & ACTIVITY
// ═══════════════════════════════════════════════════════════════════════════

export const notifications = pgTable('notifications', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    data: jsonb('data'),
    isRead: boolean('is_read').notNull().default(false),
    readAt: timestamp('read_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const activityLogs = pgTable('activity_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id').notNull(),
    storeId: uuid('store_id'),
    branchId: uuid('branch_id'),
    action: text('action').notNull(),
    description: text('description'),
    entity: text('entity'),
    entityId: uuid('entity_id'),
    metadata: jsonb('metadata'),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    checksum: text('checksum'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('activity_logs_user_idx').on(t.userId),
    index('activity_logs_action_idx').on(t.action),
    index('activity_logs_created_idx').on(t.createdAt),
    index('activity_logs_tenant_branch_created_idx').on(t.tenantId, t.branchId, t.createdAt),
    index('activity_logs_tenant_store_created_idx').on(t.tenantId, t.storeId, t.createdAt),
]);

// ═══════════════════════════════════════════════════════════════════════════
// PLATFORM AUDIT LOGS
// ═══════════════════════════════════════════════════════════════════════════

export const platformAuditLogs = pgTable('platform_audit_logs', {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(),
    tenantId: uuid('tenant_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('platform_audit_logs_actor_idx').on(t.actorId),
    index('platform_audit_logs_tenant_idx').on(t.tenantId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// USER ROLE ASSIGNMENTS (scoped multi-role)
// ═══════════════════════════════════════════════════════════════════════════

export const outboxMessages = pgTable('outbox_messages', {
    eventId: uuid('event_id').primaryKey().defaultRandom(),
    queue: text('queue').notNull(),
    eventType: text('event_type').notNull(),
    tenantId: uuid('tenant_id'),
    aggregateId: text('aggregate_id'),
    payload: jsonb('payload').notNull(),
    attempts: integer('attempts').notNull().default(0),
    availableAt: timestamp('available_at').notNull().defaultNow(),
    lockedAt: timestamp('locked_at'),
    publishedAt: timestamp('published_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [
    index('outbox_messages_pending_idx').on(t.publishedAt, t.availableAt, t.createdAt),
    index('outbox_messages_queue_idx').on(t.queue, t.publishedAt),
]);

export const messageReceipts = pgTable('message_receipts', {
    eventId: uuid('event_id').primaryKey(),
    queue: text('queue').notNull(),
    status: text('status').notNull().default('processing'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
    processedAt: timestamp('processed_at'),
}, (t) => [
    index('message_receipts_status_idx').on(t.status, t.updatedAt),
]);

export const userRoleAssignments = pgTable('user_role_assignments', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id').notNull(),
    scope: text('scope').notNull().default('merchant'),
    storeId: uuid('store_id'),
    grantedBy: uuid('granted_by'),
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
}, (t) => [
    uniqueIndex('user_role_assignments_unique_idx').on(t.tenantId, t.userId, t.roleId, t.storeId),
    index('user_role_assignments_user_idx').on(t.userId),
]);

// ═══════════════════════════════════════════════════════════════════════════
// PUSH SUBSCRIPTIONS (Web Push API)
// ═══════════════════════════════════════════════════════════════════════════

export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tenantId: uuid('tenant_id'),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════════════════
// IDEMPOTENCY KEYS
// ═══════════════════════════════════════════════════════════════════════════

export const idempotencyKeys = pgTable('idempotency_keys', {
    key: text('key').primaryKey(),
    result: jsonb('result').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at'),
});
