// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Zod Validation Schemas (plain Zod, mirrors Drizzle table shapes)
// ═══════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const optionalUuid = z.string().uuid().optional().or(z.literal('').transform(() => undefined));
const optionalString = z.string().optional().or(z.literal(''));

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertProductSchema = z.object({
    name: z.string().min(1, 'Product name is required').max(255),
    price: z.number().min(0, 'Price must be >= 0'),
    cost: z.number().min(0).default(0),
    branchId: z.string().uuid(),
    tenantId: optionalUuid,
    categoryId: optionalUuid,
    vendorId: optionalUuid,
    sku: z.string().max(100).optional(),
    barcode: z.string().max(100).optional(),
    description: optionalString,
    unit: z.string().default('piece'),
    image: optionalString,
    images: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
    isVat: z.boolean().default(true),
    vatRate: z.number().default(7),
    trackStock: z.boolean().default(true),
    lowStockThreshold: z.number().int().default(10),
    allowDecimal: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    tags: z.array(z.string()).default([]),
    attributes: z.any().optional(),
});

export const updateProductSchema = insertProductSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// CATEGORY SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertCategorySchema = z.object({
    name: z.string().min(1, 'Category name is required').max(255),
    slug: z.string().min(1).max(255),
    tenantId: optionalUuid,
    storeId: optionalUuid,
    parentId: optionalUuid,
    description: optionalString,
    image: optionalString,
    sortOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
});

export const updateCategorySchema = insertCategorySchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertCustomerSchema = z.object({
    name: z.string().min(1, 'Customer name is required').max(255),
    email: z.string().email('Invalid email').optional().or(z.literal('')),
    phone: z.string().max(20).optional(),
    address: optionalString,
    gender: optionalString,
    branchId: optionalUuid,
    storeId: optionalUuid,
    tenantId: optionalUuid,
    isActive: z.boolean().default(true),
    loyaltyPoints: z.number().int().default(0),
    totalSpent: z.number().default(0),
    membershipTierId: optionalUuid,
    notes: optionalString,
});

export const updateCustomerSchema = insertCustomerSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// STORE SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertStoreSchema = z.object({
    name: z.string().min(1, 'Store name is required').max(255),
    code: z.string().min(1, 'Store code is required').max(50),
    branchId: z.string().uuid('Branch ID is required'),
    tenantId: optionalUuid,
    address: optionalString,
    phone: optionalString,
    email: optionalString,
    description: optionalString,
    isDefault: z.boolean().default(false),
    settings: z.any().optional(),
});

export const updateStoreSchema = insertStoreSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// BRANCH SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertBranchSchema = z.object({
    name: z.string().min(1, 'Branch name is required').max(255),
    code: z.string().min(1, 'Branch code is required').max(50),
    tenantId: optionalUuid,
    address: optionalString,
    phone: optionalString,
    email: optionalString,
    taxId: optionalString,
    logo: optionalString,
    isMain: z.boolean().default(false),
    isActive: z.boolean().default(true),
    settings: z.any().optional(),
});

export const updateBranchSchema = insertBranchSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// USER/STAFF SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertUserSchema = z.object({
    email: z.string().email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    name: z.string().min(1, 'Name is required').max(255),
    phone: z.string().max(20).optional(),
    avatar: optionalString,
    role: z.string().default('staff'),
    roleId: optionalUuid,
    branchId: optionalUuid,
    tenantId: optionalUuid,
    isActive: z.boolean().default(true),
    permissions: z.array(z.string()).default([]),
});

export const updateUserSchema = insertUserSchema.partial().omit({ password: true });

// ═══════════════════════════════════════════════════════════════════════════
// PROMOTION SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertPromotionSchema = z.object({
    name: z.string().min(1, 'Promotion name is required').max(255),
    description: optionalString,
    type: z.string().default('percentage'),
    value: z.number().min(0).default(0),
    minPurchase: z.number().min(0).default(0),
    maxDiscount: z.number().min(0).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isActive: z.boolean().default(true),
    tenantId: optionalUuid,
    storeId: optionalUuid,
    branchId: optionalUuid,
});

export const updatePromotionSchema = insertPromotionSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// COUPON SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertCouponSchema = z.object({
    code: z.string().min(1, 'Coupon code is required').max(50),
    name: z.string().min(1, 'Coupon name is required').max(255),
    description: optionalString,
    type: z.string().default('percentage'),
    value: z.number().min(0).default(0),
    minPurchase: z.number().min(0).default(0),
    maxDiscount: z.number().min(0).optional(),
    maxUses: z.number().int().min(0).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    isActive: z.boolean().default(true),
    tenantId: optionalUuid,
    storeId: optionalUuid,
});

export const updateCouponSchema = insertCouponSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// DISCOUNT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertDiscountSchema = z.object({
    name: z.string().min(1, 'Discount name is required').max(255),
    description: optionalString,
    type: z.string().default('percentage'),
    value: z.number().min(0).default(0),
    applyTo: z.string().default('all'),
    isActive: z.boolean().default(true),
    tenantId: optionalUuid,
    storeId: optionalUuid,
});

export const updateDiscountSchema = insertDiscountSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// VENDOR SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const insertVendorSchema = z.object({
    name: z.string().min(1, 'Vendor name is required').max(255),
    code: z.string().min(1, 'Vendor code is required').max(50),
    contactName: optionalString,
    contactEmail: z.string().email().optional().or(z.literal('')),
    contactPhone: optionalString,
    address: optionalString,
    tenantId: optionalUuid,
    isActive: z.boolean().default(true),
});

export const updateVendorSchema = insertVendorSchema.partial();

// ═══════════════════════════════════════════════════════════════════════════
// COMMON SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
});

export const idParamSchema = z.object({
    id: z.string().uuid('Invalid ID format'),
});
