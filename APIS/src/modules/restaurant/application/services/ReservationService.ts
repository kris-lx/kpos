// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Reservation Service
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { reservations, tables } from '@/db/schema/tables';
import { eq, and, gte, lte, inArray, count } from 'drizzle-orm';
import { Reservation, ReservationStatus, TableStatus } from '../../domain/entities';

export interface CreateReservationDTO {
    branchId: string;
    tableId?: string;
    memberId?: string;
    customerName: string;
    phone: string;
    email?: string;
    guestCount: number;
    date: Date | string;
    time: string;
    duration?: number;
    note?: string;
}

export interface UpdateReservationDTO {
    tableId?: string;
    customerName?: string;
    phone?: string;
    email?: string;
    guestCount?: number;
    date?: Date | string;
    time?: string;
    duration?: number;
    status?: ReservationStatus;
    note?: string;
}

export interface ReservationFilters {
    branchId?: string;
    tableId?: string;
    status?: ReservationStatus;
    date?: Date | string;
    page?: number;
    limit?: number;
    tenantId?: string;
}

export class ReservationService {
    async findAll(filters: ReservationFilters = {}): Promise<{ data: Reservation[]; total: number }> {
        const page = filters.page || 1;
        const limit = filters.limit || 50;
        const skip = (page - 1) * limit;

        const conds: any[] = [];
        if (filters.tenantId) conds.push(eq(reservations.tenantId, filters.tenantId));
        if (filters.branchId) conds.push(eq(reservations.branchId, filters.branchId));
        if (filters.tableId) conds.push(eq(reservations.tableId, filters.tableId));
        if (filters.status) conds.push(eq(reservations.status, filters.status));
        if (filters.date) {
            const dateStart = new Date(filters.date); dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(filters.date); dateEnd.setHours(23, 59, 59, 999);
            conds.push(gte(reservations.date, dateStart), lte(reservations.date, dateEnd));
        }
        const where = conds.length > 0 ? and(...conds) : undefined;

        const [rows, [{ value: total }]] = await Promise.all([
            db.query.reservations.findMany({ where, offset: skip, limit, orderBy: (r, { asc }) => [asc(r.date), asc(r.time)] }),
            db.select({ value: count() }).from(reservations).where(where),
        ]);

        return {
            data: rows.map(r => new Reservation(r as any)),
            total,
        };
    }

    async findById(id: string, tenantId?: string): Promise<Reservation | null> {
        const conds: any[] = [eq(reservations.id, id)];
        if (tenantId) conds.push(eq(reservations.tenantId, tenantId));
        const reservation = await db.query.reservations.findFirst({ where: and(...conds) });
        if (!reservation) return null;
        return new Reservation(reservation as any);
    }

    async create(data: CreateReservationDTO): Promise<Reservation> {
        const [reservation] = await db.insert(reservations).values({
            tenantId: (data as any).tenantId || undefined,
            branchId: data.branchId, tableId: data.tableId, memberId: data.memberId,
            customerName: data.customerName, phone: data.phone, email: data.email,
            guestCount: data.guestCount, date: new Date(data.date), time: data.time,
            duration: data.duration || 120, note: data.note, status: ReservationStatus.PENDING,
        }).returning();

        return new Reservation(reservation as any);
    }

    async update(id: string, data: UpdateReservationDTO, tenantId?: string): Promise<Reservation> {
        const updateData: Record<string, unknown> = { ...data };
        if (data.date) updateData.date = new Date(data.date);
        delete updateData.tenantId;

        const updConds: any[] = [eq(reservations.id, id)];
        if (tenantId) updConds.push(eq(reservations.tenantId, tenantId));
        const [reservation] = await db.update(reservations).set(updateData).where(and(...updConds)).returning();

        if (data.status === ReservationStatus.CONFIRMED && reservation.tableId) {
            await db.update(tables).set({ status: TableStatus.RESERVED }).where(eq(tables.id, reservation.tableId));
        }
        if (data.status === ReservationStatus.SEATED && reservation.tableId) {
            await db.update(tables).set({ status: TableStatus.OCCUPIED }).where(eq(tables.id, reservation.tableId));
        }
        if ((data.status === ReservationStatus.CANCELLED || data.status === ReservationStatus.COMPLETED) && reservation.tableId) {
            await db.update(tables).set({ status: TableStatus.AVAILABLE }).where(eq(tables.id, reservation.tableId));
        }

        return new Reservation(reservation as any);
    }

    async delete(id: string, tenantId?: string): Promise<void> {
        const conds: any[] = [eq(reservations.id, id)];
        if (tenantId) conds.push(eq(reservations.tenantId, tenantId));
        const reservation = await db.query.reservations.findFirst({ where: and(...conds) });

        if (reservation?.tableId && reservation.status === ReservationStatus.CONFIRMED) {
            await db.update(tables).set({ status: TableStatus.AVAILABLE }).where(eq(tables.id, reservation.tableId));
        }

        await db.delete(reservations).where(and(...conds));
    }

    async getStats(branchId: string, date?: Date, tenantId?: string): Promise<{
        total: number;
        pending: number;
        confirmed: number;
        seated: number;
        completed: number;
        cancelled: number;
        totalGuests: number;
    }> {
        const targetDate = date || new Date();
        const dateStart = new Date(targetDate);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(targetDate);
        dateEnd.setHours(23, 59, 59, 999);

        const baseConds: any[] = [eq(reservations.branchId, branchId), gte(reservations.date, dateStart), lte(reservations.date, dateEnd)];
        if (tenantId) baseConds.push(eq(reservations.tenantId, tenantId));
        const base = and(...baseConds);

        const [[{ value: total }], [{ value: pending }], [{ value: confirmed }], [{ value: seated }], [{ value: completed }], [{ value: cancelled }], guestRows] = await Promise.all([
            db.select({ value: count() }).from(reservations).where(base),
            db.select({ value: count() }).from(reservations).where(and(base, eq(reservations.status, ReservationStatus.PENDING))),
            db.select({ value: count() }).from(reservations).where(and(base, eq(reservations.status, ReservationStatus.CONFIRMED))),
            db.select({ value: count() }).from(reservations).where(and(base, eq(reservations.status, ReservationStatus.SEATED))),
            db.select({ value: count() }).from(reservations).where(and(base, eq(reservations.status, ReservationStatus.COMPLETED))),
            db.select({ value: count() }).from(reservations).where(and(base, eq(reservations.status, ReservationStatus.CANCELLED))),
            db.query.reservations.findMany({
                where: and(base, inArray(reservations.status, [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED])),
                columns: { guestCount: true },
            }),
        ]);

        const totalGuests = guestRows.reduce((sum: number, r: any) => sum + r.guestCount, 0);

        return { total, pending, confirmed, seated, completed, cancelled, totalGuests };
    }
}

export const reservationService = new ReservationService();
