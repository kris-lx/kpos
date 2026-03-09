// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Order Service
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { orders, orderItems, tables } from '@/db/schema/tables';
import { eq, and, inArray, gte, count } from 'drizzle-orm';
import { Order, OrderStatus, OrderType, OrderItem, OrderItemStatus, TableStatus } from '../../domain/entities';

export interface CreateOrderItemDTO {
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    note?: string;
    modifiers?: Record<string, unknown>;
}

export interface CreateOrderDTO {
    branchId: string;
    tableId?: string;
    type?: OrderType;
    guestCount?: number;
    note?: string;
    kitchenNote?: string;
    priority?: string;
    items: CreateOrderItemDTO[];
}

export interface UpdateOrderDTO {
    status?: OrderStatus;
    note?: string;
    kitchenNote?: string;
    priority?: string;
}

export interface OrderFilters {
    branchId?: string;
    tableId?: string;
    status?: OrderStatus | OrderStatus[];
    type?: OrderType;
    tenantId?: string;
}

export class OrderService {
    private generateOrderNumber(): string {
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ORD-${date}-${random}`;
    }

    async findAll(filters: OrderFilters = {}): Promise<Order[]> {
        const conds: any[] = [];
        if (filters.tenantId) conds.push(eq(orders.tenantId, filters.tenantId));
        if (filters.branchId) conds.push(eq(orders.branchId, filters.branchId));
        if (filters.tableId) conds.push(eq(orders.tableId, filters.tableId));
        if (filters.type) conds.push(eq(orders.type, filters.type));
        if (filters.status) {
            if (Array.isArray(filters.status)) {
                conds.push(inArray(orders.status, filters.status));
            } else {
                conds.push(eq(orders.status, filters.status));
            }
        }
        const where = conds.length > 0 ? and(...conds) : undefined;

        const rows = await db.query.orders.findMany({
            where,
            with: { table: { columns: { name: true } }, items: true },
            orderBy: (o, { desc }) => desc(o.createdAt),
        });

        return rows.map(o => new Order({
            ...o,
            items: (o as any).items?.map((i: any) => new OrderItem(i)) || [],
        } as any));
    }

    async findById(id: string, tenantId?: string): Promise<Order | null> {
        const conds: any[] = [eq(orders.id, id)];
        if (tenantId) conds.push(eq(orders.tenantId, tenantId));
        const order = await db.query.orders.findFirst({
            where: and(...conds),
            with: { table: true, items: true },
        });

        if (!order) return null;

        return new Order({
            ...order,
            items: (order as any).items?.map((i: any) => new OrderItem(i)) || [],
        } as any);
    }

    async create(data: CreateOrderDTO): Promise<Order> {
        const orderNo = this.generateOrderNumber();
        const itemsData = data.items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            note: item.note || '',
            modifiers: item.modifiers ? JSON.parse(JSON.stringify(item.modifiers)) : null,
            status: OrderItemStatus.PENDING,
        }));

        const subtotal = itemsData.reduce((sum, item) => sum + item.total, 0);

        const [order] = await db.insert(orders).values({
            tenantId: (data as any).tenantId || undefined,
            orderNo, branchId: data.branchId, tableId: data.tableId,
            type: data.type || OrderType.DINE_IN, guestCount: data.guestCount || 1,
            note: data.note, kitchenNote: data.kitchenNote, subtotal, total: subtotal,
        }).returning();

        for (const item of itemsData) {
            await db.insert(orderItems).values({ ...item, orderId: order.id });
        }

        const completeOrder = await db.query.orders.findFirst({
            where: eq(orders.id, order.id), with: { items: true },
        });

        if (data.tableId) {
            await db.update(tables).set({ status: TableStatus.OCCUPIED }).where(eq(tables.id, data.tableId));
        }

        return new Order({
            ...completeOrder,
            items: (completeOrder as any)?.items?.map((i: any) => new OrderItem(i)) || [],
        } as any);
    }

    async update(id: string, data: UpdateOrderDTO, tenantId?: string): Promise<Order> {
        const now = new Date();
        const updateData: Record<string, unknown> = { ...data };

        if (data.status === OrderStatus.SERVED) updateData.servedAt = now;
        if (data.status === OrderStatus.COMPLETED) updateData.completedAt = now;

        const updConds: any[] = [eq(orders.id, id)];
        if (tenantId) updConds.push(eq(orders.tenantId, tenantId));
        await db.update(orders).set(updateData).where(and(...updConds));
        const order = await db.query.orders.findFirst({ where: and(...updConds), with: { table: true, items: true } });

        if (data.status === OrderStatus.COMPLETED && order?.tableId) {
            await db.update(tables).set({ status: TableStatus.CLEANING }).where(eq(tables.id, order.tableId));
        }

        return new Order({
            ...order,
            items: (order as any)?.items?.map((i: any) => new OrderItem(i)) || [],
        } as any);
    }

    async addItems(orderId: string, items: CreateOrderItemDTO[]): Promise<Order> {
        const newItems = items.map(item => ({
            orderId,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            note: item.note || '',
            modifiers: item.modifiers ? JSON.parse(JSON.stringify(item.modifiers)) : null,
            status: OrderItemStatus.PENDING,
        }));

        for (const oi of newItems) {
            await db.insert(orderItems).values(oi);
        }

        const allItems = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, orderId) });
        const subtotal = allItems.reduce((sum: number, item: any) => sum + item.total, 0);

        await db.update(orders).set({ subtotal, total: subtotal }).where(eq(orders.id, orderId));
        const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId), with: { items: true } });

        return new Order({
            ...order,
            items: (order as any)?.items?.map((i: any) => new OrderItem(i)) || [],
        } as any);
    }

    async updateItemStatus(itemId: string, status: OrderItemStatus): Promise<OrderItem> {
        const now = new Date();
        const updateData: Record<string, unknown> = { status };

        if (status === OrderItemStatus.PREPARING) updateData.sentAt = now;
        if (status === OrderItemStatus.READY) updateData.preparedAt = now;

        const [item] = await db.update(orderItems).set(updateData).where(eq(orderItems.id, itemId)).returning();

        const order = await db.query.orders.findFirst({
            where: eq(orders.id, item.orderId), with: { items: true },
        });

        if (order) {
            const items = (order as any).items || [];
            if (items.every((i: any) => i.status === 'READY' || i.status === 'SERVED')) {
                await db.update(orders).set({ status: OrderStatus.READY }).where(eq(orders.id, order.id));
            } else if (items.some((i: any) => i.status === 'PREPARING')) {
                await db.update(orders).set({ status: OrderStatus.PREPARING }).where(eq(orders.id, order.id));
            }
        }

        return new OrderItem(item as any);
    }

    async getKitchenOrders(branchId?: string, tenantId?: string): Promise<Order[]> {
        const conds: any[] = [inArray(orders.status, [OrderStatus.PENDING, OrderStatus.PREPARING])];
        if (tenantId) conds.push(eq(orders.tenantId, tenantId));
        if (branchId) conds.push(eq(orders.branchId, branchId));

        const rows = await db.query.orders.findMany({
            where: and(...conds),
            with: { table: { columns: { name: true } }, items: true },
            orderBy: (o, { asc }) => asc(o.createdAt),
        });

        return rows.map(o => new Order({
            ...o,
            items: ((o as any).items || []).filter((i: any) => [OrderItemStatus.PENDING, OrderItemStatus.PREPARING].includes(i.status)).map((i: any) => new OrderItem(i)),
        } as any));
    }

    async getStats(branchId: string, tenantId?: string): Promise<{
        total: number;
        pending: number;
        preparing: number;
        ready: number;
        completed: number;
    }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const baseConds: any[] = [eq(orders.branchId, branchId)];
        if (tenantId) baseConds.push(eq(orders.tenantId, tenantId));
        const branchCond = and(...baseConds);
        const [[{ value: total }], [{ value: pending }], [{ value: preparing }], [{ value: ready }], [{ value: completed }]] = await Promise.all([
            db.select({ value: count() }).from(orders).where(and(branchCond, gte(orders.createdAt, today))),
            db.select({ value: count() }).from(orders).where(and(branchCond, eq(orders.status, OrderStatus.PENDING))),
            db.select({ value: count() }).from(orders).where(and(branchCond, eq(orders.status, OrderStatus.PREPARING))),
            db.select({ value: count() }).from(orders).where(and(branchCond, eq(orders.status, OrderStatus.READY))),
            db.select({ value: count() }).from(orders).where(and(branchCond, gte(orders.createdAt, today), eq(orders.status, OrderStatus.COMPLETED))),
        ]);

        return { total, pending, preparing, ready, completed };
    }
}

export const orderService = new OrderService();
