// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Zod Validation Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validate request body against a Zod schema.
 * On success, replaces req.body with the parsed (and stripped) data.
 * On failure, returns 400 with structured validation errors.
 *
 * Usage:
 *   router.post('/products', authenticate, validateBody(insertProductSchema), async (req, res) => { ... })
 */
export function validateBody(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            next(result.error); // ZodError is handled by the global errorHandler
            return;
        }
        req.body = result.data;
        next();
    };
}

/**
 * Validate request query parameters against a Zod schema.
 * On success, replaces req.query with the parsed data.
 */
export function validateQuery(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.query);
        if (!result.success) {
            next(result.error);
            return;
        }
        req.query = result.data;
        next();
    };
}

/**
 * Validate request params against a Zod schema.
 * On success, replaces req.params with the parsed data.
 */
export function validateParams(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.params);
        if (!result.success) {
            next(result.error);
            return;
        }
        req.params = result.data;
        next();
    };
}
