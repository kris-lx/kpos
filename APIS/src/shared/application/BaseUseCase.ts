// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Base Use Case
// ═══════════════════════════════════════════════════════════════════════════

import type { Result } from '../domain/Result';

export interface IUseCase<TRequest, TResponse> {
    execute(request: TRequest): Promise<Result<TResponse>>;
}

// Alias for backward compatibility
export type UseCase<TRequest, TResponse> = IUseCase<TRequest, TResponse>;

export abstract class BaseUseCase<TRequest, TResponse>
    implements IUseCase<TRequest, TResponse> {
    abstract execute(request: TRequest): Promise<Result<TResponse>>;
}
