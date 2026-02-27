// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Table Service
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { tables } from '@/db/schema/tables';
import { eq, and, count } from 'drizzle-orm';
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
        const conds: any[] = [eq(tables.isActive, true)];
        if (filters.branchId) conds.push(eq(tables.branchId, filters.branchId));
        if (filters.status) conds.push(eq(tables.status, filters.status));
        if (filters.isActive !== undefined) conds[0] = eq(tables.isActive, filters.isActive);

        const rows = await db.query.tables.findMany({ where: and(...conds), orderBy: (t, { asc }) => asc(t.name) });
        return rows.map(t => new Table(t as any));
    }

    async findById(id: string): Promise<Table | null> {
        const table = await db.query.tables.findFirst({
            where: eq(tables.id, id),
            with: { orders: { with: { items: true } } },
        });

        if (!table) return null;
        return new Table(table as any);
    }

    async create(data: CreateTableDTO): Promise<Table> {
        const [table] = await db.insert(tables).values({
            name: data.name, branchId: data.branchId, areaId: data.areaId,
            capacity: data.capacity || 4, status: data.status || TableStatus.AVAILABLE,
            posX: data.posX || 0, posY: data.posY || 0, shape: data.shape || TableShape.SQUARE,
        }).returning();

        return new Table(table as any);
    }

    async update(id: string, data: UpdateTableDTO): Promise<Table> {
        const [table] = await db.update(tables).set(data).where(eq(tables.id, id)).returning();
        return new Table(table as any);
    }

    async updateStatus(id: string, status: TableStatus): Promise<Table> {
        const [table] = await db.update(tables).set({ status }).where(eq(tables.id, id)).returning();
        return new Table(table as any);
    }

    async delete(id: string): Promise<void> {
        await db.update(tables).set({ isActive: false }).where(eq(tables.id, id));
    }

    async getStats(branchId: string): Promise<{
        total: number;
        available: number;
        occupied: number;
        reserved: number;
        cleaning: number;
    }> {
        const base = and(eq(tables.branchId, branchId), eq(tables.isActive, true));
        const [[{ value: total }], [{ value: available }], [{ value: occupied }], [{ value: reserved }], [{ value: cleaning }]] = await Promise.all([
            db.select({ value: count() }).from(tables).where(base),
            db.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.AVAILABLE))),
            db.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.OCCUPIED))),
            db.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.RESERVED))),
            db.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.CLEANING))),
        ]);

        return { total, available, occupied, reserved, cleaning };
    }
}

export const tableService = new TableService();
