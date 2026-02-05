// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Order Entity
// ═══════════════════════════════════════════════════════════════════════════

export enum OrderStatus {
    PENDING = 'PENDING',
    PREPARING = 'PREPARING',
    READY = 'READY',
    SERVED = 'SERVED',
    COMPLETED = 'COMPLETED',
    CANCELLED = 'CANCELLED',
}

export enum OrderType {
    DINE_IN = 'DINE_IN',
    TAKEAWAY = 'TAKEAWAY',
    DELIVERY = 'DELIVERY',
}

export enum OrderItemStatus {
    PENDING = 'PENDING',
    PREPARING = 'PREPARING',
    READY = 'READY',
    SERVED = 'SERVED',
    CANCELLED = 'CANCELLED',
}

export interface OrderItemProps {
    id?: string;
    orderId?: string;
    productId: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    total: number;
    status?: OrderItemStatus;
    note?: string;
    modifiers?: Record<string, unknown>;
    sentAt?: Date;
    preparedAt?: Date;
}

export class OrderItem {
    public readonly id?: string;
    public readonly orderId?: string;
    public readonly productId: string;
    public readonly productName: string;
    public readonly quantity: number;
    public readonly unitPrice: number;
    public readonly total: number;
    public readonly status: OrderItemStatus;
    public readonly note?: string;
    public readonly modifiers?: Record<string, unknown>;
    public readonly sentAt?: Date;
    public readonly preparedAt?: Date;

    constructor(props: OrderItemProps) {
        this.id = props.id;
        this.orderId = props.orderId;
        this.productId = props.productId;
        this.productName = props.productName;
        this.quantity = props.quantity;
        this.unitPrice = props.unitPrice;
        this.total = props.total;
        this.status = props.status || OrderItemStatus.PENDING;
        this.note = props.note;
        this.modifiers = props.modifiers;
        this.sentAt = props.sentAt;
        this.preparedAt = props.preparedAt;
    }

    public isPending(): boolean {
        return this.status === OrderItemStatus.PENDING;
    }

    public isReady(): boolean {
        return this.status === OrderItemStatus.READY;
    }
}

export interface OrderProps {
    id?: string;
    orderNo: string;
    branchId: string;
    tableId?: string;
    type?: OrderType;
    status?: OrderStatus;
    guestCount?: number;
    subtotal?: number;
    discount?: number;
    tax?: number;
    total?: number;
    note?: string;
    kitchenNote?: string;
    priority?: string;
    servedAt?: Date;
    completedAt?: Date;
    items?: OrderItem[];
    createdAt?: Date;
    updatedAt?: Date;
}

export class Order {
    public readonly id?: string;
    public readonly orderNo: string;
    public readonly branchId: string;
    public readonly tableId?: string;
    public readonly type: OrderType;
    public readonly status: OrderStatus;
    public readonly guestCount: number;
    public readonly subtotal: number;
    public readonly discount: number;
    public readonly tax: number;
    public readonly total: number;
    public readonly note?: string;
    public readonly kitchenNote?: string;
    public readonly priority: string;
    public readonly servedAt?: Date;
    public readonly completedAt?: Date;
    public readonly items: OrderItem[];
    public readonly createdAt?: Date;
    public readonly updatedAt?: Date;

    constructor(props: OrderProps) {
        this.id = props.id;
        this.orderNo = props.orderNo;
        this.branchId = props.branchId;
        this.tableId = props.tableId;
        this.type = props.type || OrderType.DINE_IN;
        this.status = props.status || OrderStatus.PENDING;
        this.guestCount = props.guestCount || 1;
        this.subtotal = props.subtotal || 0;
        this.discount = props.discount || 0;
        this.tax = props.tax || 0;
        this.total = props.total || 0;
        this.note = props.note;
        this.kitchenNote = props.kitchenNote;
        this.priority = props.priority || 'normal';
        this.servedAt = props.servedAt;
        this.completedAt = props.completedAt;
        this.items = props.items || [];
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
    }

    public calculateTotal(): number {
        return this.items.reduce((sum, item) => sum + item.total, 0);
    }

    public getCompletedItemsCount(): number {
        return this.items.filter(item => item.status === OrderItemStatus.READY || item.status === OrderItemStatus.SERVED).length;
    }

    public allItemsReady(): boolean {
        return this.items.length > 0 && this.items.every(item => 
            item.status === OrderItemStatus.READY || 
            item.status === OrderItemStatus.SERVED
        );
    }
}
