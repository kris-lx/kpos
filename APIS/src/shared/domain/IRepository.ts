// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Repository Interface (DDD)
// Generic repository contract for all aggregate roots
// ═══════════════════════════════════════════════════════════════════════════

export interface PaginationOptions {
    page: number;
    limit: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface IRepository<T> {
    findById(id: string): Promise<T | null>;
    findAll(options?: PaginationOptions): Promise<PaginatedResult<T>>;
    create(entity: Partial<T>): Promise<T>;
    update(id: string, data: Partial<T>): Promise<T>;
    delete(id: string): Promise<void>;
    exists(id: string): Promise<boolean>;
}

export interface IReadRepository<T> {
    findById(id: string): Promise<T | null>;
    findAll(options?: PaginationOptions): Promise<PaginatedResult<T>>;
    exists(id: string): Promise<boolean>;
}

export interface IWriteRepository<T> {
    create(entity: Partial<T>): Promise<T>;
    update(id: string, data: Partial<T>): Promise<T>;
    delete(id: string): Promise<void>;
}
