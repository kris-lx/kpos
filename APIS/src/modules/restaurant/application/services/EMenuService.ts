// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - E-Menu Service
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from '@/config/database.config';
import { OrderService, CreateOrderDTO, CreateOrderItemDTO } from './OrderService';
import { OrderType } from '../../domain/entities';

export interface MenuItem {
    id: string;
    name: string;
    description?: string;
    price: number;
    image?: string;
    category: string;
    isAvailable: boolean;
    isPopular?: boolean;
    isSpicy?: boolean;
    isVegetarian?: boolean;
}

export interface MenuCategory {
    id: string;
    name: string;
    icon?: string;
    sortOrder: number;
}

export interface EMenuData {
    restaurant: {
        name: string;
        description?: string;
        logo?: string;
        isOpen: boolean;
        openTime: string;
        closeTime: string;
    };
    categories: MenuCategory[];
    items: MenuItem[];
}

export interface EMenuOrderItem {
    itemId: string;
    name: string;
    price: number;
    quantity: number;
    specialRequest?: string;
    tableNumber?: string;
}

export class EMenuService {
    private orderService: OrderService;

    constructor() {
        this.orderService = new OrderService();
    }

    async getMenu(branchId?: string): Promise<EMenuData> {
        // Get restaurant settings
        const settings = await prisma.settings.findFirst({
            where: { category: 'restaurant', key: 'info' },
        });

        // Get categories
        const categories = await prisma.category.findMany({
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
            select: {
                id: true,
                name: true,
                image: true,
                sortOrder: true,
            },
        });

        // Get products with inventory
        const where: Record<string, unknown> = { isActive: true };
        if (branchId) where.branchId = branchId;

        const products = await prisma.product.findMany({
            where,
            include: {
                category: { select: { name: true } },
                inventory: { select: { quantity: true } },
            },
            orderBy: { sortOrder: 'asc' },
        });

        const restaurantInfo = settings?.value as Record<string, unknown> || {};

        return {
            restaurant: {
                name: (restaurantInfo.name as string) || 'KPOS Restaurant',
                description: (restaurantInfo.description as string) || '',
                logo: (restaurantInfo.logo as string) || '',
                isOpen: this.isRestaurantOpen(
                    (restaurantInfo.openTime as string) || '09:00',
                    (restaurantInfo.closeTime as string) || '22:00'
                ),
                openTime: (restaurantInfo.openTime as string) || '09:00',
                closeTime: (restaurantInfo.closeTime as string) || '22:00',
            },
            categories: categories.map(c => ({
                id: c.id,
                name: c.name,
                icon: c.image || '🍽️',
                sortOrder: c.sortOrder,
            })),
            items: products.map(p => ({
                id: p.id,
                name: p.name,
                description: p.description || '',
                price: p.price,
                image: p.image || '',
                category: p.categoryId || '',
                isAvailable: p.trackStock 
                    ? (p.inventory?.[0]?.quantity || 0) > 0 
                    : true,
                isPopular: (p.tags || []).includes('popular'),
                isSpicy: (p.tags || []).includes('spicy'),
                isVegetarian: (p.tags || []).includes('vegetarian'),
            })),
        };
    }

    async createOrder(
        branchId: string,
        tableNumber: string | null,
        items: EMenuOrderItem[]
    ): Promise<{ success: boolean; orderNo?: string; error?: string }> {
        try {
            // Find table by number/name
            let tableId: string | undefined;
            if (tableNumber) {
                const table = await prisma.table.findFirst({
                    where: { 
                        branchId,
                        name: tableNumber,
                        isActive: true,
                    },
                });
                tableId = table?.id;
            }

            // Map e-menu items to order items
            const orderItems: CreateOrderItemDTO[] = await Promise.all(
                items.map(async (item) => {
                    const product = await prisma.product.findUnique({
                        where: { id: item.itemId },
                    });
                    
                    return {
                        productId: item.itemId,
                        productName: product?.name || item.name,
                        quantity: item.quantity,
                        unitPrice: product?.price || item.price,
                        note: item.specialRequest,
                    };
                })
            );

            const orderData: CreateOrderDTO = {
                branchId,
                tableId,
                type: tableId ? OrderType.DINE_IN : OrderType.TAKEAWAY,
                items: orderItems,
            };

            const order = await this.orderService.create(orderData);

            return { success: true, orderNo: order.orderNo };
        } catch (error) {
            console.error('E-Menu order error:', error);
            return { success: false, error: 'Failed to create order' };
        }
    }

    private isRestaurantOpen(openTime: string, closeTime: string): boolean {
        const now = new Date();
        const currentTime = now.getHours() * 60 + now.getMinutes();
        
        const [openHour, openMin] = openTime.split(':').map(Number);
        const [closeHour, closeMin] = closeTime.split(':').map(Number);
        
        const openMinutes = openHour * 60 + openMin;
        const closeMinutes = closeHour * 60 + closeMin;

        return currentTime >= openMinutes && currentTime <= closeMinutes;
    }
}

export const eMenuService = new EMenuService();
