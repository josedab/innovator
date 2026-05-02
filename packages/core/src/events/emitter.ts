import { randomUUID } from "node:crypto";
import type { PipelineEvent, EventType } from "./types.js";

type EventListener = (event: PipelineEvent) => void | Promise<void>;

/**
 * In-process event emitter for pipeline events.
 * Supports typed event subscriptions and wildcard listeners.
 */
export class EventBus {
  private listeners = new Map<EventType | "*", Set<EventListener>>();

  /** Subscribe to a specific event type. Returns unsubscribe function. */
  on(eventType: EventType | "*", listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /** Subscribe to an event type for a single occurrence. */
  once(eventType: EventType, listener: EventListener): () => void {
    const wrappedListener: EventListener = (event) => {
      this.listeners.get(eventType)?.delete(wrappedListener);
      return listener(event);
    };
    return this.on(eventType, wrappedListener);
  }

  /** Emit an event to all matching listeners. */
  async emit(
    type: EventType,
    payload: Record<string, unknown>,
    subject?: string,
    sessionId?: string
  ): Promise<PipelineEvent> {
    const event: PipelineEvent = {
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      payload,
      subject,
      sessionId,
    };

    const typeListeners = this.listeners.get(type) ?? new Set();
    const wildcardListeners = this.listeners.get("*") ?? new Set();
    const allListeners = [...typeListeners, ...wildcardListeners];

    await Promise.allSettled(allListeners.map((listener) => Promise.resolve(listener(event))));

    return event;
  }

  /** Remove all listeners. */
  clear(): void {
    this.listeners.clear();
  }

  /** Get count of listeners for a specific event type. */
  listenerCount(eventType?: EventType | "*"): number {
    if (eventType) {
      return this.listeners.get(eventType)?.size ?? 0;
    }
    let total = 0;
    for (const listeners of this.listeners.values()) {
      total += listeners.size;
    }
    return total;
  }
}

/** Global singleton event bus. */
let globalBus: EventBus | null = null;

/** Get or create the global event bus. */
export function getEventBus(): EventBus {
  if (!globalBus) {
    globalBus = new EventBus();
  }
  return globalBus;
}

/** Reset the global event bus. */
export function resetEventBus(): void {
  globalBus?.clear();
  globalBus = null;
}
