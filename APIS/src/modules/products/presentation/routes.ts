// ═══════════════════════════════════════════════════════════════════════════
// Products Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const productRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// PRICE LEVEL ROUTES (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get all price levels
productRoutes.get('/price-levels', authenticate, async (req, res, next) => {
    try {
        const priceLevels = await prisma.priceLevel.findMany({
            include: {
                products: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                sku: true,
                                price: true,
                            }
                        }
                    }
                }
            },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'asc' }
            ],
        });

        res.json({ success: true, data: priceLevels });
    } catch (error) {
        next(error);
    }
});

// Get price level by ID
productRoutes.get('/price-levels/:id', authenticate, async (req, res, next) => {
    try {
        const priceLevel = await prisma.priceLevel.findUnique({
            where: { id: req.params.id },
            include: {
                products: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
                                sku: true,
                                price: true,
                            }
                        }
                    }
                }
            },
        });

        if (!priceLevel) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Price level not found' } });
            return;
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

        // If setting as default, unset current default first
        if (isDefault) {
            await prisma.priceLevel.updateMany({
                where: { isDefault: true },
                data: { isDefault: false },
            });
        }

        const priceLevel = await prisma.priceLevel.create({
            data: {
                name,
                description: description || null,
                isDefault: isDefault || false,
            },
        });

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
            await prisma.priceLevel.updateMany({
                where: { 
                    isDefault: true,
                    NOT: { id: req.params.id }
                },
                data: { isDefault: false },
            });
        }

        const priceLevel = await prisma.priceLevel.update({
            where: { id: req.params.id },
            data: {
                name,
                description: description || null,
                isDefault: isDefault || false,
            },
        });

        res.json({ success: true, data: priceLevel });
    } catch (error) {
        next(error);
    }
});

// Set price level as default
productRoutes.put('/price-levels/:id/set-default', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
        // Unset all defaults
        await prisma.priceLevel.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
        });

        // Set this one as default
        const priceLevel = await prisma.priceLevel.update({
            where: { id: req.params.id },
            data: { isDefault: true },
        });

        res.json({ success: true, data: priceLevel });
    } catch (error) {
        next(error);
    }
});

// Delete price level
productRoutes.delete('/price-levels/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
        // Check if it's the default
        const priceLevel = await prisma.priceLevel.findUnique({
            where: { id: req.params.id },
        });

        if (priceLevel?.isDefault) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'BUSINESS_001', message: 'Cannot delete default price level' } 
            });
            return;
        }

        // Delete associated product prices first
        await prisma.productPriceLevel.deleteMany({
            where: { priceLevelId: req.params.id },
        });

        await prisma.priceLevel.delete({
            where: { id: req.params.id },
        });

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
        const existing = await prisma.productPriceLevel.findFirst({
            where: { productId, priceLevelId },
        });

        if (existing) {
            // Update existing
            const updated = await prisma.productPriceLevel.update({
                where: { id: existing.id },
                data: { price },
            });
            res.json({ success: true, data: updated });
            return;
        }

        const productPriceLevel = await prisma.productPriceLevel.create({
            data: {
                productId,
                priceLevelId,
                price,
            },
        });

        res.status(201).json({ success: true, data: productPriceLevel });
    } catch (error) {
        next(error);
    }
});

// Update product price in a level
productRoutes.put('/price-levels/prices/:id', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
        const { price } = req.body;

        const productPriceLevel = await prisma.productPriceLevel.update({
            where: { id: req.params.id },
            data: { price },
        });

        res.json({ success: true, data: productPriceLevel });
    } catch (error) {
        next(error);
    }
});

// Delete product price from a level
productRoutes.delete('/price-levels/prices/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
        await prisma.productPriceLevel.delete({
            where: { id: req.params.id },
        });

        res.json({ success: true, data: { message: 'Product price deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// SKU VARIANT ROUTES (Must be before /:id to avoid conflicts)
// ═══════════════════════════════════════════════════════════════════════════

// Get all SKU variants with pagination
productRoutes.get('/skus', authenticate, async (req, res, next) => {
    try {
        const { productId, search, status, page = '1', limit = '20' } = req.query;
        const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
        const skip = (pageNum - 1) * limitNum;
        
        const where: Record<string, unknown> = {};
        if (productId) where.productId = String(productId);
        if (status === 'active') where.isActive = true;
        if (status === 'inactive') where.isActive = false;
        if (search) {
            where.OR = [
                { sku: { contains: String(search), mode: 'insensitive' } },
                { barcode: { contains: String(search) } },
                { name: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        // Get total count, stats, and paginated data in parallel
        const [total, activeCount, skuVariants] = await Promise.all([
            prisma.sKUVariant.count({ where }),
            prisma.sKUVariant.count({ where: { isActive: true } }),
            prisma.sKUVariant.findMany({
                where,
                include: { 
                    product: {
                        select: {
                            id: true,
                            name: true,
                            sku: true,
                            price: true,
                            cost: true,
                        }
                    },
                    inventory: true 
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
            })
        ]);

        // Transform to include productName and stock
        const transformed = skuVariants.map(sv => {
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
        const skuVariant = await prisma.sKUVariant.findUnique({
            where: { id: req.params.id },
            include: { product: true },
        });

        if (!skuVariant) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'SKU variant not found' } });
            return;
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

        const skuVariant = await prisma.sKUVariant.create({
            data: skuData,
        });

        res.status(201).json({ success: true, data: skuVariant });
    } catch (error: any) {
        console.error('SKU variant create error:', error);
        // Handle Prisma unique constraint violation
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0] || 'field';
            res.status(400).json({
                success: false,
                error: {
                    code: 'DUPLICATE_001',
                    message: `${field} already exists. Please use a different value.`,
                    field: field
                }
            });
            return;
        }
        next(error);
    }
});

// Update SKU variant
productRoutes.put('/skus/:id', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
        const { productName, variant, sku, barcode, unitCost, sellingPrice, isActive, attributes } = req.body;

        const skuVariant = await prisma.sKUVariant.update({
            where: { id: req.params.id },
            data: {
                name: variant || productName,
                sku,
                barcode: barcode || null,
                cost: unitCost,
                price: sellingPrice,
                isActive,
                attributes,
            },
        });

        res.json({ success: true, data: skuVariant });
    } catch (error) {
        next(error);
    }
});

// Delete SKU variant
productRoutes.delete('/skus/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
        await prisma.sKUVariant.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

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
            const category = await prisma.category.findUnique({
                where: { id: String(categoryId) },
                select: { name: true }
            });
            if (category) {
                // Use first 3 letters of category name
                categoryPrefix = category.name.substring(0, 3).toUpperCase();
            }
        }
        
        const usePrefix = prefix ? String(prefix).toUpperCase() : categoryPrefix;
        
        // Find the last SKU with this prefix (check both products and SKU variants)
        const [lastProduct, lastSKU] = await Promise.all([
            prisma.product.findFirst({
                where: { sku: { startsWith: usePrefix } },
                orderBy: { sku: 'desc' },
                select: { sku: true }
            }),
            prisma.sKUVariant.findFirst({
                where: { sku: { startsWith: usePrefix } },
                orderBy: { sku: 'desc' },
                select: { sku: true }
            })
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
            prisma.product.findFirst({
                where: { barcode: { startsWith: prefix } },
                orderBy: { barcode: 'desc' },
                select: { barcode: true }
            }),
            prisma.sKUVariant.findFirst({
                where: { barcode: { startsWith: prefix } },
                orderBy: { barcode: 'desc' },
                select: { barcode: true }
            }),
            // Also get all barcodes to ensure uniqueness
            prisma.product.findMany({
                where: { barcode: { not: null } },
                select: { barcode: true }
            }),
            prisma.sKUVariant.findMany({
                where: { barcode: { not: null } },
                select: { barcode: true }
            })
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
            prisma.product.findMany({
                where: { barcode: { not: null } },
                select: { barcode: true },
                orderBy: { barcode: 'asc' }
            }),
            prisma.sKUVariant.findMany({
                where: { barcode: { not: null } },
                select: { barcode: true },
                orderBy: { barcode: 'asc' }
            })
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

// Get product by barcode/SKU
productRoutes.get('/lookup/:code', authenticate, async (req, res, next) => {
    try {
        const product = await prisma.product.findFirst({
            where: {
                OR: [
                    { barcode: req.params.code },
                    { sku: req.params.code },
                ],
                isActive: true,
            },
            include: { category: true, inventory: true },
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
        const filter = (req as any).branchFilter;

        const where: Record<string, unknown> = { isActive: true };
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            if (branchId) {
                // Verify user has access to requested branch
                if (!filter.branchIds.includes(String(branchId))) {
                    return res.status(403).json({
                        success: false,
                        error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                    });
                }
                where.branchId = String(branchId);
            } else {
                where.branchId = { in: filter.branchIds };
            }
        } else if (branchId) {
            where.branchId = String(branchId);
        }
        
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { sku: { contains: String(search), mode: 'insensitive' } },
                { barcode: { contains: String(search) } },
            ];
        }
        if (categoryId) where.categoryId = String(categoryId);

        // Build include clause with optional store filtering
        const includeInventory: Record<string, unknown> = {};
        if (filter?.branchIds?.length) {
            includeInventory.where = { branchId: { in: filter.branchIds } };
        }

        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where,
                skip,
                take: Number(limit),
                include: { 
                    category: true,
                    branch: { select: { id: true, name: true, code: true } },
                    inventory: Object.keys(includeInventory).length ? includeInventory : true,
                    stores: storeId ? { where: { storeId: String(storeId), isActive: true } } : false
                },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.product.count({ where }),
        ]);

        // Transform to include stock from inventory
        const productsWithStock = products.map(product => {
            const totalStock = product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
            return {
                ...product,
                stock: totalStock,
                minStock: product.lowStockThreshold,
            };
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
productRoutes.post('/', authenticate, authorize('products:create'), async (req, res, next) => {
    try {
        const { stock, minStock, ...productData } = req.body;
        
        // Get user's branchId if not provided
        if (!productData.branchId) {
            productData.branchId = (req as any).user?.branchId || req.user?.branchId;
        }
        
        // If still no branchId, get default branch or first branch
        if (!productData.branchId) {
            const defaultBranch = await prisma.branch.findFirst({
                where: { isActive: true },
                orderBy: { createdAt: 'asc' }
            });
            if (defaultBranch) {
                productData.branchId = defaultBranch.id;
            } else {
                res.status(400).json({ 
                    success: false, 
                    error: { code: 'VALIDATION_001', message: 'Branch ID is required. No active branch found.' } 
                });
                return;
            }
        }
        
        // Handle empty categoryId
        if (productData.categoryId === '' || productData.categoryId === null) {
            delete productData.categoryId;
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

        const product = await prisma.product.create({
            data: productData,
        });

        // Create initial inventory if stock provided
        if (stock !== undefined && stock > 0 && productData.branchId) {
            await prisma.inventory.create({
                data: {
                    productId: product.id,
                    branchId: productData.branchId,
                    quantity: stock,
                    available: stock,
                }
            });
        }

        res.status(201).json({ success: true, data: product });
    } catch (error: any) {
        console.error('Product create error:', error);
        // Handle Prisma unique constraint violation
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0] || 'field';
            res.status(400).json({
                success: false,
                error: {
                    code: 'DUPLICATE_001',
                    message: `${field} already exists. Please use a different value.`,
                    field: field
                }
            });
            return;
        }
        next(error);
    }
});

// Get product by ID (MUST BE AFTER ALL SPECIFIC ROUTES)
productRoutes.get('/:id', authenticate, async (req, res, next) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id },
            include: { category: true, inventory: true },
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

// Update product
productRoutes.put('/:id', authenticate, authorize('products:update'), async (req, res, next) => {
    try {
        const { stock, minStock, ...productData } = req.body;
        
        // Handle empty categoryId
        if (productData.categoryId === '' || productData.categoryId === null) {
            delete productData.categoryId;
        }
        
        // Handle empty sku and barcode - set to null for unique constraint
        if (productData.sku === '') {
            productData.sku = null;
        }
        if (productData.barcode === '') {
            productData.barcode = null;
        }
        
        // Map minStock to lowStockThreshold
        if (minStock !== undefined) {
            productData.lowStockThreshold = minStock;
        }
        
        // Don't update branchId if not provided
        if (!productData.branchId) {
            delete productData.branchId;
        }

        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: productData,
        });

        res.json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
});

// Delete product (soft delete)
productRoutes.delete('/:id', authenticate, authorize('products:delete'), async (req, res, next) => {
    try {
        await prisma.product.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });

        res.json({ success: true, data: { message: 'Product deleted' } });
    } catch (error) {
        next(error);
    }
});
