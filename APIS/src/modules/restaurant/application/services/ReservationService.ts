// ═══════════════════════════════════════════════════════════════════════════
// Restaurant Module - Reservation Service
// ═══════════════════════════════════════════════════════════════════════════

import { prisma } from '@/config/database.config';
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
}

export class ReservationService {
    async findAll(filters: ReservationFilters = {}): Promise<{ data: Reservation[]; total: number }> {
        const page = filters.page || 1;
        const limit = filters.limit || 50;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};
        
        if (filters.branchId) where.branchId = filters.branchId;
        if (filters.tableId) where.tableId = filters.tableId;
        if (filters.status) where.status = filters.status;
        
        if (filters.date) {
            const dateStart = new Date(filters.date);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(filters.date);
            dateEnd.setHours(23, 59, 59, 999);
            where.date = { gte: dateStart, lte: dateEnd };
        }

        const [reservations, total] = await Promise.all([
            prisma.reservation.findMany({
                where,
                skip,
                take: limit,
                orderBy: [{ date: 'asc' }, { time: 'asc' }],
            }),
            prisma.reservation.count({ where }),
        ]);

        return {
            data: reservations.map(r => new Reservation(r as any)),
            total,
        };
    }

    async findById(id: string): Promise<Reservation | null> {
        const reservation = await prisma.reservation.findUnique({
            where: { id },
        });

        if (!reservation) return null;
        return new Reservation(reservation as any);
    }

    async create(data: CreateReservationDTO): Promise<Reservation> {
        const reservation = await prisma.reservation.create({
            data: {
                branchId: data.branchId,
                tableId: data.tableId,
                memberId: data.memberId,
                customerName: data.customerName,
                phone: data.phone,
                email: data.email,
                guestCount: data.guestCount,
                date: new Date(data.date),
                time: data.time,
                duration: data.duration || 120,
                note: data.note,
                status: ReservationStatus.PENDING,
            },
        });

        return new Reservation(reservation as any);
    }

    async update(id: string, data: UpdateReservationDTO): Promise<Reservation> {
        const updateData: Record<string, unknown> = { ...data };
        
        if (data.date) {
            updateData.date = new Date(data.date);
        }

        const reservation = await prisma.reservation.update({
            where: { id },
            data: updateData,
        });

        // Handle table reservation status
        if (data.status === ReservationStatus.CONFIRMED && reservation.tableId) {
            await prisma.table.update({
                where: { id: reservation.tableId },
                data: { status: TableStatus.RESERVED },
            });
        }

        if (data.status === ReservationStatus.SEATED && reservation.tableId) {
            await prisma.table.update({
                where: { id: reservation.tableId },
                data: { status: TableStatus.OCCUPIED },
            });
        }

        if ((data.status === ReservationStatus.CANCELLED || data.status === ReservationStatus.COMPLETED) && reservation.tableId) {
            await prisma.table.update({
                where: { id: reservation.tableId },
                data: { status: TableStatus.AVAILABLE },
            });
        }

        return new Reservation(reservation as any);
    }

    async delete(id: string): Promise<void> {
        const reservation = await prisma.reservation.findUnique({
            where: { id },
        });

        // Release table if reserved
        if (reservation?.tableId && reservation.status === ReservationStatus.CONFIRMED) {
            await prisma.table.update({
                where: { id: reservation.tableId },
                data: { status: TableStatus.AVAILABLE },
            });
        }

        await prisma.reservation.delete({
            where: { id },
        });
    }

    async getStats(branchId: string, date?: Date): Promise<{
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

        const where = { branchId, date: { gte: dateStart, lte: dateEnd } };

        const [total, pending, confirmed, seated, completed, cancelled, reservations] = await Promise.all([
            prisma.reservation.count({ where }),
            prisma.reservation.count({ where: { ...where, status: ReservationStatus.PENDING } }),
            prisma.reservation.count({ where: { ...where, status: ReservationStatus.CONFIRMED } }),
            prisma.reservation.count({ where: { ...where, status: ReservationStatus.SEATED } }),
            prisma.reservation.count({ where: { ...where, status: ReservationStatus.COMPLETED } }),
            prisma.reservation.count({ where: { ...where, status: ReservationStatus.CANCELLED } }),
            prisma.reservation.findMany({
                where: { ...where, status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED, ReservationStatus.SEATED] } },
                select: { guestCount: true },
            }),
        ]);

        const totalGuests = reservations.reduce((sum, r) => sum + r.guestCount, 0);

        return { total, pending, confirmed, seated, completed, cancelled, totalGuests };
    }
}

export const reservationService = new ReservationService();
