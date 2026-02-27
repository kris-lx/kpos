// ═══════════════════════════════════════════════════════════════════════════
// KPOS - Domain Event Bus (DDD)
// In-process event bus for decoupled domain event handling
// ═══════════════════════════════════════════════════════════════════════════

import type { DomainEvent } from './DomainEvent';

type EventHandler = (event: DomainEvent) => Promise<void>;

class DomainEventBus {
    private handlers: Map<string, EventHandler[]> = new Map();

    subscribe(eventName: string, handler: EventHandler): void {
        const existing = this.handlers.get(eventName) || [];
        existing.push(handler);
        this.handlers.set(eventName, existing);
    }

    async publish(event: DomainEvent): Promise<void> {
        const handlers = this.handlers.get(event.eventName) || [];
        await Promise.allSettled(handlers.map((h) => h(event)));
    }

    async publishAll(events: DomainEvent[]): Promise<void> {
        for (const event of events) {
            await this.publish(event);
        }
    }

    clear(eventName?: string): void {
        if (eventName) {
            this.handlers.delete(eventName);
        } else {
            this.handlers.clear();
        }
    }
}

export const eventBus = new DomainEventBus();
