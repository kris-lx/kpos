// ═══════════════════════════════════════════════════════════════════════════
// Inventory Module - Routes
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate, authorize, branchFilter } from '@/infrastructure/http/middleware/auth.middleware';
import { prisma } from '@/config/database.config';

export const inventoryRoutes = Router();

// Get inventory status with pagination, search, and filters
inventoryRoutes.get('/', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { 
            branchId, 
            lowStock, 
            outOfStock,
            search,
            page = 1, 
            limit = 10 
        } = req.query;
        
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        
        // Determine branch ID based on filter or query
        let userBranchId = branchId ? String(branchId) : (req.user as any)?.branchId;
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            if (branchId && !filter.branchIds.includes(String(branchId))) {
                return res.status(403).json({
                    success: false,
                    error: { code: 'FORBIDDEN', message: 'No access to this branch' }
                });
            }
            // If no specific branch requested, use first accessible branch
            if (!userBranchId) {
                userBranchId = filter.branchIds[0];
            }
        }

        // Build product where clause for search
        const productWhere: Record<string, unknown> = { isActive: true };
        if (search) {
            productWhere.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { sku: { contains: String(search), mode: 'insensitive' } },
                { barcode: { contains: String(search) } },
            ];
        }

        // Get products with their inventory data
        const [products, total] = await Promise.all([
            prisma.product.findMany({
                where: productWhere,
                skip,
                take: Number(limit),
                include: {
                    category: { select: { id: true, name: true } },
                    inventory: userBranchId ? {
                        where: { branchId: userBranchId }
                    } : true,
                },
                orderBy: { name: 'asc' },
            }),
            prisma.product.count({ where: productWhere }),
        ]);

        // Transform data to include stock from inventory
        let productsWithStock = products.map(product => {
            const totalStock = product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
            return {
                id: product.id,
                name: product.name,
                sku: product.sku,
                barcode: product.barcode,
                price: product.price,
                salePrice: product.salePrice,
                cost: product.cost,
                unit: product.unit,
                stock: totalStock,
                minStock: product.lowStockThreshold || 5,
                category: product.category,
            };
        });

        // Apply stock filters
        if (lowStock === 'true') {
            productsWithStock = productsWithStock.filter(p => p.stock > 0 && p.stock <= p.minStock);
        }
        if (outOfStock === 'true') {
            productsWithStock = productsWithStock.filter(p => p.stock === 0);
        }

        const totalFiltered = productsWithStock.length;
        const totalPages = Math.ceil(total / Number(limit));

        res.json({ 
            success: true, 
            data: productsWithStock,
            total: lowStock === 'true' || outOfStock === 'true' ? totalFiltered : total,
            page: Number(page),
            limit: Number(limit),
            totalPages,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: lowStock === 'true' || outOfStock === 'true' ? totalFiltered : total,
                pages: totalPages,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get inventory stats (for dashboard cards)
inventoryRoutes.get('/stats', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = (req as any).branchFilter;
        const userBranchId = filter?.branchIds?.[0] || (req.user as any)?.branchId;
        
        // Get all products with inventory
        const products = await prisma.product.findMany({
            where: { isActive: true },
            include: {
                inventory: userBranchId ? {
                    where: { branchId: userBranchId }
                } : true,
            },
        });
        
        let totalProducts = products.length;
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let totalValue = 0;
        
        products.forEach(product => {
            const totalStock = product.inventory?.reduce((sum, inv) => sum + inv.quantity, 0) || 0;
            const minStock = product.lowStockThreshold || 5;
            const cost = product.cost || product.price;
            
            if (totalStock === 0) {
                outOfStockCount++;
            } else if (totalStock <= minStock) {
                lowStockCount++;
            }
            
            totalValue += cost * totalStock;
        });
        
        res.json({
            success: true,
            data: {
                total: totalProducts,
                lowStock: lowStockCount,
                outOfStock: outOfStockCount,
                totalValue,
            }
        });
    } catch (error) {
        next(error);
    }
});

// Get inventory movements
inventoryRoutes.get('/movements', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { productId, branchId, type, startDate, endDate, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        
        const where: Record<string, unknown> = {};
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            where.branchId = { in: filter.branchIds };
        }
        if (productId) where.productId = String(productId);
        if (branchId) where.branchId = String(branchId);
        if (type) where.type = String(type);
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) (where.createdAt as Record<string, unknown>).gte = new Date(String(startDate));
            if (endDate) (where.createdAt as Record<string, unknown>).lte = new Date(String(endDate));
        }

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockMovement.count({ where }),
        ]);

        res.json({
            success: true,
            data: movements,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Adjust inventory
inventoryRoutes.put('/adjust', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { productId, quantity, type, reason, reference } = req.body;
        const userId = req.user!.userId;
        // Get branchId from request body or from user's assigned branch
        const branchId = req.body.branchId || (req.user as any)?.branchId;
        
        if (!branchId) {
            return res.status(400).json({ 
                success: false, 
                error: { code: 'BRANCH_REQUIRED', message: 'Branch ID is required' } 
            });
        }

        // Get current inventory
        const currentInventory = await prisma.inventory.findFirst({
            where: { productId, branchId },
        });
        const previousQty = currentInventory?.quantity || 0;
        const newQty = Math.max(0, previousQty + quantity); // Prevent negative stock

        // Determine movement type based on quantity
        const movementType = quantity > 0 ? 'IN' : 'OUT';

        // Create movement record
        const movement = await prisma.stockMovement.create({
            data: {
                productId,
                branchId,
                quantity: Math.abs(quantity),
                previousQty,
                newQty,
                type: movementType,
                reason: reason || (type === 'add' ? 'Stock Addition' : 'Stock Reduction'),
                reference,
                referenceType: 'ADJUSTMENT',
                userId,
            },
        });

        // Update inventory
        if (currentInventory) {
            await prisma.inventory.update({
                where: { id: currentInventory.id },
                data: { 
                    quantity: newQty,
                    available: Math.max(0, newQty - currentInventory.reserved)
                },
            });
        } else {
            await prisma.inventory.create({
                data: { 
                    productId, 
                    branchId, 
                    quantity: newQty,
                    available: newQty,
                    reserved: 0
                },
            });
        }

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Stock transfer between branches (stores within same branch only)
inventoryRoutes.post('/transfer', authenticate, authorize('inventory:transfer'), async (req, res, next) => {
    try {
        const { productId, fromBranchId, toBranchId, quantity, reason } = req.body;
        const userId = req.user!.userId;

        // Validate: fromBranch and toBranch must be different
        if (fromBranchId === toBranchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'SAME_STORE', message: 'ບໍ່ສາມາດໂອນພາຍໃນຮ້ານດຽວກັນໄດ້' }
            });
        }

        // Get stores to check if they belong to the same parent branch
        const [fromStore, toStore] = await Promise.all([
            prisma.store.findUnique({ where: { id: fromBranchId }, select: { id: true, branchId: true, name: true } }),
            prisma.store.findUnique({ where: { id: toBranchId }, select: { id: true, branchId: true, name: true } })
        ]);

        // If stores exist, validate they are in the same branch
        if (fromStore && toStore) {
            if (fromStore.branchId !== toStore.branchId) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DIFFERENT_BRANCH', message: 'ການໂອນສິນຄ້າຕ້ອງຢູ່ໃນສາຂາດຽວກັນເທົ່ານັ້ນ' }
                });
            }
        }

        // Get current inventories
        const fromInventory = await prisma.inventory.findFirst({
            where: { productId, branchId: fromBranchId },
        });

        // Validate stock availability
        if (!fromInventory || fromInventory.quantity < quantity) {
            return res.status(400).json({
                success: false,
                error: { 
                    code: 'INSUFFICIENT_STOCK', 
                    message: `ສະຕອກບໍ່ພຽງພໍ (ມີ: ${fromInventory?.quantity || 0}, ຕ້ອງການ: ${quantity})` 
                }
            });
        }

        const toInventory = await prisma.inventory.findFirst({
            where: { productId, branchId: toBranchId },
        });

        const fromPreviousQty = fromInventory?.quantity || 0;
        const toPreviousQty = toInventory?.quantity || 0;

        // Create outbound movement
        await prisma.stockMovement.create({
            data: {
                productId,
                branchId: fromBranchId,
                quantity: -quantity,
                previousQty: fromPreviousQty,
                newQty: fromPreviousQty - quantity,
                type: 'TRANSFER_OUT',
                reason,
                reference: toBranchId,
                userId,
            },
        });

        // Create inbound movement
        await prisma.stockMovement.create({
            data: {
                productId,
                branchId: toBranchId,
                quantity,
                previousQty: toPreviousQty,
                newQty: toPreviousQty + quantity,
                type: 'TRANSFER_IN',
                reason,
                reference: fromBranchId,
                userId,
            },
        });

        // Update inventories
        if (fromInventory) {
            await prisma.inventory.update({
                where: { id: fromInventory.id },
                data: { quantity: { decrement: quantity } },
            });
        }

        if (toInventory) {
            await prisma.inventory.update({
                where: { id: toInventory.id },
                data: { quantity: { increment: quantity } },
            });
        } else {
            await prisma.inventory.create({
                data: { productId, branchId: toBranchId, quantity },
            });
        }

        res.status(201).json({ success: true, data: { message: 'Transfer completed' } });
    } catch (error) {
        next(error);
    }
});

// Out of stock items
inventoryRoutes.get('/out-of-stock', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user?.branchId;

        const where: Record<string, unknown> = {
            quantity: { lte: 0 },
        };
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            where.branchId = { in: filter.branchIds };
        } else if (branchId) {
            where.branchId = branchId;
        }

        // Get all out of stock items
        let outOfStockItems = await prisma.inventory.findMany({
            where,
            include: { 
                product: { select: { id: true, name: true, sku: true, barcode: true, images: true, lowStockThreshold: true } }, 
                branch: { select: { id: true, name: true } } 
            },
            orderBy: { updatedAt: 'desc' },
        });

        // Transform data
        let data = outOfStockItems.map(item => ({
            id: item.id,
            productId: item.productId,
            productName: item.product?.name || 'Unknown',
            sku: item.product?.sku || '',
            barcode: item.product?.barcode || '',
            image: item.product?.images?.[0] || null,
            branchId: item.branchId,
            branchName: item.branch?.name || '',
            quantity: item.quantity,
            lowStockThreshold: item.product?.lowStockThreshold || 10,
            updatedAt: item.updatedAt,
        }));

        // Apply search filter
        if (search) {
            const searchLower = String(search).toLowerCase();
            data = data.filter(item => 
                item.productName.toLowerCase().includes(searchLower) ||
                item.sku.toLowerCase().includes(searchLower) ||
                item.barcode.toLowerCase().includes(searchLower)
            );
        }

        const total = data.length;
        const paginatedData = data.slice(skip, skip + Number(limit));

        res.json({ 
            success: true, 
            data: paginatedData,
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

// Low stock alerts
inventoryRoutes.get('/alerts', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const filter = (req as any).branchFilter;
        const branchId = filter?.branchIds?.[0] || req.user?.branchId || String(req.query.branchId);

        const where: Record<string, unknown> = {
            quantity: { lte: 10 },
        };
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            where.branchId = { in: filter.branchIds };
        } else if (branchId) {
            where.branchId = branchId;
        }

        const lowStock = await prisma.inventory.findMany({
            where,
            include: { product: true },
        });

        res.json({ success: true, data: lowStock });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// VENDORS
// ═══════════════════════════════════════════════════════════════════════════

// Get all vendors with pagination
inventoryRoutes.get('/vendors', authenticate, async (req, res, next) => {
    try {
        const { search, isActive, page = 1, limit = 20 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        
        const where: Record<string, unknown> = {};
        
        if (search) {
            where.OR = [
                { name: { contains: String(search), mode: 'insensitive' } },
                { code: { contains: String(search), mode: 'insensitive' } },
                { contactName: { contains: String(search), mode: 'insensitive' } },
            ];
        }
        if (isActive !== undefined) where.isActive = isActive === 'true';

        const [vendors, total] = await Promise.all([
            prisma.vendor.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { name: 'asc' },
            }),
            prisma.vendor.count({ where }),
        ]);

        res.json({ 
            success: true, 
            data: vendors,
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

// Get vendor by ID
inventoryRoutes.get('/vendors/:id', authenticate, async (req, res, next) => {
    try {
        const vendor = await prisma.vendor.findUnique({
            where: { id: req.params.id },
            include: { purchaseOrders: { take: 10, orderBy: { createdAt: 'desc' } } },
        });

        if (!vendor) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Vendor not found' } });
            return;
        }

        res.json({ success: true, data: vendor });
    } catch (error) {
        next(error);
    }
});

// Create vendor
inventoryRoutes.post('/vendors', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { name, contactName, phone, email, address, notes, code, taxId, paymentTerms } = req.body;
        
        if (!name || !name.trim()) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຊື່ຜູ້ສະໜອງ' } 
            });
            return;
        }
        
        const vendor = await prisma.vendor.create({ 
            data: {
                name: name.trim(),
                contactName: contactName?.trim() || null,
                phone: phone?.trim() || null,
                email: email?.trim() || null,
                address: address?.trim() || null,
                notes: notes?.trim() || null,
                code: code?.trim() || null,
                taxId: taxId?.trim() || null,
                paymentTerms: paymentTerms ?? 30,
                isActive: true,
            }
        });
        res.status(201).json({ success: true, data: vendor });
    } catch (error: any) {
        if (error.code === 'P2002') {
            res.status(400).json({ 
                success: false, 
                error: { code: 'DUP_001', message: 'ຜູ້ສະໜອງນີ້ມີຢູ່ແລ້ວ' } 
            });
            return;
        }
        next(error);
    }
});

// Update vendor
inventoryRoutes.put('/vendors/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { name, contactName, phone, email, address, notes, code, taxId, paymentTerms, isActive } = req.body;
        
        if (name !== undefined && (!name || !name.trim())) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'VAL_001', message: 'ກະລຸນາປ້ອນຊື່ຜູ້ສະໜອງ' } 
            });
            return;
        }
        
        const updateData: Record<string, unknown> = {};
        if (name !== undefined) updateData.name = name.trim();
        if (contactName !== undefined) updateData.contactName = contactName?.trim() || null;
        if (phone !== undefined) updateData.phone = phone?.trim() || null;
        if (email !== undefined) updateData.email = email?.trim() || null;
        if (address !== undefined) updateData.address = address?.trim() || null;
        if (notes !== undefined) updateData.notes = notes?.trim() || null;
        if (code !== undefined) updateData.code = code?.trim() || null;
        if (taxId !== undefined) updateData.taxId = taxId?.trim() || null;
        if (paymentTerms !== undefined) updateData.paymentTerms = paymentTerms || null;
        if (isActive !== undefined) updateData.isActive = isActive;
        
        const vendor = await prisma.vendor.update({
            where: { id: req.params.id },
            data: updateData,
        });
        res.json({ success: true, data: vendor });
    } catch (error: any) {
        if (error.code === 'P2025') {
            res.status(404).json({ 
                success: false, 
                error: { code: 'RES_001', message: 'ບໍ່ພົບຜູ້ສະໜອງນີ້' } 
            });
            return;
        }
        if (error.code === 'P2002') {
            res.status(400).json({ 
                success: false, 
                error: { code: 'DUP_001', message: 'ຜູ້ສະໜອງນີ້ມີຢູ່ແລ້ວ' } 
            });
            return;
        }
        next(error);
    }
});

// Delete vendor
inventoryRoutes.delete('/vendors/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        // Check if vendor has purchase orders
        const orderCount = await prisma.purchaseOrder.count({
            where: { vendorId: req.params.id }
        });
        
        if (orderCount > 0) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'REF_001', message: `ບໍ່ສາມາດລຶບໄດ້ ເນື່ອງຈາກມີ ${orderCount} ໃບສັ່ງຊື້ທີ່ກ່ຽວຂ້ອງ` } 
            });
            return;
        }
        
        await prisma.vendor.delete({
            where: { id: req.params.id },
        });
        res.json({ success: true, data: { message: 'Vendor deleted' } });
    } catch (error: any) {
        if (error.code === 'P2025') {
            res.status(404).json({ 
                success: false, 
                error: { code: 'RES_001', message: 'ບໍ່ພົບຜູ້ສະໜອງນີ້' } 
            });
            return;
        }
        next(error);
    }
});
// PURCHASE ORDERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all purchase orders
inventoryRoutes.get('/purchase-orders', authenticate, branchFilter(), async (req, res, next) => {
    try {
        const { branchId, vendorId, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const filter = (req as any).branchFilter;
        
        const where: Record<string, unknown> = {};
        
        // Apply branch filter for non-admin users
        if (filter?.branchIds?.length) {
            where.branchId = { in: filter.branchIds };
        }
        if (branchId) where.branchId = String(branchId);
        if (vendorId) where.vendorId = String(vendorId);
        if (status) where.status = String(status);

        const [orders, total] = await Promise.all([
            prisma.purchaseOrder.findMany({
                where,
                skip,
                take: Number(limit),
                include: { vendor: true, items: true },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.purchaseOrder.count({ where }),
        ]);

        res.json({
            success: true,
            data: orders,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Get purchase order by ID
inventoryRoutes.get('/purchase-orders/:id', authenticate, async (req, res, next) => {
    try {
        const order = await prisma.purchaseOrder.findUnique({
            where: { id: req.params.id },
            include: { vendor: true, items: true },
        });

        if (!order) {
            res.status(404).json({ success: false, error: { code: 'RES_001', message: 'Purchase order not found' } });
            return;
        }

        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Create purchase order
inventoryRoutes.post('/purchase-orders', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { items, ...orderData } = req.body;
        const userId = req.user!.userId;

        // Generate PO number
        const count = await prisma.purchaseOrder.count();
        const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;

        // Calculate totals
        const subtotal = items.reduce((sum: number, item: { quantity: number; unitCost: number }) => 
            sum + (item.quantity * item.unitCost), 0);
        const tax = (subtotal * (orderData.taxRate || 0)) / 100;
        const discount = orderData.discount || 0;
        const total = subtotal + tax - discount;

        const order = await prisma.purchaseOrder.create({
            data: {
                ...orderData,
                poNumber,
                subtotal,
                tax,
                discount,
                total,
                createdBy: userId,
                items: {
                    create: items.map((item: { productId: string; productName: string; quantity: number; unitCost: number }) => ({
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.quantity,
                        unitCost: item.unitCost,
                        total: item.quantity * item.unitCost,
                    })),
                },
            },
            include: { vendor: true, items: true },
        });

        res.status(201).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update purchase order
inventoryRoutes.put('/purchase-orders/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const order = await prisma.purchaseOrder.update({
            where: { id: req.params.id },
            data: req.body,
            include: { vendor: true, items: true },
        });
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update purchase order status
inventoryRoutes.patch('/purchase-orders/:id/status', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { status } = req.body;
        const userId = req.user!.userId;

        const updateData: Record<string, unknown> = { status };
        if (status === 'APPROVED') {
            updateData.approvedBy = userId;
            updateData.approvedAt = new Date();
        }
        if (status === 'RECEIVED') {
            updateData.receivedDate = new Date();
        }

        const order = await prisma.purchaseOrder.update({
            where: { id: req.params.id },
            data: updateData,
            include: { items: true },
        });

        // If received, update inventory
        if (status === 'RECEIVED') {
            for (const item of order.items) {
                const inventory = await prisma.inventory.findFirst({
                    where: { productId: item.productId, branchId: order.branchId },
                });

                if (inventory) {
                    await prisma.inventory.update({
                        where: { id: inventory.id },
                        data: { quantity: { increment: item.quantity } },
                    });
                } else {
                    await prisma.inventory.create({
                        data: {
                            productId: item.productId,
                            branchId: order.branchId,
                            quantity: item.quantity,
                        },
                    });
                }

                // Create stock movement
                await prisma.stockMovement.create({
                    data: {
                        productId: item.productId,
                        branchId: order.branchId,
                        type: 'IN',
                        quantity: item.quantity,
                        previousQty: inventory?.quantity || 0,
                        newQty: (inventory?.quantity || 0) + item.quantity,
                        reason: 'Purchase Order Received',
                        reference: order.id,
                        referenceType: 'PURCHASE',
                        userId,
                    },
                });
            }
        }

        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Delete purchase order
inventoryRoutes.delete('/purchase-orders/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        const order = await prisma.purchaseOrder.findUnique({ where: { id: req.params.id } });
        
        if (order?.status !== 'DRAFT') {
            res.status(400).json({ success: false, error: { code: 'INV_001', message: 'Can only delete draft orders' } });
            return;
        }

        await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: req.params.id } });
        await prisma.purchaseOrder.delete({ where: { id: req.params.id } });
        
        res.json({ success: true, data: { message: 'Purchase order deleted' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK TRANSFERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all stock transfers
inventoryRoutes.get('/stock-transfers', authenticate, async (req, res, next) => {
    try {
        const { fromBranchId, toBranchId, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        
        const where: Record<string, unknown> = {};
        if (fromBranchId) where.fromBranchId = String(fromBranchId);
        if (toBranchId) where.toBranchId = String(toBranchId);
        if (status) where.status = String(status);

        const [transfers, total] = await Promise.all([
            prisma.stockTransfer.findMany({
                where,
                skip,
                take: Number(limit),
                include: { items: true },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockTransfer.count({ where }),
        ]);

        res.json({
            success: true,
            data: transfers,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock transfer
inventoryRoutes.post('/stock-transfers', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { items, fromBranchId, toBranchId, ...transferData } = req.body;
        const userId = req.user!.userId;

        // Validate: fromBranch and toBranch must be different
        if (fromBranchId === toBranchId) {
            return res.status(400).json({
                success: false,
                error: { code: 'SAME_BRANCH', message: 'ບໍ່ສາມາດໂອນພາຍໃນສາຂາດຽວກັນໄດ້' }
            });
        }

        // Get stores to check if they belong to the same parent branch
        const [fromStore, toStore] = await Promise.all([
            prisma.store.findUnique({ where: { id: fromBranchId }, select: { id: true, branchId: true, name: true } }),
            prisma.store.findUnique({ where: { id: toBranchId }, select: { id: true, branchId: true, name: true } })
        ]);

        // If stores exist, validate they are in the same branch
        if (fromStore && toStore) {
            if (fromStore.branchId !== toStore.branchId) {
                return res.status(400).json({
                    success: false,
                    error: { code: 'DIFFERENT_BRANCH', message: 'ການໂອນສິນຄ້າຕ້ອງຢູ່ໃນສາຂາດຽວກັນເທົ່ານັ້ນ' }
                });
            }
        }

        // Validate stock availability for each item
        for (const item of items) {
            const inventory = await prisma.inventory.findFirst({
                where: { productId: item.productId, branchId: fromBranchId }
            });
            
            if (!inventory || inventory.quantity < item.quantity) {
                return res.status(400).json({
                    success: false,
                    error: { 
                        code: 'INSUFFICIENT_STOCK', 
                        message: `ສິນຄ້າ ${item.productName} ມີສະຕອກບໍ່ພຽງພໍ (ມີ: ${inventory?.quantity || 0}, ຕ້ອງການ: ${item.quantity})` 
                    }
                });
            }
        }

        // Generate transfer number
        const count = await prisma.stockTransfer.count();
        const transferNo = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;

        const transfer = await prisma.stockTransfer.create({
            data: {
                ...transferData,
                fromBranchId,
                toBranchId,
                transferNo,
                requestedBy: userId,
                items: {
                    create: items.map((item: { productId: string; productName: string; quantity: number }) => ({
                        productId: item.productId,
                        productName: item.productName,
                        quantity: item.quantity,
                    })),
                },
            },
            include: { items: true },
        });

        res.status(201).json({ success: true, data: transfer });
    } catch (error) {
        next(error);
    }
});

// Expiry tracking with pagination
inventoryRoutes.get('/expiring', authenticate, async (req, res, next) => {
    try {
        const { branchId, days = 90, page = 1, limit = 20, search, daysFilter } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + Number(days));

        // Build where clause - include expired items (no lower bound on expiryDate)
        const where: Record<string, unknown> = {
            expiryDate: { 
                not: null,
                lte: futureDate 
            },
            quantity: { gt: 0 }
        };
        if (branchId) where.branchId = String(branchId);

        // Get all expiring items first
        let expiringItems = await prisma.inventory.findMany({
            where,
            include: { 
                product: { select: { id: true, name: true, sku: true, barcode: true, images: true } }, 
                branch: { select: { id: true, name: true } } 
            },
            orderBy: { expiryDate: 'asc' },
        });

        // Transform data for frontend
        let data = expiringItems.map(item => ({
            id: item.id,
            productId: item.productId,
            productName: item.product?.name || 'Unknown',
            sku: item.product?.sku || '',
            barcode: item.product?.barcode || '',
            image: item.product?.images?.[0] || null,
            branchId: item.branchId,
            branchName: item.branch?.name || '',
            quantity: item.quantity,
            expiryDate: item.expiryDate,
            batchNo: item.batchNo || '',
        }));

        // Apply search filter
        if (search) {
            const searchLower = String(search).toLowerCase();
            data = data.filter(item => 
                item.productName.toLowerCase().includes(searchLower) ||
                item.sku.toLowerCase().includes(searchLower) ||
                item.barcode.toLowerCase().includes(searchLower)
            );
        }

        // Apply days filter (expired, critical, warning, ok)
        if (daysFilter !== undefined && daysFilter !== null && daysFilter !== '') {
            const filterDays = Number(daysFilter);
            const today = new Date();
            data = data.filter(item => {
                if (!item.expiryDate) return false;
                const expiry = new Date(item.expiryDate);
                const daysUntil = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                
                if (filterDays === -1) return daysUntil < 0; // Already expired
                if (filterDays === 7) return daysUntil >= 0 && daysUntil <= 7; // Critical (0-7 days)
                if (filterDays === 30) return daysUntil > 7 && daysUntil <= 30; // Warning (8-30 days)
                if (filterDays === 90) return daysUntil > 30; // OK (30+ days)
                return true;
            });
        }

        const total = data.length;
        const paginatedData = data.slice(skip, skip + Number(limit));

        res.json({ 
            success: true, 
            data: paginatedData,
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
// ═══════════════════════════════════════════════════════════════════════════
// STOCK IN
// ═══════════════════════════════════════════════════════════════════════════

// Get stock in records
inventoryRoutes.get('/stock-in', authenticate, async (req, res, next) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {
            type: 'IN',
        };
        if (search) {
            where.OR = [
                { reference: { contains: String(search), mode: 'insensitive' } },
                { reason: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockMovement.count({ where }),
        ]);

        // Get product info for each movement
        const productIds = [...new Set(movements.map(m => m.productId))];
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, sku: true }
        });
        const productMap = new Map(products.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({ ...m, product: productMap.get(m.productId) || null })),
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock in
inventoryRoutes.post('/stock-in', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { productId, quantity, unitCost, supplier, reference, notes, date, expiryDate, batchNumber } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const inventory = await prisma.inventory.findFirst({
            where: { productId, branchId, batchNumber: batchNumber || null },
        });
        const previousQty = inventory?.quantity || 0;
        const newQty = previousQty + Number(quantity);

        const movement = await prisma.stockMovement.create({
            data: {
                productId,
                branchId,
                quantity: Number(quantity),
                previousQty,
                newQty,
                unitCost: unitCost ? Number(unitCost) : null,
                supplier: supplier || null,
                type: 'IN',
                reason: supplier || 'Stock In',
                reference,
                notes,
                userId,
                expiryDate: expiryDate ? new Date(expiryDate) : null,
                batchNumber: batchNumber || null,
                createdAt: date ? new Date(date) : new Date(),
            },
        });

        if (inventory) {
            await prisma.inventory.update({
                where: { id: inventory.id },
                data: { 
                    quantity: newQty,
                    expiryDate: expiryDate ? new Date(expiryDate) : inventory.expiryDate,
                },
            });
        } else {
            await prisma.inventory.create({
                data: { 
                    productId, 
                    branchId, 
                    quantity: newQty,
                    expiryDate: expiryDate ? new Date(expiryDate) : null,
                    batchNumber: batchNumber || null,
                },
            });
        }

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Update stock in
inventoryRoutes.put('/stock-in/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { productId, quantity, unitCost, supplier, reference, notes, date, expiryDate, batchNumber } = req.body;
        const userId = (req as any).user?.id;
        const branchId = (req as any).user?.branchId || 'default';

        // Get existing movement
        const existing = await prisma.stockMovement.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
            return;
        }

        // Calculate quantity difference for inventory update
        const quantityDiff = Number(quantity) - existing.quantity;

        // Update movement
        const movement = await prisma.stockMovement.update({
            where: { id },
            data: {
                productId: productId || existing.productId,
                quantity: Number(quantity),
                unitCost: unitCost !== undefined ? Number(unitCost) : existing.unitCost,
                supplier: supplier ?? existing.supplier,
                reason: supplier || existing.reason,
                reference: reference ?? existing.reference,
                notes: notes ?? existing.notes,
                expiryDate: expiryDate ? new Date(expiryDate) : existing.expiryDate,
                batchNumber: batchNumber ?? existing.batchNumber,
                updatedAt: new Date(),
            },
        });

        // Update inventory quantity if changed
        if (quantityDiff !== 0) {
            const inventory = await prisma.inventory.findFirst({
                where: { productId: existing.productId, branchId },
            });
            if (inventory) {
                await prisma.inventory.update({
                    where: { id: inventory.id },
                    data: { quantity: { increment: quantityDiff } },
                });
            }
        }

        res.json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Delete stock in
inventoryRoutes.delete('/stock-in/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        const movement = await prisma.stockMovement.findUnique({ where: { id: req.params.id } });
        if (!movement) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
            return;
        }

        // Reverse the inventory change
        const inventory = await prisma.inventory.findFirst({
            where: { productId: movement.productId, branchId: movement.branchId },
        });
        if (inventory) {
            await prisma.inventory.update({
                where: { id: inventory.id },
                data: { quantity: { decrement: movement.quantity } },
            });
        }

        await prisma.stockMovement.delete({ where: { id: req.params.id } });
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK OUT
// ═══════════════════════════════════════════════════════════════════════════

// Get stock out records
inventoryRoutes.get('/stock-out', authenticate, async (req, res, next) => {
    try {
        const { search, page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {
            type: 'OUT',
        };
        if (search) {
            where.OR = [
                { reference: { contains: String(search), mode: 'insensitive' } },
                { reason: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockMovement.count({ where }),
        ]);

        // Get product info for each movement
        const productIds = [...new Set(movements.map(m => m.productId))];
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, sku: true }
        });
        const productMap = new Map(products.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({ ...m, product: productMap.get(m.productId) || null })),
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock out
inventoryRoutes.post('/stock-out', authenticate, authorize('inventory:create'), async (req, res, next) => {
    try {
        const { productId, quantity, reason, reference, notes, date } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const inventory = await prisma.inventory.findFirst({
            where: { productId, branchId },
        });
        const previousQty = inventory?.quantity || 0;
        const newQty = Math.max(0, previousQty - Number(quantity));

        const movement = await prisma.stockMovement.create({
            data: {
                productId,
                branchId,
                quantity: -Number(quantity),
                previousQty,
                newQty,
                type: 'OUT',
                reason,
                reference,
                notes,
                userId,
                createdAt: date ? new Date(date) : new Date(),
            },
        });

        if (inventory) {
            await prisma.inventory.update({
                where: { id: inventory.id },
                data: { quantity: newQty },
            });
        }

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Update stock out
inventoryRoutes.put('/stock-out/:id', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { id } = req.params;
        const { productId, quantity, reason, reference, notes, date } = req.body;
        const branchId = req.user!.branchId || 'default';

        // Get existing movement
        const existing = await prisma.stockMovement.findUnique({ where: { id } });
        if (!existing) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
            return;
        }

        // Calculate quantity difference for inventory update (existing is negative, new is also negative)
        const oldQty = Math.abs(existing.quantity);
        const newQty = Math.abs(Number(quantity));
        const quantityDiff = oldQty - newQty; // Positive means less out, negative means more out

        // Update movement
        const movement = await prisma.stockMovement.update({
            where: { id },
            data: {
                productId: productId || existing.productId,
                quantity: -newQty,
                reason: reason ?? existing.reason,
                reference: reference ?? existing.reference,
                notes: notes ?? existing.notes,
                updatedAt: new Date(),
            },
        });

        // Update inventory quantity if changed
        if (quantityDiff !== 0) {
            const inventory = await prisma.inventory.findFirst({
                where: { productId: existing.productId, branchId },
            });
            if (inventory) {
                await prisma.inventory.update({
                    where: { id: inventory.id },
                    data: { quantity: { increment: quantityDiff } },
                });
            }
        }

        res.json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// Delete stock out
inventoryRoutes.delete('/stock-out/:id', authenticate, authorize('inventory:delete'), async (req, res, next) => {
    try {
        const movement = await prisma.stockMovement.findUnique({ where: { id: req.params.id } });
        if (!movement) {
            res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Record not found' } });
            return;
        }

        // Reverse the inventory change
        const inventory = await prisma.inventory.findFirst({
            where: { productId: movement.productId, branchId: movement.branchId },
        });
        if (inventory) {
            await prisma.inventory.update({
                where: { id: inventory.id },
                data: { quantity: { increment: Math.abs(movement.quantity) } },
            });
        }

        await prisma.stockMovement.delete({ where: { id: req.params.id } });
        res.json({ success: true, data: { message: 'Deleted successfully' } });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ADJUSTMENTS
// ═══════════════════════════════════════════════════════════════════════════

// Get adjustments
inventoryRoutes.get('/adjustments', authenticate, async (req, res, next) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {
            type: { in: ['ADJUSTMENT', 'INCREASE', 'DECREASE'] },
        };
        if (search) {
            where.OR = [
                { reference: { contains: String(search), mode: 'insensitive' } },
                { reason: { contains: String(search), mode: 'insensitive' } },
            ];
        }

        const [movements, total] = await Promise.all([
            prisma.stockMovement.findMany({
                where,
                skip,
                take: Number(limit),
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockMovement.count({ where }),
        ]);

        // Get product info for each movement
        const productIds = [...new Set(movements.map(m => m.productId))];
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, sku: true }
        });
        const productMap = new Map(products.map(p => [p.id, p]));

        res.json({
            success: true,
            data: movements.map(m => ({
                ...m,
                product: productMap.get(m.productId) || null,
                adjustmentType: m.quantity > 0 ? 'increase' : 'decrease',
                quantity: Math.abs(m.quantity),
            })),
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Update/Create adjustment (PUT for adjusting inventory)
inventoryRoutes.put('/adjustments', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { productId, adjustmentType, quantity, reason, reference, notes, date } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const inventory = await prisma.inventory.findFirst({
            where: { productId, branchId },
        });
        const previousQty = inventory?.quantity || 0;
        const adjustQty = adjustmentType === 'increase' ? Number(quantity) : -Number(quantity);
        const newQty = Math.max(0, previousQty + adjustQty);

        const movement = await prisma.stockMovement.create({
            data: {
                productId,
                branchId,
                quantity: adjustQty,
                previousQty,
                newQty,
                type: adjustmentType === 'increase' ? 'INCREASE' : 'DECREASE',
                reason,
                reference,
                notes,
                userId,
                createdAt: date ? new Date(date) : new Date(),
            },
        });

        if (inventory) {
            await prisma.inventory.update({
                where: { id: inventory.id },
                data: { quantity: newQty },
            });
        } else {
            await prisma.inventory.create({
                data: { productId, branchId, quantity: newQty },
            });
        }

        res.status(201).json({ success: true, data: movement });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSFERS (for frontend)
// ═══════════════════════════════════════════════════════════════════════════

// Get transfers
inventoryRoutes.get('/transfers', authenticate, async (req, res, next) => {
    try {
        const { search, status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        if (status) where.status = String(status);

        const [transfers, total] = await Promise.all([
            prisma.stockTransfer.findMany({
                where,
                skip,
                take: Number(limit),
                include: { items: true },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockTransfer.count({ where }),
        ]);

        res.json({
            success: true,
            data: transfers,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create transfer
inventoryRoutes.post('/transfers', authenticate, authorize('inventory:update'), async (req, res, next) => {
    try {
        const { productId, quantity, fromBranchId, toBranchId, reference, notes, date } = req.body;
        const userId = req.user!.userId;

        // Get product name for record
        const product = await prisma.product.findUnique({ where: { id: productId }, select: { name: true } });

        // Get current inventories
        const fromInventory = await prisma.inventory.findFirst({
            where: { productId, branchId: fromBranchId },
        });
        const toInventory = await prisma.inventory.findFirst({
            where: { productId, branchId: toBranchId },
        });

        const fromPreviousQty = fromInventory?.quantity || 0;
        const toPreviousQty = toInventory?.quantity || 0;
        const qty = Number(quantity);

        // Check if source has enough stock
        if (fromPreviousQty < qty) {
            res.status(400).json({ 
                success: false, 
                error: { code: 'INSUFFICIENT_STOCK', message: `ສະຕ໋ອກບໍ່ພຽງພໍ (ມີ ${fromPreviousQty}, ຕ້ອງການ ${qty})` } 
            });
            return;
        }

        const count = await prisma.stockTransfer.count();
        const transferNo = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;

        // Create transfer record
        const transfer = await prisma.stockTransfer.create({
            data: {
                transferNo,
                fromBranchId,
                toBranchId,
                status: 'completed',
                notes,
                requestedBy: userId,
                items: {
                    create: [{
                        productId,
                        productName: product?.name || '',
                        quantity: qty,
                    }],
                },
            },
            include: { items: true },
        });

        // Create stock movements
        await prisma.stockMovement.create({
            data: {
                productId,
                branchId: fromBranchId,
                quantity: -qty,
                previousQty: fromPreviousQty,
                newQty: fromPreviousQty - qty,
                type: 'TRANSFER_OUT',
                reason: `ໂອນໄປ ${toBranchId}`,
                reference: transferNo,
                userId,
            },
        });

        await prisma.stockMovement.create({
            data: {
                productId,
                branchId: toBranchId,
                quantity: qty,
                previousQty: toPreviousQty,
                newQty: toPreviousQty + qty,
                type: 'TRANSFER_IN',
                reason: `ໂອນມາຈາກ ${fromBranchId}`,
                reference: transferNo,
                userId,
            },
        });

        // Update inventories - deduct from source
        if (fromInventory) {
            await prisma.inventory.update({
                where: { id: fromInventory.id },
                data: { quantity: { decrement: qty } },
            });
        }

        // Update inventories - add to destination
        if (toInventory) {
            await prisma.inventory.update({
                where: { id: toInventory.id },
                data: { quantity: { increment: qty } },
            });
        } else {
            await prisma.inventory.create({
                data: { productId, branchId: toBranchId, quantity: qty },
            });
        }

        res.status(201).json({ success: true, data: transfer });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// STOCK COUNTS
// ═══════════════════════════════════════════════════════════════════════════

// Get stock counts
inventoryRoutes.get('/stock-counts', authenticate, async (req, res, next) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const where: Record<string, unknown> = {};
        if (status) where.status = String(status);

        const [counts, total] = await Promise.all([
            prisma.stockCount.findMany({
                where,
                skip,
                take: Number(limit),
                include: { items: true },
                orderBy: { createdAt: 'desc' },
            }),
            prisma.stockCount.count({ where }),
        ]);

        res.json({
            success: true,
            data: counts,
            meta: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
        });
    } catch (error) {
        next(error);
    }
});

// Create stock count
inventoryRoutes.post('/stock-counts', authenticate, authorize('inventory:adjust'), async (req, res, next) => {
    try {
        const { date, notes, items } = req.body;
        const userId = req.user!.userId;
        const branchId = req.user!.branchId || 'default';

        const count = await prisma.stockCount.count();
        const countNo = `CNT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;

        let hasDiscrepancy = false;
        const itemsWithProducts = await Promise.all(
            items.map(async (item: { productId: string; systemQty: number; actualQty: number }) => {
                const product = await prisma.product.findUnique({ where: { id: item.productId } });
                const diff = item.actualQty - item.systemQty;
                if (diff !== 0) hasDiscrepancy = true;
                return {
                    productId: item.productId,
                    productName: product?.name || '',
                    systemQty: item.systemQty,
                    actualQty: item.actualQty,
                    difference: diff,
                };
            })
        );

        const stockCount = await prisma.stockCount.create({
            data: {
                countNo,
                branchId,
                date: date ? new Date(date) : new Date(),
                notes,
                status: 'pending',
                hasDiscrepancy,
                countedBy: userId,
                items: {
                    create: itemsWithProducts,
                },
            },
            include: { items: true },
        });

        res.status(201).json({ success: true, data: stockCount });
    } catch (error) {
        next(error);
    }
});