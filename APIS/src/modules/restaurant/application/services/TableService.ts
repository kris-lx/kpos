// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Table Service
// ═══════════════════════════════════════════════════════════════════════════

import { tables } from '@/db/schema/tables';
import { eq, and, count } from 'drizzle-orm';
import { Table, TableStatus, TableShape } from '../../domain/entities';
import { runWithTenantOrBypassContext } from '@/shared/tenant-context';

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
    tenantId?: string;
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
    tenantId?: string;
}

export class TableService {
    // Every method runs its query inside runWithTenantOrBypassContext —
    // `tables` has FORCE ROW LEVEL SECURITY requiring `app.current_tenant_id`
    // to be set on the exact connection running the query. This class used
    // to query the plain pooled `db` handle directly (no GUC ever set), so
    // every read here silently returned zero rows and every write with a
    // real tenantId threw 42501 insufficient_privilege. Same root cause as
    // the OrderService fix — found via the same scale/feature retest.

    async findAll(filters: TableFilters = {}): Promise<Table[]> {
        return runWithTenantOrBypassContext(filters.tenantId, async (tx) => {
            const conds: any[] = [eq(tables.isActive, true)];
            if (filters.tenantId) conds.push(eq(tables.tenantId, filters.tenantId));
            if (filters.branchId) conds.push(eq(tables.branchId, filters.branchId));
            if (filters.status) conds.push(eq(tables.status, filters.status));
            if (filters.isActive !== undefined) conds[0] = eq(tables.isActive, filters.isActive);

            // Table count per branch is naturally small in practice, but cap
            // defensively anyway (same reasoning as the orders/branches list
            // caps added after the unbounded-findMany bugs found via scale
            // testing) rather than assuming it always stays that way.
            const rows = await tx.query.tables.findMany({ where: and(...conds), orderBy: (t, { asc }) => asc(t.name), limit: 1000 });
            return rows.map(t => new Table(t as any));
        });
    }

    async findById(id: string, tenantId?: string): Promise<Table | null> {
        return runWithTenantOrBypassContext(tenantId, async (tx) => {
            const conds: any[] = [eq(tables.id, id)];
            if (tenantId) conds.push(eq(tables.tenantId, tenantId));
            const table = await tx.query.tables.findFirst({
                where: and(...conds),
                with: { orders: { with: { items: true } } },
            });

            if (!table) return null;
            return new Table(table as any);
        });
    }

    async create(data: CreateTableDTO): Promise<Table> {
        return runWithTenantOrBypassContext(data.tenantId, async (tx) => {
            const [table] = await tx.insert(tables).values({
                tenantId: data.tenantId || undefined,
                name: data.name, branchId: data.branchId, areaId: data.areaId,
                capacity: data.capacity || 4, status: data.status || TableStatus.AVAILABLE,
                posX: data.posX || 0, posY: data.posY || 0, shape: data.shape || TableShape.SQUARE,
            }).returning();

            return new Table(table as any);
        });
    }

    async update(id: string, data: UpdateTableDTO, tenantId?: string): Promise<Table> {
        return runWithTenantOrBypassContext(tenantId, async (tx) => {
            const conds: any[] = [eq(tables.id, id)];
            if (tenantId) conds.push(eq(tables.tenantId, tenantId));
            const [table] = await tx.update(tables).set(data).where(and(...conds)).returning();
            return new Table(table as any);
        });
    }

    async updateStatus(id: string, status: TableStatus, tenantId?: string): Promise<Table> {
        return runWithTenantOrBypassContext(tenantId, async (tx) => {
            const conds: any[] = [eq(tables.id, id)];
            if (tenantId) conds.push(eq(tables.tenantId, tenantId));
            const [table] = await tx.update(tables).set({ status }).where(and(...conds)).returning();
            return new Table(table as any);
        });
    }

    async delete(id: string, tenantId?: string): Promise<void> {
        await runWithTenantOrBypassContext(tenantId, async (tx) => {
            const conds: any[] = [eq(tables.id, id)];
            if (tenantId) conds.push(eq(tables.tenantId, tenantId));
            await tx.update(tables).set({ isActive: false }).where(and(...conds));
        });
    }

    async getStats(branchId: string, tenantId?: string): Promise<{
        total: number;
        available: number;
        occupied: number;
        reserved: number;
        cleaning: number;
    }> {
        return runWithTenantOrBypassContext(tenantId, async (tx) => {
            const baseConds: any[] = [eq(tables.branchId, branchId), eq(tables.isActive, true)];
            if (tenantId) baseConds.push(eq(tables.tenantId, tenantId));
            const base = and(...baseConds);
            const [[{ value: total }], [{ value: available }], [{ value: occupied }], [{ value: reserved }], [{ value: cleaning }]] = await Promise.all([
                tx.select({ value: count() }).from(tables).where(base),
                tx.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.AVAILABLE))),
                tx.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.OCCUPIED))),
                tx.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.RESERVED))),
                tx.select({ value: count() }).from(tables).where(and(base, eq(tables.status, TableStatus.CLEANING))),
            ]);

            return { total, available, occupied, reserved, cleaning };
        });
    }
}

export const tableService = new TableService();
