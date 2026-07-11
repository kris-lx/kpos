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
import { withTenantTx } from '@/infrastructure/http/middleware/tenant-tx.middleware';
import { db as globalDb } from '@/config/database.config';
import { branches, tables as restaurantTables, orderItems } from '@/db/schema/tables';
import { eq, and } from 'drizzle-orm';

export const restaurantRoutes = Router();

async function resolveScopedBranch(req: Request, branchId?: string | null) {
    const effectiveBranchId = branchId || req.authUser?.activeBranchId || req.user?.branchId;
    if (!effectiveBranchId) return null;

    const conditions: any[] = [eq(branches.id, String(effectiveBranchId)), eq(branches.isActive, true)];
    if (req.authUser?.tenantId && !req.authUser.isSuperAdmin) {
        conditions.push(eq(branches.tenantId, req.authUser.tenantId));
    }

    const branch = await (req.tx ?? globalDb).query.branches.findFirst({
        where: and(...conditions),
        columns: { id: true, tenantId: true },
    });

    if (!branch || !ensureScopeAccess({ branchId: branch.id, tenantId: branch.tenantId }, req)) {
        return null;
    }

    return branch;
}

async function ensureScopedTable(req: Request, tableId: string, branchId?: string | null) {
    const conditions: any[] = [eq(restaurantTables.id, tableId), eq(restaurantTables.isActive, true)];
    if (req.authUser?.tenantId && !req.authUser.isSuperAdmin) {
        conditions.push(eq(restaurantTables.tenantId, req.authUser.tenantId));
    }
    if (branchId) conditions.push(eq(restaurantTables.branchId, branchId));

    const table = await (req.tx ?? globalDb).query.tables.findFirst({
        where: and(...conditions),
        columns: { id: true, branchId: true, tenantId: true },
    });

    return !!table && ensureScopeAccess(table, req);
}

async function loadScopedOrder(req: Request, orderId: string) {
    const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
    const order = await orderService.findById(orderId, tenantId);
    if (!order || !ensureScopeAccess(order as any, req)) return null;
    return order;
}

// ═══════════════════════════════════════════════════════════════════════════
// TABLES
// ═══════════════════════════════════════════════════════════════════════════

// Get all tables
restaurantRoutes.get('/tables', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
restaurantRoutes.get('/tables/stats', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { branchId } = req.query;

        const branch = await resolveScopedBranch(req, branchId as string | undefined);
        if (!branch) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const stats = await tableService.getStats(branch.id, tenantId);
        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// Get table by ID (scope-checked)
restaurantRoutes.get('/tables/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
restaurantRoutes.post('/tables', authenticate, withTenantTx(), authorize('tables:create'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branch = await resolveScopedBranch(req, req.body.branchId);
        if (!branch) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }

        const table = await tableService.create({
            ...req.body,
            branchId: branch.id,
            tenantId: req.authUser?.tenantId || req.user?.tenantId || branch.tenantId,
        });
        res.status(201).json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
});

// Update table
restaurantRoutes.put('/tables/:id', authenticate, withTenantTx(), authorize('tables:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        if (!(await ensureScopedTable(req, req.params.id))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Table not found or no access' } });
            return;
        }
        if (req.body.branchId && !(await resolveScopedBranch(req, req.body.branchId))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }
        const table = await tableService.update(req.params.id, req.body, tenantId);
        res.json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
});

// Update table status
restaurantRoutes.patch('/tables/:id/status', authenticate, withTenantTx(), authorize('tables:update'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { status } = req.body;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        if (!(await ensureScopedTable(req, req.params.id))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Table not found or no access' } });
            return;
        }
        const table = await tableService.updateStatus(req.params.id, status as TableStatus, tenantId);
        res.json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
});

// Delete table (soft delete)
restaurantRoutes.delete('/tables/:id', authenticate, withTenantTx(), authorize('tables:delete'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        if (!(await ensureScopedTable(req, req.params.id))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Table not found or no access' } });
            return;
        }
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
restaurantRoutes.get('/zones', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
restaurantRoutes.get('/orders', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
restaurantRoutes.get('/orders/stats', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { branchId } = req.query;

        const branch = await resolveScopedBranch(req, branchId as string | undefined);
        if (!branch) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const stats = await orderService.getStats(branch.id, tenantId);
        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// Get order by ID
restaurantRoutes.get('/orders/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const order = await orderService.findById(req.params.id, tenantId);

        if (!order) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Order not found or no access' } });
            return;
        }
        if (!ensureScopeAccess(order as any, req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
            return;
        }

        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Create order
restaurantRoutes.post('/orders', authenticate, withTenantTx(), authorize('restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branch = await resolveScopedBranch(req, req.body.branchId);
        if (!branch) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }

        if (req.body.tableId && !(await ensureScopedTable(req, req.body.tableId, branch.id))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid table or no access' } });
            return;
        }

        const order = await orderService.create({
            ...req.body,
            branchId: branch.id,
            tenantId: req.authUser?.tenantId || req.user?.tenantId || branch.tenantId,
        });
        res.status(201).json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update order
restaurantRoutes.put('/orders/:id', authenticate, withTenantTx(), authorize('restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const existingOrder = await loadScopedOrder(req, req.params.id);
        if (!existingOrder) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Order not found or no access' } });
            return;
        }
        if (req.body.branchId && !(await resolveScopedBranch(req, req.body.branchId))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }
        if (req.body.tableId && !(await ensureScopedTable(req, req.body.tableId, (existingOrder as any).branchId))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid table or no access' } });
            return;
        }
        const order = await orderService.update(req.params.id, req.body, tenantId);
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Update order status
restaurantRoutes.patch('/orders/:id/status', authenticate, withTenantTx(), authorize('restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { status } = req.body;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const existingOrder = await loadScopedOrder(req, req.params.id);
        if (!existingOrder) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Order not found or no access' } });
            return;
        }
        const order = await orderService.update(req.params.id, { status: status as OrderStatus }, tenantId);
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// Add items to order
restaurantRoutes.post('/orders/:id/items', authenticate, withTenantTx(), authorize('restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { items } = req.body;
        const existingOrder = await loadScopedOrder(req, req.params.id);
        if (!existingOrder) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Order not found or no access' } });
            return;
        }

        const order = await orderService.addItems(req.params.id, items, (existingOrder as any).tenantId);
        res.json({ success: true, data: order });
    } catch (error) {
        next(error);
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// KITCHEN DISPLAY
// ═══════════════════════════════════════════════════════════════════════════

// Get kitchen orders
restaurantRoutes.get('/kitchen', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
restaurantRoutes.put('/kitchen/:orderId/items/:itemId', authenticate, withTenantTx(), authorize('restaurant:kitchen', 'restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { status } = req.body;
        const order = await loadScopedOrder(req, req.params.orderId);
        if (!order) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Order not found or no access' } });
            return;
        }
        const itemRecord = await db.query.orderItems.findFirst({
            where: and(eq(orderItems.id, req.params.itemId), eq(orderItems.orderId, req.params.orderId)),
            columns: { id: true },
        });
        if (!itemRecord) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Item not found or no access' } });
            return;
        }
        const item = await orderService.updateItemStatus(req.params.itemId, status as OrderItemStatus);
        res.json({ success: true, data: item });
    } catch (error) {
        next(error);
    }
});

// Legacy endpoint for backward compatibility
restaurantRoutes.patch('/kitchen/items/:id/status', authenticate, withTenantTx(), authorize('restaurant:kitchen', 'restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { status } = req.body;
        const itemRecord = await db.query.orderItems.findFirst({
            where: eq(orderItems.id, req.params.id),
            columns: { id: true, orderId: true },
        });
        if (!itemRecord) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Item not found or no access' } });
            return;
        }
        const order = await loadScopedOrder(req, itemRecord.orderId);
        if (!order) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Item not found or no access' } });
            return;
        }
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
restaurantRoutes.get('/reservations', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
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
restaurantRoutes.get('/reservations/stats', authenticate, withTenantTx(), branchFilter(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { branchId, date } = req.query;

        const branch = await resolveScopedBranch(req, branchId as string | undefined);
        if (!branch) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }

        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const stats = await reservationService.getStats(
            branch.id,
            date ? new Date(date as string) : undefined,
            tenantId
        );
        res.json({ success: true, data: stats });
    } catch (error) {
        next(error);
    }
});

// Get reservation by ID
restaurantRoutes.get('/reservations/:id', authenticate, withTenantTx(), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const reservation = await reservationService.findById(req.params.id, tenantId);

        if (!reservation) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Reservation not found or no access' } });
            return;
        }
        if (!ensureScopeAccess(reservation as any, req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No access' } });
            return;
        }

        res.json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Create reservation
restaurantRoutes.post('/reservations', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const branch = await resolveScopedBranch(req, req.body.branchId);
        if (!branch) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }

        if (req.body.tableId && !(await ensureScopedTable(req, req.body.tableId, branch.id))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid table or no access' } });
            return;
        }

        const reservation = await reservationService.create({
            ...req.body,
            branchId: branch.id,
            tenantId: req.authUser?.tenantId || req.user?.tenantId || branch.tenantId,
        });
        res.status(201).json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Update reservation
restaurantRoutes.put('/reservations/:id', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const existing = await reservationService.findById(req.params.id, tenantId);
        if (!existing || !ensureScopeAccess(existing as any, req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Reservation not found or no access' } });
            return;
        }
        if (req.body.branchId && !(await resolveScopedBranch(req, req.body.branchId))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid branch or no access' } });
            return;
        }
        if (req.body.tableId && !(await ensureScopedTable(req, req.body.tableId, (existing as any).branchId))) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Invalid table or no access' } });
            return;
        }
        const reservation = await reservationService.update(req.params.id, req.body, tenantId);
        res.json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Update reservation status
restaurantRoutes.patch('/reservations/:id/status', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const { status } = req.body;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const existing = await reservationService.findById(req.params.id, tenantId);
        if (!existing || !ensureScopeAccess(existing as any, req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Reservation not found or no access' } });
            return;
        }
        const reservation = await reservationService.update(req.params.id, { status: status as ReservationStatus }, tenantId);
        res.json({ success: true, data: reservation });
    } catch (error) {
        next(error);
    }
});

// Delete reservation
restaurantRoutes.delete('/reservations/:id', authenticate, withTenantTx(), authorize('restaurant:reservations', 'restaurant:manage'), async (req, res, next) => {
    try {
        const db = req.tx ?? globalDb;
        const tenantId = (!req.authUser?.isSuperAdmin && req.authUser?.tenantId) || undefined;
        const existing = await reservationService.findById(req.params.id, tenantId);
        if (!existing || !ensureScopeAccess(existing as any, req)) {
            res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Reservation not found or no access' } });
            return;
        }
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
restaurantRoutes.get('/e-menu', async (req, res, next) => {
    try {
        const { branchId } = req.query;
        const menuData = await eMenuService.getMenu(branchId as string);
        res.json({ success: true, data: menuData });
    } catch (error) {
        next(error);
    }
});

// Create order from e-menu (public)
restaurantRoutes.post('/e-menu/order', async (req, res, next) => {
    try {
        const { branchId, tableNumber, items } = req.body;

        if (!items || items.length === 0) {
            res.status(400).json({
                success: false,
                error: { code: 'RES_004', message: 'items are required' }
            });
            return;
        }

        // F4: require an explicit, valid, active branch. Never default to a global
        // main branch — that would let a public caller post orders into any tenant.
        if (!branchId) {
            res.status(400).json({ success: false, error: { code: 'RES_006', message: 'branchId is required' } });
            return;
        }
        // Public e-menu endpoint — no authenticate/withTenantTx, always globalDb.
        // eslint-disable-next-line no-restricted-syntax -- public e-menu endpoint, no authenticate/req.tx
        const branch = await globalDb.query.branches.findFirst({
            where: and(eq(branches.id, String(branchId)), eq(branches.isActive, true)),
            columns: { id: true },
        });
        if (!branch) {
            res.status(404).json({ success: false, error: { code: 'RES_007', message: 'Invalid or inactive branch' } });
            return;
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
