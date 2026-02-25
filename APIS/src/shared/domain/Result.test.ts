import { describe, it, expect } from 'vitest';
import { Result } from './Result';

describe('Result', () => {
    describe('ok()', () => {
        it('isSuccess is true', () => {
            const r = Result.ok(42);
            expect(r.isSuccess).toBe(true);
            expect(r.isFailure).toBe(false);
        });

        it('returns the value', () => {
            const r = Result.ok({ id: '1', name: 'test' });
            expect(r.value).toEqual({ id: '1', name: 'test' });
        });

        it('throws when accessing error on success', () => {
            const r = Result.ok('data');
            expect(() => r.error).toThrow('Cannot get error from a successful result');
        });
    });

    describe('fail()', () => {
        it('isFailure is true', () => {
            const r = Result.fail(new Error('oops'));
            expect(r.isFailure).toBe(true);
            expect(r.isSuccess).toBe(false);
        });

        it('returns the error', () => {
            const err = new Error('db error');
            const r = Result.fail(err);
            expect(r.error).toBe(err);
        });

        it('throws when accessing value on failure', () => {
            const r = Result.fail('bad');
            expect(() => r.value).toThrow('Cannot get value from a failed result');
        });
    });

    describe('combine()', () => {
        it('returns ok when all succeed', () => {
            const results = [Result.ok(1), Result.ok(2), Result.ok(3)];
            const combined = Result.combine(results);
            expect(combined.isSuccess).toBe(true);
        });

        it('returns first failure', () => {
            const err = new Error('first fail');
            const results = [Result.ok(1), Result.fail(err), Result.ok(3)];
            const combined = Result.combine(results);
            expect(combined.isFailure).toBe(true);
            expect(combined.error).toBe(err);
        });

        it('returns ok for empty array', () => {
            expect(Result.combine([]).isSuccess).toBe(true);
        });
    });
});
