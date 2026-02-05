// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Aggregate Root (DDD)
// ═══════════════════════════════════════════════════════════════════════════

import { Entity } from './Entity';
import type { DomainEvent } from './DomainEvent';

export abstract class AggregateRoot<T> extends Entity<T> {
    private _domainEvents: DomainEvent[] = [];

    get domainEvents(): DomainEvent[] {
        return this._domainEvents;
    }

    protected addDomainEvent(event: DomainEvent): void {
        this._domainEvents.push(event);
    }

    public clearEvents(): void {
        this._domainEvents = [];
    }
}
