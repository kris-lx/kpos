// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Table Entity
// ═══════════════════════════════════════════════════════════════════════════

export enum TableStatus {
    AVAILABLE = 'AVAILABLE',
    OCCUPIED = 'OCCUPIED',
    RESERVED = 'RESERVED',
    CLEANING = 'CLEANING',
}

export enum TableShape {
    SQUARE = 'SQUARE',
    ROUND = 'ROUND',
    RECTANGLE = 'RECTANGLE',
}

export interface TableProps {
    id?: string;
    name: string;
    branchId: string;
    areaId?: string;
    capacity: number;
    status: TableStatus;
    posX?: number;
    posY?: number;
    shape?: TableShape;
    floor?: string;
    zone?: string;
    isActive?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export class Table {
    public readonly id?: string;
    public readonly name: string;
    public readonly branchId: string;
    public readonly areaId?: string;
    public readonly capacity: number;
    public readonly status: TableStatus;
    public readonly posX: number;
    public readonly posY: number;
    public readonly shape: TableShape;
    public readonly floor: string;
    public readonly zone: string;
    public readonly isActive: boolean;
    public readonly createdAt?: Date;
    public readonly updatedAt?: Date;

    constructor(props: TableProps) {
        this.id = props.id;
        this.name = props.name;
        this.branchId = props.branchId;
        this.areaId = props.areaId;
        this.capacity = props.capacity;
        this.status = props.status;
        this.posX = props.posX || 0;
        this.posY = props.posY || 0;
        this.shape = props.shape || TableShape.SQUARE;
        this.floor = props.floor || '1';
        this.zone = props.zone || 'main';
        this.isActive = props.isActive ?? true;
        this.createdAt = props.createdAt;
        this.updatedAt = props.updatedAt;
    }

    public isAvailable(): boolean {
        return this.status === TableStatus.AVAILABLE;
    }

    public isOccupied(): boolean {
        return this.status === TableStatus.OCCUPIED;
    }
}
