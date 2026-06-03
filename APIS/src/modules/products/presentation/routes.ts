// ═══════════════════════════════════════════════════════════════════════════
// Products Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { authenticate, authorize, branchFilter, applyScopeFilter, ensureScopeAccess, buildScopeCondition, buildBranchIdScope, invalidateQueryCache, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { db, dbRead } from '@/config/database.config';
import { products, categories, priceLevels, productPriceLevels, skuVariants, inventory, productStores } from '@/db/schema/tables';
import { eq, and, or, ne, ilike, inArray, isNotNull, isNull, desc, asc, count, sql } from 'drizzle-orm';

export const productRoutes = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ═══════════════════════════════════════════════════════════════════════════
// PRICE LEVEL ROUTES (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get all price levels
productRoutes.get('/price-levels', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;
        const conditions: any[] = [];

        // Tenant isolation
        if (filter?.tenantId) {
            conditions.push(eq(priceLevels.tenantId, filter.tenantId));
        }

        const priceLevelRows = await db.query.priceLevels.findMany({
            where: conditions.length > 0 ? and(...conditions) : undefined,
            with: { products: { with: { product: { columns: { id: true, name: true, sku: true, price: true } } } } },
            orderBy: [desc(priceLevels.isDefault), asc(priceLevels.createdAt)],
        });

        res.json({ success: true, data: priceLevelRows });
    } catch (error: any) {
        // If table doesn't exist yet (schema not pushed), return empty
        if (error?.message?.includes('relation') && error?.message?.includes('does not exist')) {
            return res.json({ success: true, data: [] });
        }
        next(error);
    }
});

// Get price level by ID
productRoutes.get('/price-levels/:id', authenticate, async (req, res, next) => {
    try {
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
productRoutes.post('/price-levels', authenticate, authorize('products:create'), async (req, res, next) => {
    try {
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
productRoutes.put('/price-levels/:id', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
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
productRoutes.put('/price-levels/:id/set-default', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
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
productRoutes.delete('/price-levels/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
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
productRoutes.post('/price-levels/prices', authenticate, authorize('products:create'), async (req, res, next) => {
    try {
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
productRoutes.put('/price-levels/prices/:id', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
        const { price } = req.body;

        const [ppl] = await db.update(productPriceLevels).set({ price }).where(eq(productPriceLevels.id, req.params.id)).returning();

        res.json({ success: true, data: ppl });
    } catch (error) {
        next(error);
    }
});

// Delete product price from a level
productRoutes.delete('/price-levels/prices/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
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
productRoutes.get('/skus', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { productId, search, status, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        const filter = req.branchFilter;
        
        const skuConds: any[] = [];

        // Scope SKU variants to user's accessible products
        if (filter?.scopeByStore && filter.storeIds.length > 0) {
            // Get product IDs mapped to their stores
            const storeProds = await db.query.productStores.findMany({
                where: inArray(productStores.storeId, filter.storeIds),
                columns: { productId: true }
            });
            const scopedProductIds = storeProds.map(sp => sp.productId);

            if (scopedProductIds.length > 0) {
                skuConds.push(inArray(skuVariants.productId, scopedProductIds));
            } else if (filter.tenantId) {
                // No store-product mappings yet — fall back to all tenant SKUs
                skuConds.push(eq(skuVariants.tenantId, filter.tenantId));
            }
        } else if (filter) {
            // Branch scoped users (e.g. branch admins) need to filter by product's branchId
            if (filter.branchIds.length > 0) {
                const branchProds = await db.query.products.findMany({
                    where: inArray(products.branchId, filter.branchIds),
                    columns: { id: true }
                });
                const branchProdIds = branchProds.map(p => p.id);
                if (branchProdIds.length > 0) {
                    skuConds.push(inArray(skuVariants.productId, branchProdIds));
                } else {
                    skuConds.push(sql`1 = 0`);
                }
            } else if (filter.tenantId) {
                // Tenant fallback
                skuConds.push(eq(skuVariants.tenantId, filter.tenantId));
            }
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
productRoutes.get('/skus/:id', authenticate, async (req, res, next) => {
    try {
        const skuVariant = await db.query.skuVariants.findFirst({
            where: eq(skuVariants.id, req.params.id),
            with: { product: true },
        });

        if (!skuVariant) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'SKU variant not found' } });
            return;
        }

        if (!ensureScopeAccess(skuVariant, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this SKU variant' } });
        }

        res.json({ success: true, data: skuVariant });
    } catch (error) {
        next(error);
    }
});

// Create SKU variant
productRoutes.post('/skus', authenticate, authorize('products:create'), async (req, res, next) => {
    try {
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
productRoutes.put('/skus/:id', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
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
productRoutes.delete('/skus/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
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
productRoutes.get('/generate/sku', authenticate, async (req, res, next) => {
    try {
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
productRoutes.get('/generate/barcode', authenticate, async (req, res, next) => {
    try {
        // Generate unique 14-digit barcode
        const prefix = '0885'; // Packaging indicator (0) + Laos country code (885)
        
        // Find the last barcode from both products and SKU variants
        const [lastProduct, lastSKU, allProductBarcodes, allSkuBarcodes] = await Promise.all([
            db.query.products.findFirst({ where: ilike(products.barcode, `${prefix}%`), orderBy: desc(products.barcode), columns: { barcode: true } }),
            db.query.skuVariants.findFirst({ where: ilike(skuVariants.barcode, `${prefix}%`), orderBy: desc(skuVariants.barcode), columns: { barcode: true } }),
            db.query.products.findMany({ where: isNotNull(products.barcode), columns: { barcode: true } }),
            db.query.skuVariants.findMany({ where: isNotNull(skuVariants.barcode), columns: { barcode: true } }),
        ]);
        
        // Create set of existing barcodes for quick lookup
        const existingBarcodes = new Set([
            ...allProductBarcodes.map(p => p.barcode),
            ...allSkuBarcodes.map(s => s.barcode)
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
            
            // Check if unique
            if (!existingBarcodes.has(barcode)) {
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
productRoutes.get('/barcodes', authenticate, async (req, res, next) => {
    try {
        const [productBarcodes, skuBarcodes] = await Promise.all([
            db.query.products.findMany({ where: isNotNull(products.barcode), columns: { barcode: true }, orderBy: asc(products.barcode) }),
            db.query.skuVariants.findMany({ where: isNotNull(skuVariants.barcode), columns: { barcode: true }, orderBy: asc(skuVariants.barcode) }),
        ]);
        
        // Combine and deduplicate barcodes
        const allBarcodes = new Set<string>();
        productBarcodes.forEach(p => p.barcode && allBarcodes.add(p.barcode));
        skuBarcodes.forEach(s => s.barcode && allBarcodes.add(s.barcode));
        
        res.json({ success: true, data: Array.from(allBarcodes).sort() });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// LOOKUP ROUTE (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get product by barcode/SKU (scope-filtered)
productRoutes.get('/lookup/:code', authenticate, async (req, res, next) => {
    try {
        const lookupConds: any[] = [or(eq(products.barcode, req.params.code), eq(products.sku, req.params.code)), eq(products.isActive, true)];
        // BE-32: Tenant isolation on lookup
        const tenantId = req.authUser?.tenantId;
        if (tenantId && !req.authUser?.isSuperAdmin) {
            lookupConds.push(eq(products.tenantId, tenantId));
        }
        const branchIds = req.authUser?.accessibleBranchIds || [];
        if (branchIds.length > 0 && !isAdmin(req)) {
            lookupConds.push(inArray(products.branchId, branchIds));
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
productRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { page = 1, limit = 20, search, categoryId, branchId, storeId } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = req.branchFilter;

        const prodConds: any[] = [eq(products.isActive, true)];
        
        if (filter?.scopeByStore && filter.storeIds.length > 0) {
            // If user is scoped by store, prefer products explicitly mapped to their store
            const storeProds = await db.query.productStores.findMany({
                where: inArray(productStores.storeId, filter.storeIds),
                columns: { productId: true }
            });
            const scopedProductIds = storeProds.map(sp => sp.productId);

            if (scopedProductIds.length > 0) {
                prodConds.push(inArray(products.id, scopedProductIds));
            } else {
                // No store-product mappings — scope to user's branch to prevent cross-branch leakage
                const authBranchId = req.authUser?.activeBranchId || req.authUser?.branchId;
                if (authBranchId) {
                    prodConds.push(eq(products.branchId, authBranchId));
                } else if (filter.tenantId) {
                    prodConds.push(eq(products.tenantId, filter.tenantId));
                }
            }
        } else if (filter) {
            // HQ or branch-scoped: use path-aware branch scope
            const branchScope = buildBranchIdScope(filter, products.branchId);
            if (branchScope) {
                prodConds.push(branchScope);
            } else if (filter.tenantId && !req.authUser?.isSuperAdmin) {
                prodConds.push(eq(products.tenantId, filter.tenantId));
            }
        }

        if (branchId) {
            if (filter && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
            }
            prodConds.push(eq(products.branchId, String(branchId)));
        }
        
        if (search) {
            const s = String(search);
            prodConds.push(or(ilike(products.name, `%${s}%`), ilike(products.sku, `%${s}%`), ilike(products.barcode, `%${s}%`)));
        }
        if (categoryId) prodConds.push(eq(products.categoryId, String(categoryId)));

        const prodWhere = and(...prodConds);

        const [productRows, [{ value: total }]] = await Promise.all([
            db.query.products.findMany({
                where: prodWhere,
                offset: skip,
                limit: Number(limit),
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
                limit: Number(limit),
                total,
                totalPages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Create product
productRoutes.post('/', authenticate, branchFilter(), authorize('products:create'), async (req, res, next) => {
    try {
        const { stock, minStock, ...productData } = req.body;
        
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
        
        if (!productData.branchId) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'VALIDATION_001', message: 'Branch ID is required. Please select an active store/branch.' } 
            });
            return;
        }

        // Verify user has access to the target branch
        if (!ensureScopeAccess({ branchId: productData.branchId }, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access to this branch' } });
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

        // Create initial inventory if stock provided
        if (stock !== undefined && stock > 0 && productData.branchId) {
            await db.insert(inventory).values({
                productId: product.id,
                branchId: productData.branchId,
                quantity: stock,
                available: stock,
            });
        }

        // Map product to active store if user is scoped by store
        const filter = req.branchFilter;
        const targetStoreId = filter?.activeStoreId || filter?.storeIds?.[0];
        if (filter?.scopeByStore && targetStoreId) {
            await db.insert(productStores).values({
                productId: product.id,
                storeId: targetStoreId,
                price: product.price,
                stock: stock || 0,
                minStock: product.lowStockThreshold,
                isActive: true
            });
        }

        // Auto-create SKUVariant if product has SKU
        if (product.sku) {
            try {
                await db.insert(skuVariants).values({
                    productId: product.id,
                    sku: product.sku,
                    barcode: product.barcode || undefined,
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

// Get product by ID (MUST BE AFTER ALL SPECIFIC ROUTES)
productRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
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

// ═══════════════════════════════════════════════════════════════════════════
// BARCODE HELPERS (Must be before /:id)
// ═══════════════════════════════════════════════════════════════════════════

// Get all products with barcodes (for barcode page listing)
productRoutes.get('/barcodes', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = req.branchFilter;
        const conds: any[] = [isNotNull(products.barcode)];
        
        if (filter?.scopeByStore && filter.storeIds.length > 0) {
            // Get product IDs mapped to their stores
            const storeProds = await db.query.productStores.findMany({
                where: inArray(productStores.storeId, filter.storeIds),
                columns: { productId: true }
            });
            const scopedProductIds = storeProds.map(sp => sp.productId);

            if (scopedProductIds.length > 0) {
                conds.push(inArray(products.id, scopedProductIds));
            } else if (filter.tenantId) {
                // No store-product mappings yet — fall back to all tenant products
                conds.push(eq(products.tenantId, filter.tenantId));
            }
        } else if (filter) {
            if (filter.branchIds.length > 0) conds.push(inArray(products.branchId, filter.branchIds));
            else if (filter.tenantId) conds.push(eq(products.tenantId, filter.tenantId));
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

// Generate a unique barcode
productRoutes.get('/generate/barcode', authenticate, async (req, res, next) => {
    try {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const barcode = `${timestamp.slice(-9)}${random}`;
        res.json({ success: true, data: { barcode } });
    } catch (error) {
        next(error);
    }
});

// Generate a unique SKU
productRoutes.get('/generate/sku', authenticate, async (req, res, next) => {
    try {
        const { productId } = req.query;
        let prefix = 'SKU';
        if (productId) {
            const product = await db.query.products.findFirst({
                where: eq(products.id, String(productId)),
                columns: { name: true },
            });
            if (product?.name) {
                prefix = product.name.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
            }
        }
        const [{ value: total }] = await db.select({ value: count() }).from(skuVariants);
        const sku = `${prefix}-${String(total + 1).padStart(5, '0')}`;
        res.json({ success: true, data: { sku } });
    } catch (error) {
        next(error);
    }
});

// Update product (scope-checked)
productRoutes.put('/:id', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
        // BE-34: Tenant-scoped update
        const tenantId = req.authUser?.tenantId;
        const updateConds: any[] = [eq(products.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            updateConds.push(eq(products.tenantId, tenantId));
        }

        const existing = await db.query.products.findFirst({ where: and(...updateConds), columns: { branchId: true } });
        if (!existing) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Product not found or no access' } });
        if (!ensureScopeAccess(existing, req)) return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });

        const { stock, minStock, ...productData } = req.body;
        
        if (productData.categoryId === '' || productData.categoryId === null) delete productData.categoryId;
        if (productData.vendorId === '' || productData.vendorId === null) delete productData.vendorId;
        if (productData.sku === '') productData.sku = null;
        if (productData.barcode === '') productData.barcode = null;
        if (minStock !== undefined) productData.lowStockThreshold = minStock;
        if (!productData.branchId) delete productData.branchId;
        // Ensure array columns are always arrays
        if (productData.images !== undefined) productData.images = Array.isArray(productData.images) ? productData.images : [];
        if (productData.tags !== undefined) productData.tags = Array.isArray(productData.tags) ? productData.tags : [];
        // Never allow changing tenantId
        delete productData.tenantId;

        const [product] = await db.update(products).set({ ...productData, updatedAt: new Date() }).where(and(...updateConds)).returning();

        await invalidateQueryCache('products*');
        res.json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
});

// Delete product (soft delete, scope-checked)
productRoutes.delete('/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
        // BE-35: Tenant-scoped delete
        const tenantId = req.authUser?.tenantId;
        const delConds: any[] = [eq(products.id, req.params.id)];
        if (tenantId && !req.authUser?.isSuperAdmin) {
            delConds.push(eq(products.tenantId, tenantId));
        }

        const existing = await db.query.products.findFirst({ where: and(...delConds), columns: { branchId: true } });
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
productRoutes.post('/import/excel', authenticate, authorize('products:import'), upload.single('file'), async (req, res, next) => {
    try {
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

        const workbook = XLSX.read(buf, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (!rows.length) return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Excel file is empty' } });

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
