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
    index('branches_parent_idx').on(t.parentBranchId),
    index('branches_path_idx').on(t.branchPath),
    uniqueIndex('branches_tenant_code_idx').on(t.tenantId, t.code),
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
    branchId: uuid('branch_id'),
    permissions: text('permissions').array().notNull().default([]),
    isActive: boolean('is_active').notNull().default(true),
    isSuperAdmin: boolean('is_super_admin').notNull().default(false),
    emailVerified: boolean('email_verified').notNull().default(false),
    twoFAEnabled: boolean('two_fa_enabled').notNull().default(false),
    twoFASecret: text('two_fa_secret'),
    lastLoginAt: timestamp('last_login_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email),
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
});

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
    name: text('name').notNull(),
    code: text('code').notNull(),
    branchId: uuid('branch_id').notNull(),
    address: text('address'),
    phone: text('phone'),
    email: text('email'),
    description: text('description'),
    logo: text('logo'),
    theme: jsonb('theme'),
    merchantId: text('merchant_id'),
    paymentGateway: text('payment_gateway'),
    isActive: boolean('is_active').notNull().default(true),
    isDefault: boolean('is_default').notNull().default(false),
    settings: jsonb('settings'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
    uniqueIndex('stores_tenant_code_idx').on(t.tenantId, t.code),
]);

export const userStores = pgTable('user_stores', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id').notNull(),
    storeId: uuid('store_id').notNull(),
    branchId: uuid('branch_id').notNull(),
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
    uniqueIndex('user_stores_user_store_idx').on(t.userId, t.storeId),
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
    branchId: uuid('branch_id').notNull(),
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
});

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
