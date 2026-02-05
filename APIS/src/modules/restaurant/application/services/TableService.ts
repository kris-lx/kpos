// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Table Service
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from '@/config/database.config';
import { Table, TableStatus, TableShape } from '../../domain/entities';

export interface CreateTableDTO {
    name: string;
    branchId: string;
    areaId?: string;
    capacity?: number;
    status?: TableStatus;
    posX?: number;
    posY?: number;
    shape?: TableShape;
    floor?: string;
    zone?: string;
}

export interface UpdateTableDTO {
    name?: string;
    capacity?: number;
    status?: TableStatus;
    posX?: number;
    posY?: number;
    shape?: TableShape;
    floor?: string;
    zone?: string;
    isActive?: boolean;
}

export interface TableFilters {
    branchId?: string;
    status?: TableStatus;
    zone?: string;
    floor?: string;
    isActive?: boolean;
}

export class TableService {
    async findAll(filters: TableFilters = {}): Promise<Table[]> {
        const where: Record<string, unknown> = { isActive: true };
        
        if (filters.branchId) where.branchId = filters.branchId;
        if (filters.status) where.status = filters.status;
        if (filters.isActive !== undefined) where.isActive = filters.isActive;

        const tables = await prisma.table.findMany({
            where,
            orderBy: { name: 'asc' },
        });

        return tables.map(t => new Table(t as any));
    }

    async findById(id: string): Promise<Table | null> {
        const table = await prisma.table.findUnique({
            where: { id },
            include: {
                orders: {
                    where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
                    include: { items: true },
                },
            },
        });

        if (!table) return null;
        return new Table(table as any);
    }

    async create(data: CreateTableDTO): Promise<Table> {
        const table = await prisma.table.create({
            data: {
                name: data.name,
                branchId: data.branchId,
                areaId: data.areaId,
                capacity: data.capacity || 4,
                status: data.status || TableStatus.AVAILABLE,
                posX: data.posX || 0,
                posY: data.posY || 0,
                shape: data.shape || TableShape.SQUARE,
            },
        });

        return new Table(table as any);
    }

    async update(id: string, data: UpdateTableDTO): Promise<Table> {
        const table = await prisma.table.update({
            where: { id },
            data,
        });

        return new Table(table as any);
    }

    async updateStatus(id: string, status: TableStatus): Promise<Table> {
        const table = await prisma.table.update({
            where: { id },
            data: { status },
        });

        return new Table(table as any);
    }

    async delete(id: string): Promise<void> {
        await prisma.table.update({
            where: { id },
            data: { isActive: false },
        });
    }

    async getStats(branchId: string): Promise<{
        total: number;
        available: number;
        occupied: number;
        reserved: number;
        cleaning: number;
    }> {
        const [total, available, occupied, reserved, cleaning] = await Promise.all([
            prisma.table.count({ where: { branchId, isActive: true } }),
            prisma.table.count({ where: { branchId, isActive: true, status: TableStatus.AVAILABLE } }),
            prisma.table.count({ where: { branchId, isActive: true, status: TableStatus.OCCUPIED } }),
            prisma.table.count({ where: { branchId, isActive: true, status: TableStatus.RESERVED } }),
            prisma.table.count({ where: { branchId, isActive: true, status: TableStatus.CLEANING } }),
        ]);

        return { total, available, occupied, reserved, cleaning };
    }
}

export const tableService = new TableService();
