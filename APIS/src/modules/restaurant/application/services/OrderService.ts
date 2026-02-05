// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Order Service
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from '@/config/database.config';
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
}

export class OrderService {
    private generateOrderNumber(): string {
        const now = new Date();
        const date = now.toISOString().slice(0, 10).replace(/-/g, '');
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ORD-${date}-${random}`;
    }

    async findAll(filters: OrderFilters = {}): Promise<Order[]> {
        const where: Record<string, unknown> = {};
        
        if (filters.branchId) where.branchId = filters.branchId;
        if (filters.tableId) where.tableId = filters.tableId;
        if (filters.type) where.type = filters.type;
        if (filters.status) {
            where.status = Array.isArray(filters.status) 
                ? { in: filters.status }
                : filters.status;
        }

        const orders = await prisma.order.findMany({
            where,
            include: {
                table: { select: { name: true } },
                items: true,
            },
            orderBy: { createdAt: 'desc' },
        });

        return orders.map(o => new Order({
            ...o,
            items: o.items.map(i => new OrderItem(i as any)),
        } as any));
    }

    async findById(id: string): Promise<Order | null> {
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                table: true,
                items: true,
            },
        });

        if (!order) return null;

        return new Order({
            ...order,
            items: order.items.map(i => new OrderItem(i as any)),
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

        // Create order first without items
        const order = await prisma.order.create({
            data: {
                orderNo,
                branchId: data.branchId,
                tableId: data.tableId,
                type: data.type || OrderType.DINE_IN,
                guestCount: data.guestCount || 1,
                note: data.note,
                kitchenNote: data.kitchenNote,
                subtotal,
                total: subtotal,
            },
        });

        // Create items separately using createMany
        await prisma.orderItem.createMany({
            data: itemsData.map(item => ({
                ...item,
                orderId: order.id,
            })),
        });

        // Fetch the complete order with items
        const completeOrder = await prisma.order.findUnique({
            where: { id: order.id },
            include: { items: true },
        });

        // Update table status to OCCUPIED
        if (data.tableId) {
            await prisma.table.update({
                where: { id: data.tableId },
                data: { status: TableStatus.OCCUPIED },
            });
        }

        return new Order({
            ...completeOrder,
            items: completeOrder?.items.map(i => new OrderItem(i as any)) || [],
        } as any);
    }

    async update(id: string, data: UpdateOrderDTO): Promise<Order> {
        const now = new Date();
        const updateData: Record<string, unknown> = { ...data };

        if (data.status === OrderStatus.SERVED) updateData.servedAt = now;
        if (data.status === OrderStatus.COMPLETED) updateData.completedAt = now;

        const order = await prisma.order.update({
            where: { id },
            data: updateData,
            include: { table: true, items: true },
        });

        // Handle table status based on order status
        if (data.status === OrderStatus.COMPLETED && order.tableId) {
            await prisma.table.update({
                where: { id: order.tableId },
                data: { status: TableStatus.CLEANING },
            });
        }

        return new Order({
            ...order,
            items: order.items.map(i => new OrderItem(i as any)),
        } as any);
    }

    async addItems(orderId: string, items: CreateOrderItemDTO[]): Promise<Order> {
        const orderItems = items.map(item => ({
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

        await prisma.orderItem.createMany({ data: orderItems });

        // Recalculate totals
        const allItems = await prisma.orderItem.findMany({
            where: { orderId },
        });
        const subtotal = allItems.reduce((sum, item) => sum + item.total, 0);

        const order = await prisma.order.update({
            where: { id: orderId },
            data: { subtotal, total: subtotal },
            include: { items: true },
        });

        return new Order({
            ...order,
            items: order.items.map(i => new OrderItem(i as any)),
        } as any);
    }

    async updateItemStatus(itemId: string, status: OrderItemStatus): Promise<OrderItem> {
        const now = new Date();
        const updateData: Record<string, unknown> = { status };

        if (status === OrderItemStatus.PREPARING) updateData.sentAt = now;
        if (status === OrderItemStatus.READY) updateData.preparedAt = now;

        const item = await prisma.orderItem.update({
            where: { id: itemId },
            data: updateData,
        });

        // Check if all items are ready and update order status
        const order = await prisma.order.findUnique({
            where: { id: item.orderId },
            include: { items: true },
        });

        if (order) {
            if (order.items.every(i => i.status === 'READY' || i.status === 'SERVED')) {
                await prisma.order.update({
                    where: { id: order.id },
                    data: { status: OrderStatus.READY },
                });
            } else if (order.items.some(i => i.status === 'PREPARING')) {
                await prisma.order.update({
                    where: { id: order.id },
                    data: { status: OrderStatus.PREPARING },
                });
            }
        }

        return new OrderItem(item as any);
    }

    async getKitchenOrders(branchId?: string): Promise<Order[]> {
        const where: Record<string, unknown> = {
            status: { in: [OrderStatus.PENDING, OrderStatus.PREPARING] },
        };
        if (branchId) where.branchId = branchId;

        const orders = await prisma.order.findMany({
            where,
            include: {
                table: { select: { name: true } },
                items: {
                    where: { 
                        status: { in: [OrderItemStatus.PENDING, OrderItemStatus.PREPARING] } 
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });

        return orders.map(o => new Order({
            ...o,
            items: o.items.map(i => new OrderItem(i as any)),
        } as any));
    }

    async getStats(branchId: string): Promise<{
        total: number;
        pending: number;
        preparing: number;
        ready: number;
        completed: number;
    }> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [total, pending, preparing, ready, completed] = await Promise.all([
            prisma.order.count({ where: { branchId, createdAt: { gte: today } } }),
            prisma.order.count({ where: { branchId, status: OrderStatus.PENDING } }),
            prisma.order.count({ where: { branchId, status: OrderStatus.PREPARING } }),
            prisma.order.count({ where: { branchId, status: OrderStatus.READY } }),
            prisma.order.count({ where: { branchId, createdAt: { gte: today }, status: OrderStatus.COMPLETED } }),
        ]);

        return { total, pending, preparing, ready, completed };
    }
}

export const orderService = new OrderService();
