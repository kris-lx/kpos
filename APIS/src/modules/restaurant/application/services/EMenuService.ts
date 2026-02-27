// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - E-Menu Service
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { settings, categories, products, tables } from '@/db/schema/tables';
import { eq, and, asc } from 'drizzle-orm';
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
        const restaurantSettings = await db.query.settings.findFirst({
            where: and(eq(settings.category, 'restaurant'), eq(settings.key, 'info')),
        });

        const categoryList = await db.query.categories.findMany({
            where: eq(categories.isActive, true),
            orderBy: asc(categories.sortOrder),
            columns: { id: true, name: true, image: true, sortOrder: true },
        });

        const prodConds: any[] = [eq(products.isActive, true)];
        if (branchId) prodConds.push(eq(products.branchId, branchId));

        const productList = await db.query.products.findMany({
            where: and(...prodConds),
            with: { category: { columns: { name: true } }, inventory: { columns: { quantity: true } } },
            orderBy: asc(products.sortOrder),
        });

        const restaurantInfo = restaurantSettings?.value as Record<string, unknown> || {};

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
            categories: categoryList.map(c => ({
                id: c.id,
                name: c.name,
                icon: c.image || '🍽️',
                sortOrder: c.sortOrder,
            })),
            items: productList.map((p: any) => ({
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
                const table = await db.query.tables.findFirst({
                    where: and(eq(tables.branchId, branchId), eq(tables.name, tableNumber), eq(tables.isActive, true)),
                });
                tableId = table?.id;
            }

            const orderItemsData: CreateOrderItemDTO[] = await Promise.all(
                items.map(async (item) => {
                    const product = await db.query.products.findFirst({ where: eq(products.id, item.itemId) });
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
                items: orderItemsData,
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
