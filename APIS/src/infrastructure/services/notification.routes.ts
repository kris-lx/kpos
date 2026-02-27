// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Notification Routes
// GET  /notifications         — List notifications (paginated)
// GET  /notifications/unread  — Get unread count
// PUT  /notifications/:id/read — Mark single as read
// PUT  /notifications/read-all — Mark all as read
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authenticate } from '@/infrastructure/http/middleware/auth.middleware';
import { notificationService } from './notification.service';
import { validateParamId } from '@/infrastructure/http/middleware/security.middleware';

export const notificationRoutes = Router();

// List user notifications
notificationRoutes.get('/', authenticate, async (req, res, next) => {
    try {
        const userId = req.authUser!.userId;
        const page = Number(req.query.page) || 1;
        const limit = Math.min(Number(req.query.limit) || 20, 100);
        const isRead = req.query.isRead !== undefined ? req.query.isRead === 'true' : undefined;
        const type = req.query.type as string | undefined;

        const result = await notificationService.findAll({ userId, page, limit, isRead, type });

        res.json({
            success: true,
            data: result.data,
            meta: {
                total: result.total,
                unread: result.unread,
                page,
                limit,
                totalPages: Math.ceil(result.total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
});

// Get unread count
notificationRoutes.get('/unread', authenticate, async (req, res, next) => {
    try {
        const count = await notificationService.getUnreadCount(req.authUser!.userId);
        res.json({ success: true, data: { unread: count } });
    } catch (error) {
        next(error);
    }
});

// Mark single notification as read
notificationRoutes.put('/:id/read', authenticate, validateParamId, async (req, res, next) => {
    try {
        await notificationService.markAsRead(req.params.id, req.authUser!.userId);
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        next(error);
    }
});

// Mark all notifications as read
notificationRoutes.put('/read-all', authenticate, async (req, res, next) => {
    try {
        await notificationService.markAllAsRead(req.authUser!.userId);
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        next(error);
    }
});
