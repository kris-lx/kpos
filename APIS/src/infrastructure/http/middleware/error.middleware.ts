// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Error Handling Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { DatabaseConnectionError, isPrismaConnectionError } from '@/shared/domain/errors';

export interface AppError extends Error {
    statusCode?: number;
    code?: string;
    details?: unknown;
}

export class ApiError extends Error implements AppError {
    constructor(
        message: string,
        public statusCode: number = 400,
        public code: string = 'BAD_REQUEST',
        public details?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
        Error.captureStackTrace(this, this.constructor);
    }

    static badRequest(message: string, details?: unknown): ApiError {
        return new ApiError(message, 400, 'BAD_REQUEST', details);
    }

    static unauthorized(message = 'Unauthorized'): ApiError {
        return new ApiError(message, 401, 'AUTH_001');
    }

    static forbidden(message = 'Forbidden'): ApiError {
        return new ApiError(message, 403, 'AUTH_003');
    }

    static notFound(message = 'Resource not found'): ApiError {
        return new ApiError(message, 404, 'RES_001');
    }

    static conflict(message: string): ApiError {
        return new ApiError(message, 409, 'CONFLICT');
    }

    static internal(message = 'Internal server error'): ApiError {
        return new ApiError(message, 500, 'SYS_001');
    }
}

export function notFoundHandler(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    res.status(404).json({
        success: false,
        error: {
            code: 'RES_001',
            message: `Route ${req.method} ${req.path} not found`,
        },
    });
}

export function errorHandler(
    err: AppError,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    console.error('Error:', err);

    // Zod validation error
    if (err instanceof ZodError) {
        res.status(400).json({
            success: false,
            error: {
                code: 'VAL_001',
                message: 'Validation error',
                details: err.errors.map((e) => ({
                    path: e.path.join('.'),
                    message: e.message,
                })),
            },
        });
        return;
    }

    // Database connection error
    if (err instanceof DatabaseConnectionError || isPrismaConnectionError(err)) {
        res.status(503).json({
            success: false,
            error: {
                code: 'DB_001',
                message: 'Database is not available. Please ensure MongoDB is running.',
            },
        });
        return;
    }

    // API Error
    if (err instanceof ApiError) {
        res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details,
            },
        });
        return;
    }

    // Default error
    const statusCode = err.statusCode ?? 500;
    // Hide internal error details in production
    const isProd = process.env.NODE_ENV === 'production';
    const message = isProd && statusCode >= 500 ? 'Internal server error' : (err.message || 'Internal server error');

    res.status(statusCode).json({
        success: false,
        error: {
            code: err.code ?? 'SYS_001',
            message,
            // Include stack in development
            ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
        },
    });
}
