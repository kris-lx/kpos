// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Cash Management Service
// Manages cash register operations: open/close shifts, cash movements
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { shifts, cashRegisters, cashMovements } from '@/db/schema/tables';
import { eq, and, isNull, desc } from 'drizzle-orm';

export interface OpenShiftDTO {
    userId: string;
    branchId: string;
    storeId?: string;
    registerId?: string;
    openingBalance: number;
}

export interface CloseShiftDTO {
    shiftId: string;
    userId: string;
    closingBalance: number;
    notes?: string;
}

export interface CashMovementDTO {
    shiftId: string;
    userId: string;
    type: 'CASH_IN' | 'CASH_OUT' | 'SALE' | 'REFUND' | 'EXPENSE' | 'DEPOSIT';
    amount: number;
    reason?: string;
}

function generateShiftNo(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `SH-${date}-${rand}`;
}

class CashService {
    async openShift(dto: OpenShiftDTO): Promise<any> {
        // Check for existing open shift
        const existing = await db.query.shifts.findFirst({
            where: and(
                eq(shifts.userId, dto.userId),
                eq(shifts.branchId, dto.branchId),
                isNull(shifts.closedAt)
            ),
        });

        if (existing) {
            throw new Error('You already have an open shift. Close it before opening a new one.');
        }

        const [shift] = await db.insert(shifts).values({
            shiftNo: generateShiftNo(),
            userId: dto.userId,
            branchId: dto.branchId,
            storeId: dto.storeId || null,
            registerId: dto.registerId || null,
            openingBalance: dto.openingBalance,
            expectedBalance: dto.openingBalance,
            status: 'OPEN',
        }).returning();

        return shift;
    }

    async closeShift(dto: CloseShiftDTO): Promise<any> {
        const shift = await db.query.shifts.findFirst({
            where: and(eq(shifts.id, dto.shiftId), eq(shifts.userId, dto.userId)),
        });

        if (!shift) throw new Error('Shift not found');
        if (shift.closedAt) throw new Error('Shift is already closed');

        const difference = dto.closingBalance - (shift.expectedBalance || 0);

        const [updated] = await db.update(shifts).set({
            closingBalance: dto.closingBalance,
            difference,
            closedAt: new Date(),
            status: 'CLOSED',
            notes: dto.notes || null,
        }).where(eq(shifts.id, dto.shiftId)).returning();

        return updated;
    }

    async addCashMovement(dto: CashMovementDTO): Promise<any> {
        const shift = await db.query.shifts.findFirst({
            where: and(eq(shifts.id, dto.shiftId), isNull(shifts.closedAt)),
        });

        if (!shift) throw new Error('No open shift found');

        const [movement] = await db.insert(cashMovements).values({
            shiftId: dto.shiftId,
            userId: dto.userId,
            type: dto.type,
            amount: dto.amount,
            reason: dto.reason || null,
        }).returning();

        // Update expected balance on shift
        const delta = ['CASH_IN', 'SALE', 'DEPOSIT'].includes(dto.type) ? dto.amount : -dto.amount;
        const newExpected = (shift.expectedBalance || 0) + delta;

        await db.update(shifts).set({
            expectedBalance: newExpected,
        }).where(eq(shifts.id, dto.shiftId));

        return movement;
    }

    async getActiveShift(userId: string, branchId: string): Promise<any> {
        return db.query.shifts.findFirst({
            where: and(
                eq(shifts.userId, userId),
                eq(shifts.branchId, branchId),
                isNull(shifts.closedAt)
            ),
        });
    }

    async getShiftSummary(shiftId: string): Promise<any> {
        const shift = await db.query.shifts.findFirst({
            where: eq(shifts.id, shiftId),
        });

        if (!shift) throw new Error('Shift not found');

        const movements = await db.query.cashMovements.findMany({
            where: eq(cashMovements.shiftId, shiftId),
            orderBy: desc(cashMovements.createdAt),
        });

        const totalIn = movements
            .filter(m => ['CASH_IN', 'SALE', 'DEPOSIT'].includes(m.type))
            .reduce((acc, m) => acc + (m.amount || 0), 0);

        const totalOut = movements
            .filter(m => ['CASH_OUT', 'REFUND', 'EXPENSE'].includes(m.type))
            .reduce((acc, m) => acc + (m.amount || 0), 0);

        return {
            shift,
            movements,
            summary: {
                totalIn,
                totalOut,
                netCash: totalIn - totalOut,
                expectedBalance: (shift.openingBalance || 0) + totalIn - totalOut,
                transactionCount: movements.length,
            },
        };
    }

    async getCashRegisters(branchId: string): Promise<any[]> {
        return db.query.cashRegisters.findMany({
            where: and(eq(cashRegisters.branchId, branchId), eq(cashRegisters.isActive, true)),
        });
    }
}

export const cashService = new CashService();
