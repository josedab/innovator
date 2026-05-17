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

/** Default cap on listeners per event type before a warning is emitted. */
const DEFAULT_MAX_LISTENERS = 10;

/** Default cap on buffered events to prevent unbounded memory growth. */
const DEFAULT_MAX_BUFFER_SIZE = 10_000;

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
  private _maxListeners = DEFAULT_MAX_LISTENERS;
  private _maxBufferSize = DEFAULT_MAX_BUFFER_SIZE;
  private _onWarning?: (message: string) => void;

  /**
   * Set the maximum number of listeners per event type.
   * When exceeded, a warning is emitted to help detect listener leaks.
   * Set to 0 to disable the warning.
   */
  setMaxListeners(n: number): this {
    this._maxListeners = Math.max(0, Math.trunc(n));
    return this;
  }

  /** Get the current max listeners threshold. */
  get maxListeners(): number {
    return this._maxListeners;
  }

  /**
   * Set the maximum buffer size. When the buffer is full, the oldest events
   * are dropped to make room for new ones.
   */
  setMaxBufferSize(n: number): this {
    this._maxBufferSize = Math.max(1, Math.trunc(n));
    return this;
  }

  /** Get the current max buffer size. */
  get maxBufferSize(): number {
    return this._maxBufferSize;
  }

  /**
   * Register a warning handler (e.g. for logging). If not set, warnings are
   * written to `console.warn`.
   */
  onWarning(handler: (message: string) => void): this {
    this._onWarning = handler;
    return this;
  }

  private warn(message: string): void {
    if (this._onWarning) {
      this._onWarning(message);
    } else {
      console.warn(message);
    }
  }

  /** Subscribe to a specific event type. Returns unsubscribe function. */
  on(eventType: EventType | "*", listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    const set = this.listeners.get(eventType)!;
    set.add(listener);

    // Warn when listener count exceeds threshold (likely a leak)
    if (this._maxListeners > 0 && set.size > this._maxListeners) {
      this.warn(
        `EventBus: ${set.size} listeners added for "${eventType}" event — ` +
          `possible listener leak (threshold: ${this._maxListeners}). ` +
          `Use setMaxListeners() to increase the limit if this is intentional.`
      );
    }

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
      if (this.buffer.length >= this._maxBufferSize) {
        // Drop oldest events to stay within cap
        const overflow = this.buffer.length - this._maxBufferSize + 1;
        this.buffer.splice(0, overflow);
        this.warn(
          `EventBus: buffer exceeded maxBufferSize (${this._maxBufferSize}), ` +
            `${overflow} oldest event(s) dropped.`
        );
      }
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
