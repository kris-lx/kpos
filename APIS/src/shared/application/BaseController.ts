// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Base Controller
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
    };
}

export abstract class BaseController {
    protected ok<T>(res: Response, data: T): Response {
        return this.success(res, data, 200);
    }

    protected success<T>(res: Response, data: T, statusCode = 200): Response {
        const response: ApiResponse<T> = {
            success: true,
            data,
        };
        return res.status(statusCode).json(response);
    }

    protected created<T>(res: Response, data: T): Response {
        return this.success(res, data, 201);
    }

    protected paginated<T>(
        res: Response,
        data: T[],
        meta: { page: number; limit: number; total: number }
    ): Response {
        const response: ApiResponse<T[]> = {
            success: true,
            data,
            meta: {
                ...meta,
                totalPages: Math.ceil(meta.total / meta.limit),
            },
        };
        return res.status(200).json(response);
    }

    protected fail(
        res: Response,
        code: string,
        message: string,
        statusCode = 400,
        details?: unknown
    ): Response {
        const response: ApiResponse<never> = {
            success: false,
            error: { code, message, details },
        };
        return res.status(statusCode).json(response);
    }

    protected notFound(res: Response, message = 'Resource not found'): Response {
        return this.fail(res, 'RES_001', message, 404);
    }

    protected unauthorized(res: Response, message = 'Unauthorized'): Response {
        return this.fail(res, 'AUTH_001', message, 401);
    }

    protected forbidden(res: Response, message = 'Forbidden'): Response {
        return this.fail(res, 'AUTH_003', message, 403);
    }

    protected validationError(res: Response, details: unknown): Response {
        return this.fail(res, 'VAL_001', 'Validation error', 400, details);
    }

    protected serverError(res: Response, error: Error): Response {
        console.error('Server error:', error);
        return this.fail(res, 'SYS_001', 'Internal server error', 500);
    }
}
