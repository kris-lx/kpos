// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Domain Event (DDD)
// ═══════════════════════════════════════════════════════════════════════════

import { v4 as uuidv4 } from 'uuid';

export interface DomainEvent {
    eventId: string;
    eventName: string;
    aggregateId: string;
    occurredOn: Date;
    payload: unknown;
}

export abstract class BaseDomainEvent implements DomainEvent {
    public readonly eventId: string;
    public readonly occurredOn: Date;

    constructor(
        public readonly eventName: string,
        public readonly aggregateId: string,
        public readonly payload: unknown
    ) {
        this.eventId = uuidv4();
        this.occurredOn = new Date();
    }
}
