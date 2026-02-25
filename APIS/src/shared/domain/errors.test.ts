import { describe, it, expect } from 'vitest';
import { DatabaseConnectionError, isPrismaConnectionError } from './errors';

describe('DatabaseConnectionError', () => {
    it('has correct name and default message', () => {
        const err = new DatabaseConnectionError();
        expect(err.name).toBe('DatabaseConnectionError');
        expect(err.message).toBe('Database is not available');
    });

    it('accepts custom message', () => {
        const err = new DatabaseConnectionError('MongoDB unreachable');
        expect(err.message).toBe('MongoDB unreachable');
    });

    it('is instanceof Error', () => {
        expect(new DatabaseConnectionError()).toBeInstanceOf(Error);
    });
});

describe('isPrismaConnectionError', () => {
    const cases = [
        'server selection timeout',
        'connection refused',
        'no available servers',
        'socket not connected',
        'econnrefused',
        'replicasetnoprimary',
    ];

    cases.forEach((msg) => {
        it(`detects "${msg}"`, () => {
            expect(isPrismaConnectionError(new Error(msg))).toBe(true);
        });
    });

    it('returns false for unrelated errors', () => {
        expect(isPrismaConnectionError(new Error('validation failed'))).toBe(false);
        expect(isPrismaConnectionError(new Error('not found'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
        expect(isPrismaConnectionError('string error')).toBe(false);
        expect(isPrismaConnectionError(null)).toBe(false);
        expect(isPrismaConnectionError(undefined)).toBe(false);
        expect(isPrismaConnectionError(42)).toBe(false);
    });
});
