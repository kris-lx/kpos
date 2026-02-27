// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Notification Service
// Sends notifications via: DB persistence + Socket.IO real-time + RabbitMQ queue
// ═══════════════════════════════════════════════════════════════════════════

import { db } from '@/config/database.config';
import { notifications } from '@/db/schema/tables';
import { eq, and, desc, count } from 'drizzle-orm';
import { publish, QUEUES, isRabbitMQConnected } from '@/config/rabbitmq.config';
import { SocketEventEmitter } from '@/infrastructure/http/socket';

export interface CreateNotificationDTO {
    userId: string;
    type: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
}

export interface NotificationFilters {
    userId: string;
    isRead?: boolean;
    type?: string;
    page?: number;
    limit?: number;
}

class NotificationService {
    async send(dto: CreateNotificationDTO): Promise<void> {
        try {
            // 1. Persist to DB
            const [notification] = await db.insert(notifications).values({
                userId: dto.userId,
                type: dto.type,
                title: dto.title,
                message: dto.message,
                data: dto.data || null,
            }).returning();

            // 2. Push via Socket.IO (real-time)
            SocketEventEmitter.emitToUser(dto.userId, 'notification:new', {
                id: notification.id,
                type: dto.type,
                title: dto.title,
                message: dto.message,
                data: dto.data,
                createdAt: notification.createdAt,
            });
        } catch (error) {
            console.error('[Notification] Failed to send:', error instanceof Error ? error.message : error);
        }
    }

    async sendBulk(dtos: CreateNotificationDTO[]): Promise<void> {
        for (const dto of dtos) {
            await this.send(dto);
        }
    }

    async sendToBranch(branchId: string, type: string, title: string, message: string, data?: Record<string, unknown>): Promise<void> {
        SocketEventEmitter.emitToBranch(branchId, 'notification:broadcast', {
            type, title, message, data, createdAt: new Date(),
        });
    }

    async queue(dto: CreateNotificationDTO): Promise<void> {
        const queued = isRabbitMQConnected() && publish(QUEUES.NOTIFICATION, dto as Record<string, unknown>);
        if (!queued) {
            await this.send(dto);
        }
    }

    async findAll(filters: NotificationFilters): Promise<{ data: any[]; total: number; unread: number }> {
        const page = filters.page || 1;
        const limit = filters.limit || 20;
        const offset = (page - 1) * limit;

        const conds: any[] = [eq(notifications.userId, filters.userId)];
        if (filters.isRead !== undefined) conds.push(eq(notifications.isRead, filters.isRead));
        if (filters.type) conds.push(eq(notifications.type, filters.type));
        const where = and(...conds);

        const [rows, [{ value: total }], [{ value: unread }]] = await Promise.all([
            db.query.notifications.findMany({
                where,
                orderBy: desc(notifications.createdAt),
                offset,
                limit,
            }),
            db.select({ value: count() }).from(notifications).where(where),
            db.select({ value: count() }).from(notifications).where(
                and(eq(notifications.userId, filters.userId), eq(notifications.isRead, false))
            ),
        ]);

        return { data: rows, total, unread };
    }

    async markAsRead(id: string, userId: string): Promise<void> {
        await db.update(notifications)
            .set({ isRead: true, readAt: new Date() })
            .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
    }

    async markAllAsRead(userId: string): Promise<void> {
        await db.update(notifications)
            .set({ isRead: true, readAt: new Date() })
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    }

    async getUnreadCount(userId: string): Promise<number> {
        const [{ value }] = await db.select({ value: count() })
            .from(notifications)
            .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
        return value;
    }
}

export const notificationService = new NotificationService();
