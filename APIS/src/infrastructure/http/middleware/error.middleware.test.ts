import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ApiError, errorHandler, notFoundHandler } from './error.middleware';
import { ZodError, z } from 'zod';

// ── Helpers ──────────────────────────────────────────────────────────────────

function mockRes() {
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
}

function mockReq(overrides: Partial<Request> = {}): Request {
    return { method: 'GET', path: '/test', ...overrides } as Request;
}

const next: NextFunction = vi.fn();

// ── ApiError class ────────────────────────────────────────────────────────────

describe('ApiError', () => {
    it('creates with default statusCode 400', () => {
        const err = new ApiError('bad input');
        expect(err.statusCode).toBe(400);
        expect(err.code).toBe('BAD_REQUEST');
        expect(err.message).toBe('bad input');
    });

    it('creates via static helpers', () => {
        expect(ApiError.unauthorized().statusCode).toBe(401);
        expect(ApiError.forbidden().statusCode).toBe(403);
        expect(ApiError.notFound().statusCode).toBe(404);
        expect(ApiError.conflict('dup').statusCode).toBe(409);
        expect(ApiError.internal().statusCode).toBe(500);
    });

    it('static badRequest carries details', () => {
        const err = ApiError.badRequest('oops', { field: 'name' });
        expect(err.details).toEqual({ field: 'name' });
        expect(err.code).toBe('BAD_REQUEST');
    });
});

// ── notFoundHandler ───────────────────────────────────────────────────────────

describe('notFoundHandler', () => {
    it('returns 404 with RES_001 code', () => {
        const req = mockReq({ method: 'POST', path: '/missing' });
        const res = mockRes();
        notFoundHandler(req, res, next);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                success: false,
                error: expect.objectContaining({ code: 'RES_001' }),
            })
        );
    });
});

// ── errorHandler ──────────────────────────────────────────────────────────────

describe('errorHandler', () => {
    const req = mockReq();

    beforeEach(() => {
        vi.stubEnv('NODE_ENV', 'test');
    });

    it('handles ZodError → 400 VAL_001', () => {
        const zodErr = z.object({ name: z.string() }).safeParse({ name: 123 });
        const res = mockRes();
        errorHandler(zodErr.error as ZodError, req, res, next);
        expect(res.status).toHaveBeenCalledWith(400);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.success).toBe(false);
        expect(body.error.code).toBe('VAL_001');
        expect(body.error.details).toBeInstanceOf(Array);
    });

    it('handles ApiError with correct statusCode', () => {
        const err = ApiError.notFound('Item not found');
        const res = mockRes();
        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(404);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.error.code).toBe('RES_001');
        expect(body.error.message).toBe('Item not found');
    });

    it('handles generic Error with 500', () => {
        const err = new Error('boom') as any;
        const res = mockRes();
        errorHandler(err, req, res, next);
        expect(res.status).toHaveBeenCalledWith(500);
    });

    it('sanitizes 5xx message in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const err = new Error('secret db details') as any;
        err.statusCode = 500;
        const res = mockRes();
        errorHandler(err, req, res, next);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.error.message).toBe('Internal server error');
        expect(body.error.message).not.toContain('secret');
    });

    it('returns actual message for 4xx in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const err = ApiError.badRequest('invalid email');
        const res = mockRes();
        errorHandler(err, req, res, next);
        const body = (res.json as any).mock.calls[0][0];
        expect(body.error.message).toBe('invalid email');
    });
});
