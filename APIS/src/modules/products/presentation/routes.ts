// ═══════════════════════════════════════════════════════════════════════════
// Products Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, buildScopeCondition, buildBranchIdScope, invalidateQueryCache, isAdmin, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { products, categories, priceLevels, productPriceLevels, skuVariants, inventory, productStores, branches, stores } from '@/db/schema/tables';
import { eq, and, or, ne, ilike, inArray, isNotNull, isNull, desc, asc, count, sql } from 'drizzle-orm';

export const productRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════════════════
// PRICE LEVEL ROUTES (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get all price levels
productRoutes.get('/price-levels', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { search, page = 1, limit = 20 } = req.query;
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.min(100, Math.max(5, Number(limit) || 20));
        const skip = (safePage - 1) * safeLimit;
        const filter = req.branchFilter;
        const conditions: any[] = [];

        // Tenant isolation
        if (filter?.tenantId) {
            conditions.push(eq(priceLevels.tenantId, filter.tenantId));
        }
        if (search) {
            conditions.push(ilike(priceLevels.name, `%${String(search)}%`));
        }
        const where = conditions.length > 0 ? and(...conditions) : undefined;

        const [priceLevelRows, [{ value: total }]] = await Promise.all([
            db.query.priceLevels.findMany({
                where,
                with: { products: { with: { product: { columns: { id: true, name: true, sku: true, price: true } } } } },
                orderBy: [desc(priceLevels.isDefault), asc(priceLevels.createdAt)],
                offset: skip,
                limit: safeLimit,
            }),
            db.select({ value: count() }).from(priceLevels).where(where),
        ]);

        res.json({ success: true, data: priceLevelRows, meta: { page: safePage, limit: safeLimit, total: Number(total) || 0, totalPages: Math.ceil((Number(total) || 0) / safeLimit) } });
    } catch (error: any) {
        // If table doesn't exist yet (schema not pushed), return empty
        if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
            return res.json({ success: true, data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } });
        }
        next(error);
    }
});

// Get price level by ID
productRoutes.get('/price-levels/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const priceLevel = await db.query.priceLevels.findFirst({
            where: tenantId
                ? and(eq(priceLevels.id, req.params.id), eq(priceLevels.tenantId, tenantId))
                : eq(priceLevels.id, req.params.id),
            with: { products: { with: { product: { columns: { id: true, name: true, sku: true, price: true } } } } },
        });

        if (!priceLevel) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Price level not found' } });
            return;
        }

        if (!ensureScopeAccess(priceLevel, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this price level' } });
        }

        res.json({ success: true, data: priceLevel });
    } catch (error) {
        next(error);
    }
});

// Create price level
productRoutes.post('/price-levels', authenticate, withTenantTx(), authorize('products:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, description, isDefault } = req.body;

        const plTenantId = req.authUser?.tenantId || req.user?.tenantId;

        // If setting as default, unset current default first (scoped to tenant)
        if (isDefault) {
            const unsetConds: any[] = [eq(priceLevels.isDefault, true)];
            if (plTenantId) unsetConds.push(eq(priceLevels.tenantId, plTenantId));
            await db.update(priceLevels).set({ isDefault: false }).where(and(...unsetConds));
        }
        const [priceLevel] = await db.insert(priceLevels).values({
            tenantId: plTenantId,
            name,
            description: description || null,
            isDefault: isDefault || false,
        }).returning();

        res.status(201).json({ success: true, data: priceLevel });
    } catch (error) {
        next(error);
    }
});

// Update price level
productRoutes.put('/price-levels/:id', authenticate, withTenantTx(), authorize('products:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { name, description, isDefault } = req.body;

        // If setting as default, unset current default first
        if (isDefault) {
            await db.update(priceLevels).set({ isDefault: false }).where(and(eq(priceLevels.isDefault, true), ne(priceLevels.id, req.params.id)));
        }

        const tenantId = req.authUser?.tenantId;
        const updateConds: any[] = [eq(priceLevels.id, req.params.id)];
        if (tenantId) updateConds.push(eq(priceLevels.tenantId, tenantId));

        const [priceLevel] = await db.update(priceLevels).set({
            name,
            description: description || null,
            isDefault: isDefault || false,
        }).where(and(...updateConds)).returning();

        res.json({ success: true, data: priceLevel });
    } catch (error) {
        next(error);
    }
});

// Set price level as default
productRoutes.put('/price-levels/:id/set-default', authenticate, withTenantTx(), authorize('products:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = req.authUser?.tenantId;
        const tenantConds: any[] = [eq(priceLevels.isDefault, true)];
        if (tenantId) tenantConds.push(eq(priceLevels.tenantId, tenantId));
        await db.update(priceLevels).set({ isDefault: false }).where(and(...tenantConds));

        const setConds: any[] = [eq(priceLevels.id, req.params.id)];
        if (tenantId) setConds.push(eq(priceLevels.tenantId, tenantId));
        const [priceLevel] = await db.update(priceLevels).set({ isDefault: true }).where(and(...setConds)).returning();

        res.json({ success: true, data: priceLevel });
    } catch (error) {
        next(error);
    }
});

// Delete price level
productRoutes.delete('/price-levels/:id', authenticate, withTenantTx(), authorize('products:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // Check if it's the default (tenant-scoped)
        const tenantId = req.authUser?.tenantId;
        const priceLevel = await db.query.priceLevels.findFirst({
            where: tenantId
                ? and(eq(priceLevels.id, req.params.id), eq(priceLevels.tenantId, tenantId))
                : eq(priceLevels.id, req.params.id),
        });

        if (priceLevel?.isDefault) {
            res.status(400).json({ success: false, error: { code: 'BUSINESS_001', message: 'Cannot delete default price level' } });
            return;
        }

        await db.delete(productPriceLevels).where(eq(productPriceLevels.priceLevelId, req.params.id));
        await db.delete(priceLevels).where(eq(priceLevels.id, req.params.id));

        res.json({ success: true, data: { message: 'Price level deleted' } });
    } catch (error) {
        next(error);
    }
});

// Add product price to a level
productRoutes.post('/price-levels/prices', authenticate, withTenantTx(), authorize('products:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { productId, priceLevelId, price } = req.body;

        // Check if already exists
        const existing = await db.query.productPriceLevels.findFirst({
            where: and(eq(productPriceLevels.productId, productId), eq(productPriceLevels.priceLevelId, priceLevelId)),
        });

        if (existing) {
            const [updated] = await db.update(productPriceLevels).set({ price }).where(eq(productPriceLevels.id, existing.id)).returning();
            res.json({ success: true, data: updated });
            return;
        }

        const [ppl] = await db.insert(productPriceLevels).values({ productId, priceLevelId, price }).returning();

        res.status(201).json({ success: true, data: ppl });
    } catch (error) {
        next(error);
    }
});

// Update product price in a level
productRoutes.put('/price-levels/prices/:id', authenticate, withTenantTx(), authorize('products:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { price } = req.body;

        const [ppl] = await db.update(productPriceLevels).set({ price }).where(eq(productPriceLevels.id, req.params.id)).returning();

        res.json({ success: true, data: ppl });
    } catch (error) {
        next(error);
    }
});

// Delete product price from a level
productRoutes.delete('/price-levels/prices/:id', authenticate, withTenantTx(), authorize('products:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        await db.delete(productPriceLevels).where(eq(productPriceLevels.id, req.params.id));

        res.json({ success: true, data: { message: 'Product price deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SKU VARIANT ROUTES (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get all SKU variants with pagination (scoped to user's branches)
productRoutes.get('/skus', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { productId, search, status, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const filter = req.branchFilter;
        
        const skuConds: any[] = [];

        // Scope SKU variants via their parent product's store/branch scope —
        // same shared-vs-exclusive logic as GET /products (see there for why
        // productStores is no longer used).
        if (filter?.scopeByStore && filter.storeIds.length > 0) {
            const storeProds = await db.query.products.findMany({
                where: inArray(products.storeId, filter.storeIds),
                columns: { id: true },
            });
            const productIds = storeProds.map(p => p.id);
            skuConds.push(productIds.length > 0 ? inArray(skuVariants.productId, productIds) : sql`1 = 0`);
        } else if (filter && filter.branchIds.length > 0) {
            const ownerBranches = await db.query.branches.findMany({
                where: inArray(branches.id, filter.branchIds),
                columns: { storeId: true },
            });
            const ownerStoreIds = [...new Set(ownerBranches.map(b => b.storeId))];
            const scopedProds = await db.query.products.findMany({
                where: or(
                    inArray(products.branchId, filter.branchIds),
                    and(isNull(products.branchId), ownerStoreIds.length > 0 ? inArray(products.storeId, ownerStoreIds) : sql`1 = 0`),
                )!,
                columns: { id: true },
            });
            const productIds = scopedProds.map(p => p.id);
            skuConds.push(productIds.length > 0 ? inArray(skuVariants.productId, productIds) : sql`1 = 0`);
        } else if (filter?.tenantId) {
            // Tenant admin (roleLevel <= 2), or an HQ level with no resolved branchIds yet
            skuConds.push(eq(skuVariants.tenantId, filter.tenantId));
        }

        if (productId) skuConds.push(eq(skuVariants.productId, String(productId)));
        if (status === 'active') skuConds.push(eq(skuVariants.isActive, true));
        if (status === 'inactive') skuConds.push(eq(skuVariants.isActive, false));
        if (search) {
            const s = String(search);
            skuConds.push(or(ilike(skuVariants.sku, `%${s}%`), ilike(skuVariants.barcode, `%${s}%`), ilike(skuVariants.name, `%${s}%`)));
        }
        const skuWhere = skuConds.length > 0 ? and(...skuConds) : undefined;

        const [[{ value: total }], [{ value: activeCount }], skuRows] = await Promise.all([
            db.select({ value: count() }).from(skuVariants).where(skuWhere),
            db.select({ value: count() }).from(skuVariants).where(eq(skuVariants.isActive, true)),
            db.query.skuVariants.findMany({
                where: skuWhere,
                with: { product: { columns: { id: true, name: true, sku: true, price: true, cost: true } }, inventory: true },
                orderBy: desc(skuVariants.createdAt),
                offset: skip,
                limit: limitNum,
            }),
        ]);

        // Transform to include productName and stock
        const transformed = skuRows.map(sv => {
            const totalStock = sv.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
            return {
                id: sv.id,
                sku: sv.sku,
                barcode: sv.barcode,
                productId: sv.productId,
                productName: sv.product?.name || sv.name,
                variant: sv.name,
                unitCost: sv.cost || 0,
                sellingPrice: sv.price || 0,
                isActive: sv.isActive,
                attributes: sv.attributes,
                stock: totalStock,
                inventory: sv.inventory,
                createdAt: sv.createdAt,
                updatedAt: sv.updatedAt,
            };
        });

        res.json({ 
            success: true, 
            data: transformed,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
                stats: {
                    total,
                    active: activeCount,
                    inactive: total - activeCount,
                    withStock: transformed.filter(v => v.stock > 0).length,
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get SKU variant by ID
productRoutes.get('/skus/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const skuVariant = await db.query.skuVariants.findFirst({
            where: eq(skuVariants.id, req.params.id),
            with: { product: true },
        });

        if (!skuVariant) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'SKU variant not found' } });
            return;
        }

        // sku_variants has no branchId/storeId of its own — scope comes from
        // the parent product. Passing the bare skuVariant row here meant
        // record.branchId/storeId were always undefined, which fell through
        // every branch of ensureScopeAccess to `false` for any non-admin
        // caller — this 403'd every legitimate branch-level SKU lookup.
        if (!ensureScopeAccess({ branchId: skuVariant.product?.branchId, storeId: skuVariant.product?.storeId, tenantId: skuVariant.tenantId }, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this SKU variant' } });
        }

        res.json({ success: true, data: skuVariant });
    } catch (error) {
        next(error);
    }
});

// Create SKU variant
productRoutes.post('/skus', authenticate, withTenantTx(), authorize('products:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { productId, productName, variant, sku, barcode, unitCost, sellingPrice, isActive, attributes } = req.body;

        // Validate required fields
        if (!sku) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_001', message: 'SKU is required' }
            });
            return;
        }

        // Handle empty strings for unique fields
        const skuData: any = {
            name: variant || productName || 'Default',
            sku,
            tenantId: req.authUser?.tenantId || req.user?.tenantId,
            cost: unitCost ? Number(unitCost) : 0,
            price: sellingPrice ? Number(sellingPrice) : 0,
            isActive: isActive !== false,
            attributes: attributes || {},
        };
        
        // Only add productId if provided and valid
        if (productId && productId !== '') {
            skuData.productId = productId;
        }
        
        // Handle barcode - only add if not empty
        if (barcode && barcode.trim() !== '') {
            skuData.barcode = barcode.trim();
        }

        const [skuVariant] = await db.insert(skuVariants).values(skuData).returning();

        res.status(201).json({ success: true, data: skuVariant });
    } catch (error: any) {
        // Handle unique constraint violation
        if (error.code === '23505') {
            const detail = error.detail || '';
            const field = detail.match(/\((.+?)\)/)?.[1] || 'field';
            res.status(400).json({ success: false, error: { code: 'DUPLICATE_001', message: `${field} already exists. Please use a different value.`, field } });
            return;
        }
        next(error);
    }
});

// Update SKU variant
productRoutes.put('/skus/:id', authenticate, withTenantTx(), authorize('products:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { productName, variant, sku, barcode, unitCost, sellingPrice, isActive, attributes } = req.body;

        const [skuVariant] = await db.update(skuVariants).set({
            name: variant || productName,
            sku,
            barcode: barcode || null,
            cost: unitCost,
            price: sellingPrice,
            isActive,
            attributes,
        }).where(eq(skuVariants.id, req.params.id)).returning();

        res.json({ success: true, data: skuVariant });
    } catch (error) {
        next(error);
    }
});

// Delete SKU variant
productRoutes.delete('/skus/:id', authenticate, withTenantTx(), authorize('products:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        await db.update(skuVariants).set({ isActive: false }).where(eq(skuVariants.id, req.params.id));

        res.json({ success: true, data: { message: 'SKU variant deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE ROUTES (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Generate SKU
productRoutes.get('/generate/sku', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { categoryId, prefix } = req.query;
        
        // Get category prefix if categoryId provided
        let categoryPrefix = 'PRD';
        if (categoryId) {
            const category = await db.query.categories.findFirst({
                where: eq(categories.id, String(categoryId)),
                columns: { name: true },
            });
            if (category) categoryPrefix = category.name.substring(0, 3).toUpperCase();
        }
        
        const usePrefix = prefix ? String(prefix).toUpperCase() : categoryPrefix;
        
        const [lastProduct, lastSKU] = await Promise.all([
            db.query.products.findFirst({
                where: ilike(products.sku, `${usePrefix}%`),
                orderBy: desc(products.sku),
                columns: { sku: true },
            }),
            db.query.skuVariants.findFirst({
                where: ilike(skuVariants.sku, `${usePrefix}%`),
                orderBy: desc(skuVariants.sku),
                columns: { sku: true },
            }),
        ]);
        
        let nextNumber = 1;
        const lastSkuValue = [lastProduct?.sku, lastSKU?.sku]
            .filter(Boolean)
            .sort()
            .reverse()[0];
            
        if (lastSkuValue) {
            const match = lastSkuValue.match(/(\d+)$/);
            if (match) {
                nextNumber = parseInt(match[1], 10) + 1;
            }
        }
        
        const sku = `${usePrefix}-${String(nextNumber).padStart(4, '0')}`;
        
        res.json({ success: true, data: { sku } });
    } catch (error) {
        next(error);
    }
});

// Generate Barcode (14-digit format - GTIN-14)
productRoutes.get('/generate/barcode', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // Generate unique 14-digit barcode
        const prefix = '0885'; // Packaging indicator (0) + Laos country code (885)
        
        // Find the last barcode from both products and SKU variants. Used to
        // load every existing barcode (two unbounded findMany calls) into a
        // Set just to check uniqueness — fine at a few hundred products, but
        // at scale (tens of thousands of products across a tenant) that's a
        // full-catalog load on every single barcode-generation request. Since
        // nextNumber already starts one past the last known barcode, a
        // per-candidate existence check is both cheaper and correct — a
        // collision here only happens if a barcode was manually entered out
        // of sequence, which the retry loop below still handles.
        const [lastProduct, lastSKU] = await Promise.all([
            db.query.products.findFirst({ where: ilike(products.barcode, `${prefix}%`), orderBy: desc(products.barcode), columns: { barcode: true } }),
            db.query.skuVariants.findFirst({ where: ilike(skuVariants.barcode, `${prefix}%`), orderBy: desc(skuVariants.barcode), columns: { barcode: true } }),
        ]);

        let nextNumber = 1;
        const lastBarcodeValue = [lastProduct?.barcode, lastSKU?.barcode]
            .filter(Boolean)
            .sort()
            .reverse()[0];
            
        if (lastBarcodeValue && lastBarcodeValue.length === 14) {
            const numPart = lastBarcodeValue.substring(4, 13);
            nextNumber = parseInt(numPart, 10) + 1;
        }
        
        // Generate unique barcode (try up to 100 times)
        let barcode = '';
        for (let attempt = 0; attempt < 100; attempt++) {
            // Generate 13-digit barcode base (excluding check digit)
            const barcodeBase = prefix + String(nextNumber).padStart(9, '0');
            
            // Calculate GTIN-14 check digit
            let sum = 0;
            for (let i = 0; i < 13; i++) {
                sum += parseInt(barcodeBase[i], 10) * (i % 2 === 0 ? 3 : 1);
            }
            const checkDigit = (10 - (sum % 10)) % 10;
            
            barcode = barcodeBase + checkDigit;

            // Check if unique via a targeted lookup instead of a preloaded Set
            const [existingProduct, existingSku] = await Promise.all([
                db.query.products.findFirst({ where: eq(products.barcode, barcode), columns: { id: true } }),
                db.query.skuVariants.findFirst({ where: eq(skuVariants.barcode, barcode), columns: { id: true } }),
            ]);
            if (!existingProduct && !existingSku) {
                break;
            }
            nextNumber++;
        }
        
        res.json({ success: true, data: { barcode } });
    } catch (error) {
        next(error);
    }
});

// Get all available barcodes (for dropdown)
// NOTE: the real, tenant/branch-scoped /barcodes handler is further down in
// this file (was previously unreachable dead code — Express matches route
// registration order, and an earlier, completely unscoped /barcodes handler
// used to be registered here first, silently leaking every tenant's barcodes
// to every caller). Removed; see the scoped handler below.

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP ROUTE (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get product by barcode/SKU (scope-filtered)
productRoutes.get('/lookup/:code', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const lookupConds: any[] = [or(eq(products.barcode, req.params.code), eq(products.sku, req.params.code)), eq(products.isActive, true)];
        // BE-32: Tenant isolation on lookup
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            lookupConds.push(eq(products.tenantId, tenantId));
        }
        const branchIds = req.authUser?.accessibleBranchIds || [];
        if (branchIds.length > 0 && !isAdmin(req)) {
            // Must also match shared (branchId null) products from the
            // scanning branch's own store — a plain inArray(branchId, ...)
            // would never match a shared catalog item during a POS barcode
            // scan, since its branchId is null.
            const ownerBranches = await db.query.branches.findMany({
                where: inArray(branches.id, branchIds),
                columns: { storeId: true },
            });
            const ownerStoreIds = [...new Set(ownerBranches.map(b => b.storeId))];
            lookupConds.push(or(
                inArray(products.branchId, branchIds),
                and(isNull(products.branchId), ownerStoreIds.length > 0 ? inArray(products.storeId, ownerStoreIds) : sql`1 = 0`),
            )!);
        }

        const product = await db.query.products.findFirst({
            where: and(...lookupConds),
            with: { category: true, inventory: true },
        });

        if (!product) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Product not found' } });
            return;
        }

        res.json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

// Get all products (with branch/store filtering)
productRoutes.get('/', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { page = 1, limit = 20, search, categoryId, branchId, storeId, all } = req.query;
        const returnAll = all === 'true';
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const prodConds: any[] = [eq(products.isActive, true)];

        // Scoping mirrors categories/presentation/routes.ts: every product
        // carries its owning store's id, and is either shared (branchId
        // null — visible at every branch under that store) or exclusive to
        // one branch. A whole-store grant sees everything under the store
        // (both shared and every branch's exclusive items) since every row
        // already carries the right storeId — no separate productStores
        // lookup needed (that table is no longer the source of truth here).
        if (filter?.scopeByStore && filter.storeIds.length > 0) {
            prodConds.push(inArray(products.storeId, filter.storeIds));
        } else if (filter && filter.branchIds.length > 0) {
            const ownerBranches = await db.query.branches.findMany({
                where: inArray(branches.id, filter.branchIds),
                columns: { storeId: true },
            });
            const ownerStoreIds = [...new Set(ownerBranches.map(b => b.storeId))];
            prodConds.push(or(
                inArray(products.branchId, filter.branchIds),
                and(isNull(products.branchId), ownerStoreIds.length > 0 ? inArray(products.storeId, ownerStoreIds) : sql`1 = 0`),
            )!);
        } else if (filter?.tenantId) {
            // Tenant admin (roleLevel <= 2), or an HQ level with no resolved branchIds yet
            prodConds.push(eq(products.tenantId, filter.tenantId));
        }

        if (branchId) {
            // Empty filter.branchIds means "no restriction" (tenant-wide
            // admin), not "allowed in zero branches" — without the length
            // check this 403'd every tenant-wide owner as soon as the UI
            // passed an explicit branchId (e.g. the dashboard always does).
            if (filter && filter.branchIds.length > 0 && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
            prodConds.push(eq(products.branchId, String(branchId)));
        }
        
        if (search) {
            const s = String(search);
            prodConds.push(or(ilike(products.name, `%${s}%`), ilike(products.sku, `%${s}%`), ilike(products.barcode, `%${s}%`)));
        }
        if (categoryId) prodConds.push(eq(products.categoryId, String(categoryId)));

        // `storeId` was destructured from the query above but never actually
        // used — a tenant-wide admin (whole-tenant scope, no branchIds to
        // narrow by) always got every store's products regardless of which
        // store was selected in the UI. The POS page already sends this
        // param correctly on every store switch; the backend just silently
        // dropped it. Narrows within whatever the caller's branchFilter
        // scope already allows — never widens it.
        if (storeId) prodConds.push(eq(products.storeId, String(storeId)));

        const prodWhere = and(...prodConds);

        const [productRows, [{ value: total }]] = await Promise.all([
            db.query.products.findMany({
                where: prodWhere,
                ...(returnAll ? {} : { offset: skip, limit: Number(limit) }),
                with: { category: true, branch: { columns: { id: true, name: true, code: true } }, inventory: true },
                orderBy: desc(products.createdAt),
            }),
            db.select({ value: count() }).from(products).where(prodWhere),
        ]);

        const productsWithStock = productRows.map(product => {
            const totalStock = product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
            return { ...product, stock: totalStock, minStock: product.lowStockThreshold };
        });

        res.json({
            success: true,
            data: productsWithStock,
            meta: {
                page: Number(page),
                limit: returnAll ? total : Number(limit),
                total,
                totalPages: returnAll ? 1 : Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create product
productRoutes.post('/', authenticate, withTenantTx(), branchFilter(), authorize('products:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { stock, minStock, scope, ...productData } = req.body;

        // Ensure tenant scoping
        if (!productData.tenantId) {
            productData.tenantId = req.authUser?.tenantId || req.user?.tenantId;
        }

        // Ensure array columns are always arrays (prevent PgArray value.map error)
        if (productData.images !== undefined) productData.images = Array.isArray(productData.images) ? productData.images : [];
        if (productData.tags !== undefined) productData.tags = Array.isArray(productData.tags) ? productData.tags : [];

        // Get user's branchId from auth context (NOT from any random branch)
        if (!productData.branchId) {
            productData.branchId = req.authUser?.activeBranchId || req.user?.branchId;
        }

        // Resolve storeId (now required — every product belongs to exactly
        // one store/brand): explicit body.storeId > branchId's owning store >
        // caller's activeStoreId > caller's own branch's owning store. Same
        // chain as categories/presentation/routes.ts's storeId resolution.
        // Must run BEFORE the scope:'store' branchId nulling below, since the
        // resolved branchId (even one about to become a shared product) is
        // the most reliable source for which store this product belongs to —
        // an owner creating a shared product from branch A's context has no
        // activeStoreId/authUser.branchId to fall back on otherwise.
        if (!productData.storeId) {
            if (productData.branchId) {
                const owningBranch = await db.query.branches.findFirst({
                    where: eq(branches.id, productData.branchId),
                    columns: { storeId: true },
                });
                if (owningBranch) productData.storeId = owningBranch.storeId;
            }
            if (!productData.storeId) productData.storeId = req.authUser?.activeStoreId;
            if (!productData.storeId && req.authUser?.branchId) {
                const owningBranch = await db.query.branches.findFirst({
                    where: eq(branches.id, req.authUser.branchId),
                    columns: { storeId: true },
                });
                if (owningBranch) productData.storeId = owningBranch.storeId;
            }
        }

        // `scope: 'store'` is an explicit opt-in to create a shared, brand-
        // level product (visible/sellable at every branch under the store) —
        // default stays 'branch' so every existing caller that never sends
        // `scope` keeps today's exact behavior (branch-exclusive product).
        if (scope === 'store') {
            productData.branchId = null;
        }

        if (!productData.storeId) {
            res.status(400).json({
                success: false,
                error: { code: 'VALIDATION_001', message: 'Store ID is required. Please select an active store.' }
            });
            return;
        }

        // Verify access: branch access if branch-exclusive, else store access.
        if (productData.branchId) {
            if (!ensureScopeAccess({ branchId: productData.branchId }, req)) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
        } else if (!ensureScopeAccess({ storeId: productData.storeId }, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this store' } });
        }

        // Handle empty categoryId and vendorId
        if (productData.categoryId === '' || productData.categoryId === null) {
            delete productData.categoryId;
        }
        if (productData.vendorId === '' || productData.vendorId === null) {
            delete productData.vendorId;
        }
        
        // Handle empty sku and barcode - convert to null for unique constraint
        if (productData.sku === '' || productData.sku === null) {
            delete productData.sku;
        }
        if (productData.barcode === '' || productData.barcode === null) {
            delete productData.barcode;
        }
        
        // Map minStock to lowStockThreshold
        if (minStock !== undefined) {
            productData.lowStockThreshold = minStock;
        }

        const [product] = await db.insert(products).values(productData).returning();

        // Create initial inventory if stock provided. Only meaningful for a
        // branch-exclusive product — a shared (branchId null) product has no
        // single branch to seed stock into; each branch gets its own
        // inventory row lazily on its own first stock-in.
        if (stock !== undefined && stock > 0 && productData.branchId) {
            await db.insert(inventory).values({
                tenantId: product.tenantId,
                productId: product.id,
                branchId: productData.branchId,
                storeId: productData.storeId || null,
                quantity: stock,
                available: stock,
            });
        }

        // Auto-create SKUVariant if product has SKU
        if (product.sku) {
            try {
                await db.insert(skuVariants).values({
                    productId: product.id,
                    tenantId: product.tenantId,
                    sku: product.sku,
                    // Deliberately NOT copying product.barcode here — this
                    // auto-created row is an internal default-variant record,
                    // not a distinct sellable/scannable item (POS barcode
                    // scan only ever looks up products.barcode, never
                    // sku_variants.barcode for this row). Copying it made the
                    // same barcode value appear twice on the Barcode/QR label
                    // page (once from /products/barcodes, once from
                    // /products/skus), since those are merged by row id, not
                    // by barcode value.
                    name: product.name,
                    attributes: {},
                    price: product.price || 0,
                    cost: product.cost || 0,
                });
            } catch (skuErr: any) {
                if (skuErr.code !== '23505') console.error('Auto SKU create error:', skuErr);
            }
        }

        await invalidateQueryCache('products*');
        await invalidateQueryCache('inventory*');
        res.status(201).json({ success: true, data: product });
    } catch (error: any) {
        if (error.code === '23505') {
            const detail = error.detail || '';
            const field = detail.match(/\((.+?)\)/)?.[1] || 'field';
            res.status(400).json({ success: false, error: { code: 'DUPLICATE_001', message: `${field} already exists. Please use a different value.`, field } });
            return;
        }
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// BARCODE HELPERS (Must be before /:id)
// ═══════════════════════════════════════════════════════════════════════════

// Get all products with barcodes (for barcode page listing)
productRoutes.get('/barcodes', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const filter = req.branchFilter;
        const conds: any[] = [isNotNull(products.barcode)];

        if (filter?.scopeByStore && filter.storeIds.length > 0) {
            conds.push(inArray(products.storeId, filter.storeIds));
        } else if (filter && filter.branchIds.length > 0) {
            const ownerBranches = await db.query.branches.findMany({
                where: inArray(branches.id, filter.branchIds),
                columns: { storeId: true },
            });
            const ownerStoreIds = [...new Set(ownerBranches.map(b => b.storeId))];
            conds.push(or(
                inArray(products.branchId, filter.branchIds),
                and(isNull(products.branchId), ownerStoreIds.length > 0 ? inArray(products.storeId, ownerStoreIds) : sql`1 = 0`),
            )!);
        } else if (filter?.tenantId) {
            conds.push(eq(products.tenantId, filter.tenantId));
        }

        const rows = await db.query.products.findMany({
            where: and(...conds),
            columns: { id: true, name: true, sku: true, barcode: true, price: true },
            orderBy: asc(products.name),
        });
        res.json({ success: true, data: rows });
    } catch (error) {
        next(error);
    }
});

// Get product by ID (MUST BE AFTER ALL SPECIFIC ROUTES)
productRoutes.get('/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-32: Tenant-scoped lookup — prevents cross-tenant ID guessing
        const tenantId = req.authUser?.tenantId;
        const getConds: any[] = [eq(products.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            getConds.push(eq(products.tenantId, tenantId));
        }

        const product = await db.query.products.findFirst({
            where: and(...getConds),
            with: { category: true, inventory: true },
        });

        if (!product) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Product not found or no access' } });
            return;
        }

        if (!ensureScopeAccess(product, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this product' } });
        }

        res.json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
});

// Update product (scope-checked)
productRoutes.put('/:id', authenticate, withTenantTx(), authorize('products:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-34: Tenant-scoped update
        const tenantId = req.authUser?.tenantId;
        const updateConds: any[] = [eq(products.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            updateConds.push(eq(products.tenantId, tenantId));
        }

        // storeId/tenantId are required for ensureScopeAccess to correctly
        // fall back to store-level scope for a shared (branchId=null)
        // product — selecting branchId alone made it fall through to the
        // "record has no scope fields at all" backward-compat branch and
        // grant access to everyone.
        const existing = await db.query.products.findFirst({ where: and(...updateConds), columns: { branchId: true, storeId: true, tenantId: true } });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Product not found or no access' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const { stock, minStock, ...productData } = req.body;

        if (productData.categoryId === '' || productData.categoryId === null) delete productData.categoryId;
        if (productData.vendorId === '' || productData.vendorId === null) delete productData.vendorId;
        if (productData.sku === '') productData.sku = null;
        if (productData.barcode === '') productData.barcode = null;
        if (minStock !== undefined) productData.lowStockThreshold = minStock;
        // '' means "not selected" from a form — null is an explicit request
        // to convert this to a shared (store-level) product, and must reach
        // the DB, not get silently dropped.
        if (productData.branchId === '') productData.branchId = null;
        // Ensure array columns are always arrays
        if (productData.images !== undefined) productData.images = Array.isArray(productData.images) ? productData.images : [];
        if (productData.tags !== undefined) productData.tags = Array.isArray(productData.tags) ? productData.tags : [];
        // Never allow changing tenantId or storeId (immutable post-creation,
        // same as branches.storeId/stores.tenantId elsewhere in this codebase)
        delete productData.tenantId;
        delete productData.storeId;

        const [product] = await db.update(products).set({ ...productData, updatedAt: new Date() }).where(and(...updateConds)).returning();

        await invalidateQueryCache('products*');
        res.json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
});

// Delete product (soft delete, scope-checked)
productRoutes.delete('/:id', authenticate, withTenantTx(), authorize('products:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        // BE-35: Tenant-scoped delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(products.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            delConds.push(eq(products.tenantId, tenantId));
        }

        const existing = await db.query.products.findFirst({ where: and(...delConds), columns: { branchId: true, storeId: true, tenantId: true } });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Product not found or no access' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        await db.update(products).set({ isActive: false, updatedAt: new Date() }).where(and(...delConds));

        await invalidateQueryCache('products*');
        await invalidateQueryCache('inventory*');
        res.json({ success: true, data: { message: 'Product deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT PRODUCTS FROM EXCEL
// ═══════════════════════════════════════════════════════════════════════════

// Single source of truth for both the downloadable template's header row and
// the upload validator below — the importer only ever recognizes rows keyed
// by one of these column names.
const IMPORT_TEMPLATE_HEADERS = ['name', 'ຊື່ສິນຄ້າ', 'sku', 'SKU', 'barcode', 'ບາໂຄດ', 'price', 'ລາຄາຂາຍ', 'cost', 'ລາຄາທຶນ', 'unit', 'ໜ່ວຍ', 'category', 'ໝວດໝູ່', 'lowStockThreshold'];
// The actual columns written into the generated template (one canonical
// header per field, not every recognized alias).
const IMPORT_TEMPLATE_COLUMNS = ['ຊື່ສິນຄ້າ', 'SKU', 'ບາໂຄດ', 'ລາຄາຂາຍ', 'ລາຄາທຶນ', 'ໜ່ວຍ', 'ໝວດໝູ່', 'lowStockThreshold'];

// GET /products/import/template — the only file the import endpoint below
// will accept. Requested by super_admin: import must reject arbitrary
// spreadsheets and only accept the system's own exported template, so the
// header row here is also the allowlist the importer validates against.
productRoutes.get('/import/template', authenticate, authorize('products:import'), async (req, res, next) => {
    try {
        const worksheet = XLSX.utils.aoa_to_sheet([IMPORT_TEMPLATE_COLUMNS]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Products');
        const out = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="kpos-product-import-template.xlsx"');
        res.send(out);
    } catch (error) {
        next(error);
    }
});

productRoutes.post('/import/excel', authenticate, withTenantTx(), authorize('products:import'), upload.single('file'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        if (!req.file) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'No file uploaded' } });

        // Magic byte validation: XLSX/XLS/CSV are ZIP-based (PK\x03\x04) or plaintext
        const buf = req.file.buffer;
        const isZipBased   = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
        const isOldXLS     = buf[0] === 0xD0 && buf[1] === 0xCF && buf[2] === 0x11 && buf[3] === 0xE0;
        const isCSVish     = req.file.originalname.toLowerCase().endsWith('.csv');
        if (!isZipBased && !isOldXLS && !isCSVish) {
            return res.status(400).json({ success: false, error: { code: 'INVALID_FILE', message: 'File must be a valid Excel (.xlsx, .xls) or CSV file' } });
        }

        const branchId = req.body.branchId || req.authUser?.activeBranchId || req.user!.branchId;
        const tenantId = req.authUser?.isSuperAdmin ? undefined : req.authUser?.tenantId;

        if (!branchId) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'branchId is required' } });

        // storeId is a required column on products (every product belongs to
        // exactly one store/brand) — this importer used to omit it entirely,
        // so every single row failed with a `store_id` not-null violation and
        // the import silently reported "0 created" no matter what the file
        // contained. Same resolution chain as the single-product POST route:
        // the target branch's owning store > caller's activeStoreId.
        let storeId: string | undefined = req.body.storeId || req.authUser?.activeStoreId;
        if (!storeId) {
            const owningBranch = await db.query.branches.findFirst({ where: eq(branches.id, branchId), columns: { storeId: true } });
            storeId = owningBranch?.storeId;
        }
        if (!storeId) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Could not resolve storeId for this branch' } });

        const workbook = XLSX.read(buf, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rows.length) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Excel file is empty' } });

        // Only accept files whose header row matches the downloadable
        // template (GET /products/import/template) — every column must be a
        // recognized field, and the two required fields (name, price) must
        // both be present. Rejects arbitrary spreadsheets up front instead of
        // silently importing whatever happens to parse, or worse, importing
        // nothing while reporting a confusing per-row error for every row.
        const headerKeys = Object.keys(rows[0]);
        const unknownHeaders = headerKeys.filter(h => !IMPORT_TEMPLATE_HEADERS.includes(h));
        const hasName = headerKeys.some(h => h === 'name' || h === 'ຊື່ສິນຄ້າ');
        const hasPrice = headerKeys.some(h => h === 'price' || h === 'ລາຄາຂາຍ');
        if (unknownHeaders.length > 0 || !hasName || !hasPrice) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_TEMPLATE',
                    message: 'File does not match the product import template. Please download the template (GET /products/import/template) and fill it in without changing the column headers.',
                    details: { unknownHeaders, hasName, hasPrice },
                },
            });
        }

        // Fetch categories for name→id lookup
        const catRows = await db.query.categories.findMany({ columns: { id: true, name: true } });
        const catMap = new Map(catRows.map(c => [c.name.toLowerCase().trim(), c.id]));

        const created: any[] = [];
        const errors: { row: number; message: string }[] = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row (1-indexed header)

            const name = String(row['name'] || row['ຊື່ສິນຄ້າ'] || '').trim();
            if (!name) { errors.push({ row: rowNum, message: 'name is required' }); continue; }

            const price = parseFloat(row['price'] || row['ລາຄາຂາຍ'] || 0);
            if (isNaN(price) || price < 0) { errors.push({ row: rowNum, message: 'invalid price' }); continue; }

            const catName = String(row['category'] || row['ໝວດໝູ່'] || '').trim().toLowerCase();
            const categoryId = catName ? (catMap.get(catName) ?? null) : null;

            const productData: any = {
                name,
                sku: String(row['sku'] || row['SKU'] || '').trim() || null,
                barcode: String(row['barcode'] || row['ບາໂຄດ'] || '').trim() || null,
                price,
                cost: parseFloat(row['cost'] || row['ລາຄາທຶນ'] || 0) || 0,
                unit: String(row['unit'] || row['ໜ່ວຍ'] || 'piece').trim(),
                categoryId,
                branchId,
                storeId,
                tenantId: tenantId ?? null,
                isActive: true,
                isVat: true,
                vatRate: 7,
                trackStock: true,
                lowStockThreshold: parseInt(row['lowStockThreshold'] || 10),
                allowDecimal: false,
                sortOrder: 0,
                tags: [],
            };

            try {
                const [inserted] = await db.insert(products).values(productData).returning();
                created.push(inserted);
            } catch (e: any) {
                errors.push({ row: rowNum, message: e.message ?? 'Insert failed' });
            }
        }

        if (created.length) {
            await invalidateQueryCache('products*');
            await invalidateQueryCache('inventory*');
        }

        res.json({
            success: true,
            data: {
                total: rows.length,
                created: created.length,
                errors,
            }
        });
    } catch (error) {
        next(error);
    }
});
