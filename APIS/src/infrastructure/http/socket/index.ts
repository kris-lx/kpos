// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Socket.IO Handlers
// ═══════════════════════════════════════════════════════════════════════════

import type { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '@/config/app.config';
import { logger } from '../middleware/logger.middleware';

interface AuthenticatedSocket extends Socket {
    userId?: string;
    branchId?: string;
}

export function setupSocketHandlers(io: Server): void {
    // Authentication middleware
    io.use((socket: AuthenticatedSocket, next) => {
        const token = socket.handshake.auth.token;

        if (!token) {
            return next(new Error('Authentication required'));
        }

        try {
            const decoded = jwt.verify(token, jwtConfig.secret) as {
                userId: string;
                branchId: string;
            };
            socket.userId = decoded.userId;
            socket.branchId = decoded.branchId;
            next();
        } catch (err) {
            next(new Error('Invalid token'));
        }
    });

    io.on('connection', (socket: AuthenticatedSocket) => {
        logger.info(`Socket connected: ${socket.id} (User: ${socket.userId})`);

        // Join branch room
        if (socket.branchId) {
            socket.join(`branch:${socket.branchId}`);
        }

        // Handle sale events
        socket.on('sale:created', (data) => {
            io.to(`branch:${socket.branchId}`).emit('sale:new', data);
        });

        // Handle inventory updates
        socket.on('inventory:updated', (data) => {
            io.to(`branch:${socket.branchId}`).emit('inventory:change', data);
        });

        // Handle order updates (restaurant mode)
        socket.on('order:status', (data) => {
            io.to(`branch:${socket.branchId}`).emit('order:update', data);
        });

        // Handle table status updates
        socket.on('table:status', (data) => {
            io.to(`branch:${socket.branchId}`).emit('table:update', data);
        });

        socket.on('disconnect', () => {
            logger.info(`Socket disconnected: ${socket.id}`);
        });
    });
}

// Event emitter for server-side events
export class SocketEventEmitter {
    private static io: Server;

    static setIO(io: Server): void {
        this.io = io;
    }

    static emitToBranch(branchId: string, event: string, data: unknown): void {
        if (this.io) {
            this.io.to(`branch:${branchId}`).emit(event, data);
        }
    }

    static emitToAll(event: string, data: unknown): void {
        if (this.io) {
            this.io.emit(event, data);
        }
    }
}
