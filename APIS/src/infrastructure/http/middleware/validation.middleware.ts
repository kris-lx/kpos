// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Validation Middleware
// ═══════════════════════════════════════════════════════════════════════════

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

type ValidationTarget = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            const data = schema.parse(req[target]);
            req[target] = data;
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                next(error);
            } else {
                next(error);
            }
        }
    };
}

export function validateBody(schema: ZodSchema) {
    return validate(schema, 'body');
}

export function validateQuery(schema: ZodSchema) {
    return validate(schema, 'query');
}

export function validateParams(schema: ZodSchema) {
    return validate(schema, 'params');
}
