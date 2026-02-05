// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Result Pattern
// ═══════════════════════════════════════════════════════════════════════════

export class Result<T, E = Error> {
    private readonly _isSuccess: boolean;
    private readonly _value?: T;
    private readonly _error?: E;

    private constructor(isSuccess: boolean, value?: T, error?: E) {
        this._isSuccess = isSuccess;
        this._value = value;
        this._error = error;
    }

    get isSuccess(): boolean {
        return this._isSuccess;
    }

    get isFailure(): boolean {
        return !this._isSuccess;
    }

    get value(): T {
        if (!this._isSuccess) {
            throw new Error('Cannot get value from a failed result');
        }
        return this._value as T;
    }

    get error(): E {
        if (this._isSuccess) {
            throw new Error('Cannot get error from a successful result');
        }
        return this._error as E;
    }

    public static ok<T>(value: T): Result<T, never> {
        return new Result<T, never>(true, value);
    }

    public static fail<E>(error: E): Result<never, E> {
        return new Result<never, E>(false, undefined as never, error);
    }

    public static combine(results: Result<unknown>[]): Result<unknown> {
        for (const result of results) {
            if (result.isFailure) {
                return result;
            }
        }
        return Result.ok(undefined);
    }
}
