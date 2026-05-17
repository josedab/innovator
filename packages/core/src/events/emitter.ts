import { randomUUID } from "node:crypto";
import type { PipelineEvent, EventType } from "./types.js";

type EventListener = (event: PipelineEvent) => void | Promise<void>;

/** Predicate function for filtering events before delivery to a listener. */
export type EventFilter = (event: PipelineEvent) => boolean;

/** Options for subscribing with filtering. */
export interface FilteredSubscriptionOptions {
  /** Only deliver events matching this predicate. */
  filter?: EventFilter;
  /** Only deliver events with a matching subject. */
  subject?: string;
  /** Only deliver events with a matching sessionId. */
  sessionId?: string;
}

/**
 * In-process event emitter for pipeline events.
 * Supports typed event subscriptions, wildcard listeners, predicate-based
 * filtering, and buffered/batched emission for high-frequency events.
 */
export class EventBus {
  private listeners = new Map<EventType | "*", Set<EventListener>>();
  private filteredListeners = new Map<EventListener, EventFilter>();
  private buffer: PipelineEvent[] = [];
  private bufferEnabled = false;
  private flushIntervalId?: ReturnType<typeof setInterval>;

  /** Subscribe to a specific event type. Returns unsubscribe function. */
  on(eventType: EventType | "*", listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);
    return () => {
      this.listeners.get(eventType)?.delete(listener);
      this.filteredListeners.delete(listener);
    };
  }

  /**
   * Subscribe with filtering — only events matching the predicate are delivered.
   *
   * @param eventType - The event type to subscribe to (or "*" for all).
   * @param listener - The listener function.
   * @param options - Filtering options (predicate, subject, sessionId).
   * @returns An unsubscribe function.
   */
  onFiltered(
    eventType: EventType | "*",
    listener: EventListener,
    options: FilteredSubscriptionOptions = {}
  ): () => void {
    const composedFilter = buildComposedFilter(options);
    if (composedFilter) {
      this.filteredListeners.set(listener, composedFilter);
    }
    return this.on(eventType, listener);
  }

  /** Subscribe to an event type for a single occurrence. */
  once(eventType: EventType, listener: EventListener): () => void {
    const wrappedListener: EventListener = (event) => {
      this.listeners.get(eventType)?.delete(wrappedListener);
      this.filteredListeners.delete(wrappedListener);
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

    if (this.bufferEnabled) {
      this.buffer.push(event);
      return event;
    }

    await this.deliverEvent(event);
    return event;
  }

  /**
   * Enable event buffering. Events are accumulated and only delivered
   * when {@link flush} is called or at the configured interval.
   *
   * @param intervalMs - Optional auto-flush interval in milliseconds.
   *                     If omitted, events are only delivered on explicit flush().
   */
  enableBuffering(intervalMs?: number): void {
    this.bufferEnabled = true;
    // Clear any existing flush interval to prevent duplicates
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = undefined;
    }
    if (intervalMs && intervalMs > 0) {
      this.flushIntervalId = setInterval(() => {
        this.flush().catch(() => {});
      }, intervalMs);
    }
  }

  /** Disable buffering and flush any remaining events. */
  async disableBuffering(): Promise<void> {
    this.bufferEnabled = false;
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = undefined;
    }
    await this.flush();
  }

  /**
   * Flush all buffered events to listeners. Returns the number of events delivered.
   */
  async flush(): Promise<number> {
    const events = this.buffer.splice(0);
    for (const event of events) {
      await this.deliverEvent(event);
    }
    return events.length;
  }

  /** Number of events currently in the buffer. */
  get bufferedCount(): number {
    return this.buffer.length;
  }

  /** Remove all listeners. */
  clear(): void {
    this.listeners.clear();
    this.filteredListeners.clear();
    this.buffer.length = 0;
    if (this.flushIntervalId) {
      clearInterval(this.flushIntervalId);
      this.flushIntervalId = undefined;
    }
    this.bufferEnabled = false;
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

  /** Deliver a single event to all matching listeners, respecting filters. */
  private async deliverEvent(event: PipelineEvent): Promise<void> {
    const typeListeners = this.listeners.get(event.type) ?? new Set();
    const wildcardListeners = this.listeners.get("*") ?? new Set();
    const allListeners = [...typeListeners, ...wildcardListeners];

    const filteredListeners = allListeners.filter((listener) => {
      const filter = this.filteredListeners.get(listener);
      if (!filter) return true; // No filter — always deliver
      return filter(event);
    });

    await Promise.allSettled(filteredListeners.map((listener) => Promise.resolve(listener(event))));
  }
}

/** Build a composed filter from subscription options. */
function buildComposedFilter(options: FilteredSubscriptionOptions): EventFilter | undefined {
  const filters: EventFilter[] = [];
  if (options.filter) filters.push(options.filter);
  if (options.subject) {
    const subject = options.subject;
    filters.push((e) => e.subject === subject);
  }
  if (options.sessionId) {
    const sessionId = options.sessionId;
    filters.push((e) => e.sessionId === sessionId);
  }
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return (event) => filters.every((f) => f(event));
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
