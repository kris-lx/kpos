// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Routes (Refactored with Services)
// ═══════════════════════════════════════════════════════════════════════════

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize, branchFilter, ensureScopeAccess, type ScopeFilter } from '@/infrastructure/http/middleware/auth.middleware';
import {
    tableService,
    orderService,
    reservationService,
    eMenuService
} from '../application/services';
import { TableStatus } from '../domain/entities/Table';
import { OrderStatus, OrderItemStatus } from '../domain/entities/Order';
import { ReservationStatus } from '../domain/entities/Reservation';
import { db } from '@/config/database.config';
import { branches } from '@/db/schema/tables';
import { eq } from 'drizzle-orm';

export const restaurantRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════════════════════════

// Get all tables
restaurantRoutes.get('/tables', authenticate, branchFilter(), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId, status, zone, floor } = req.query;
        const filter = req.branchFilter;
        const effectiveBranchId = (branchId as string) || filter?.branchIds?.[0] || req.authUser?.activeBranchId;
        
        // BE-76: Tenant isolation
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;

        const tables = await tableService.findAll({
            branchId: effectiveBranchId,
            status: status as TableStatus,
            zone: zone as string,
            floor: floor as string,
            tenantId,
        });

        res.json({ success: true, data: tables });
    } catch (error) {
        next(error);
    }
});

// Get table stats
restaurantRoutes.get('/tables/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId } = req.query;
        
        if (!branchId) {
            res.status(400).json({ success: false, error: { code: 'RES_001', message: 'branchId is required' } });
            return;
        }

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const stats = await tableService.getStats(branchId as string, tenantId);
        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// Get table by ID (scope-checked)
restaurantRoutes.get('/tables/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        // BE-76: Tenant-scoped table lookup
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const table = await tableService.findById(req.params.id, tenantId);

        if (!table) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Table not found or no access' } });
            return;
        }

        if (!ensureScopeAccess(table as any, req)) {
            return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
        }

        res.json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
});

// Create table
restaurantRoutes.post('/tables', authenticate, authorize('tables:create'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const table = await tableService.create({ ...req.body, tenantId: req.authUser?.tenantId || req.user?.tenantId });
        res.status(201).json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
});

// Update table
restaurantRoutes.put('/tables/:id', authenticate, authorize('tables:update'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const table = await tableService.update(req.params.id, req.body, tenantId);
        res.json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
});

// Update table status
restaurantRoutes.patch('/tables/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const table = await tableService.updateStatus(req.params.id, status as TableStatus, tenantId);
        res.json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
});

// Delete table (soft delete)
restaurantRoutes.delete('/tables/:id', authenticate, authorize('tables:delete'), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        await tableService.delete(req.params.id, tenantId);
        res.json({ success: true, message: 'Table deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ZONES / FLOORS
// ═══════════════════════════════════════════════════════════════════════════

// Get distinct zones from tables
restaurantRoutes.get('/zones', authenticate, branchFilter(), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const filter = req.branchFilter;
        const effectiveBranchId = (req.query.branchId as string) || filter?.branchIds?.[0] || req.authUser?.activeBranchId;

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const allTables = await tableService.findAll({ branchId: effectiveBranchId, tenantId });
        const zoneSet = new Set<string>();
        const floorSet = new Set<string>();
        allTables.forEach((t: any) => {
            if (t.zone) zoneSet.add(t.zone);
            if (t.floor) floorSet.add(String(t.floor));
        });

        const defaultZones = [
            { id: 'main', name: 'ຫ້ອງໃຫຍ່', color: 'blue' },
            { id: 'vip', name: 'ຫ້ອງ VIP', color: 'purple' },
            { id: 'outdoor', name: 'ນອກອາຄານ', color: 'green' },
            { id: 'private', name: 'ຫ້ອງສ່ວນຕົວ', color: 'amber' },
        ];

        const zones = zoneSet.size > 0
            ? Array.from(zoneSet).map(z => ({ id: z, name: z, color: 'blue' }))
            : defaultZones;

        const floors = floorSet.size > 0
            ? Array.from(floorSet).sort().map(f => ({ id: f, name: `ຊັ້ນ ${f}` }))
            : [{ id: '1', name: 'ຊັ້ນ 1' }];

        res.json({ success: true, data: zones, floors });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════

// Get all orders
restaurantRoutes.get('/orders', authenticate, branchFilter(), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId, status, tableId } = req.query;
        const filter = req.branchFilter;
        const effectiveBranchId = (branchId as string) || filter?.branchIds?.[0] || req.authUser?.activeBranchId;

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const orders = await orderService.findAll({
            branchId: effectiveBranchId,
            status: status as OrderStatus,
            tableId: tableId as string,
            tenantId,
        });

        res.json({ success: true, data: orders });
    } catch (error) {
        next(error);
    }
});

// Get order stats
restaurantRoutes.get('/orders/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId } = req.query;
        
        if (!branchId) {
            res.status(400).json({ success: false, error: { code: 'RES_001', message: 'branchId is required' } });
            return;
        }

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const stats = await orderService.getStats(branchId as string, tenantId);
        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// Get order by ID
restaurantRoutes.get('/orders/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const order = await orderService.findById(req.params.id, tenantId);

        if (!order) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Order not found or no access' } });
            return;
        }

        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Create order
restaurantRoutes.post('/orders', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const order = await orderService.create({ ...req.body, tenantId: req.authUser?.tenantId || req.user?.tenantId });
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update order
restaurantRoutes.put('/orders/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const order = await orderService.update(req.params.id, req.body, tenantId);
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update order status
restaurantRoutes.patch('/orders/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const order = await orderService.update(req.params.id, { status: status as OrderStatus }, tenantId);
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Add items to order
restaurantRoutes.post('/orders/:id/items', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { items } = req.body;
        const order = await orderService.addItems(req.params.id, items);
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// KITCHEN DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

// Get kitchen orders
restaurantRoutes.get('/kitchen', authenticate, branchFilter(), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId } = req.query;
        const filter = req.branchFilter;
        const effectiveBranchId = (branchId as string) || filter?.branchIds?.[0] || req.authUser?.activeBranchId;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const orders = await orderService.getKitchenOrders(effectiveBranchId, tenantId);
        res.json({ success: true, data: orders });
    } catch (error) {
        next(error);
    }
});

// Update order item status (kitchen)
restaurantRoutes.put('/kitchen/:orderId/items/:itemId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const item = await orderService.updateItemStatus(req.params.itemId, status as OrderItemStatus);
        res.json({ success: true, data: item });
    } catch (error) {
        next(error);
    }
});

// Legacy endpoint for backward compatibility
restaurantRoutes.patch('/kitchen/items/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const item = await orderService.updateItemStatus(req.params.id, status as OrderItemStatus);
        res.json({ success: true, data: item });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// RESERVATIONS
// ═══════════════════════════════════════════════════════════════════════════

// Get all reservations
restaurantRoutes.get('/reservations', authenticate, branchFilter(), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId, status, date, page, limit } = req.query;
        const filter = req.branchFilter;
        const effectiveBranchId = (branchId as string) || filter?.branchIds?.[0] || req.authUser?.activeBranchId;

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const result = await reservationService.findAll({
            branchId: effectiveBranchId,
            status: status as ReservationStatus,
            date: date as string,
            page: page ? Number(page) : 1,
            limit: limit ? Number(limit) : 50,
            tenantId,
        });

        res.json({
            success: true,
            data: result.data,
            meta: {
                total: result.total,
                page: page ? Number(page) : 1,
                limit: limit ? Number(limit) : 50,
                totalPages: Math.ceil(result.total / (limit ? Number(limit) : 50)),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get reservation stats
restaurantRoutes.get('/reservations/stats', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId, date } = req.query;
        
        if (!branchId) {
            res.status(400).json({ success: false, error: { code: 'RES_001', message: 'branchId is required' } });
            return;
        }

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const stats = await reservationService.getStats(
            branchId as string, 
            date ? new Date(date as string) : undefined,
            tenantId
        );
        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// Get reservation by ID
restaurantRoutes.get('/reservations/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const reservation = await reservationService.findById(req.params.id, tenantId);

        if (!reservation) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Reservation not found or no access' } });
            return;
        }

        res.json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Create reservation
restaurantRoutes.post('/reservations', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const reservation = await reservationService.create({ ...req.body, tenantId: req.authUser?.tenantId || req.user?.tenantId });
        res.status(201).json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Update reservation
restaurantRoutes.put('/reservations/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const reservation = await reservationService.update(req.params.id, req.body, tenantId);
        res.json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Update reservation status
restaurantRoutes.patch('/reservations/:id/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const reservation = await reservationService.update(req.params.id, { status: status as ReservationStatus }, tenantId);
        res.json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Delete reservation
restaurantRoutes.delete('/reservations/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        await reservationService.delete(req.params.id, tenantId);
        res.json({ success: true, message: 'Reservation deleted successfully' });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// E-MENU (Public endpoints for customer-facing menu)
// ═══════════════════════════════════════════════════════════════════════════

// Get e-menu (public)
restaurantRoutes.get('/e-menu', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { branchId } = req.query;
        const menuData = await eMenuService.getMenu(branchId as string);
        res.json({ success: true, data: menuData });
    } catch (error) {
        next(error);
    }
});

// Create order from e-menu (public)
restaurantRoutes.post('/e-menu/order', async (req: Request, res: Response, next: NextFunction) => {
    try {
        let { branchId, tableNumber, items } = req.body;

        if (!items || items.length === 0) {
            res.status(400).json({
                success: false,
                error: { code: 'RES_004', message: 'items are required' }
            });
            return;
        }

        // Fall back to the default branch if none supplied
        if (!branchId) {
            const defaultBranch = await db.query.branches.findFirst({ where: eq(branches.isMain, true) });
            branchId = defaultBranch?.id;
        }

        const result = await eMenuService.createOrder(branchId, tableNumber, items);
        
        if (!result.success) {
            res.status(400).json({ success: false, error: { code: 'RES_005', message: result.error } });
            return;
        }

        res.status(201).json({ success: true, data: { orderNo: result.orderNo } });
    } catch (error) {
        next(error);
    }
});
