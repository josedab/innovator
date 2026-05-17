import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import type { PipelineEvent, WebhookConfig, WebhookDelivery, DeadLetterEntry } from "./types.js";
import { getEventBus } from "./emitter.js";

const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Webhook delivery engine with retry logic and HMAC-SHA256 signing.
 */
export class WebhookManager {
  private webhooks = new Map<string, WebhookConfig>();
  private deliveryLog: WebhookDelivery[] = [];
  private deadLetters: DeadLetterEntry[] = [];
  private unsubscribesByWebhook = new Map<string, (() => void)[]>();

  /** Max entries to retain in delivery log and dead letter queue. */
  private static readonly MAX_DELIVERY_LOG = 10_000;
  private static readonly MAX_DEAD_LETTERS = 1_000;

  /** Trim collections to their maximum size, removing oldest entries first. */
  private trimCollections(): void {
    if (this.deliveryLog.length > WebhookManager.MAX_DELIVERY_LOG) {
      this.deliveryLog = this.deliveryLog.slice(-WebhookManager.MAX_DELIVERY_LOG);
    }
    if (this.deadLetters.length > WebhookManager.MAX_DEAD_LETTERS) {
      this.deadLetters = this.deadLetters.slice(-WebhookManager.MAX_DEAD_LETTERS);
    }
  }

  /** Register a new webhook endpoint. */
  registerWebhook(config: Omit<WebhookConfig, "id" | "createdAt">): WebhookConfig {
    const webhook: WebhookConfig = {
      ...config,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      active: config.active ?? true,
    };
    this.webhooks.set(webhook.id, webhook);

    // Subscribe to relevant events and track unsubscribes per webhook
    const bus = getEventBus();
    const unsubs: (() => void)[] = [];
    for (const eventType of webhook.events) {
      const unsub = bus.on(eventType, (event) => {
        this.deliverEvent(webhook.id, event).catch((err) => {
          console.error(
            `WebhookManager: delivery failed for webhook ${webhook.id} on event ${event.type}: ${err instanceof Error ? err.message : String(err)}`
          );
        });
      });
      unsubs.push(unsub);
    }
    this.unsubscribesByWebhook.set(webhook.id, unsubs);

    return webhook;
  }

  /** Unregister a webhook and remove its event listeners. */
  unregisterWebhook(id: string): boolean {
    const unsubs = this.unsubscribesByWebhook.get(id);
    if (unsubs) {
      for (const unsub of unsubs) unsub();
      this.unsubscribesByWebhook.delete(id);
    }
    return this.webhooks.delete(id);
  }

  /** Get a webhook by ID. */
  getWebhook(id: string): WebhookConfig | undefined {
    return this.webhooks.get(id);
  }

  /** List all registered webhooks. */
  listWebhooks(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  /** Generate HMAC-SHA256 signature for a payload. */
  signPayload(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  /** Deliver an event to a webhook endpoint with retries. */
  async deliverEvent(webhookId: string, event: PipelineEvent): Promise<WebhookDelivery> {
    const webhook = this.webhooks.get(webhookId);
    if (!webhook || !webhook.active) {
      return {
        webhookId,
        eventId: event.id,
        attempt: 0,
        status: "failed",
        error: "Webhook not found or inactive",
        timestamp: new Date().toISOString(),
        durationMs: 0,
      };
    }

    let lastDelivery: WebhookDelivery | null = null;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      const startTime = Date.now();

      try {
        const payload = JSON.stringify(event);
        const signature = this.signPayload(payload, webhook.secret);

        const response = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Innovator-Signature": `sha256=${signature}`,
            "X-Innovator-Event": event.type,
            "X-Innovator-Delivery": event.id,
          },
          body: payload,
          signal: AbortSignal.timeout(10_000),
        });

        const delivery: WebhookDelivery = {
          webhookId,
          eventId: event.id,
          attempt,
          status: response.ok ? "success" : "failed",
          statusCode: response.status,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };

        this.deliveryLog.push(delivery);
        lastDelivery = delivery;

        if (response.ok) {
          this.trimCollections();
          return delivery;
        }
      } catch (err) {
        lastDelivery = {
          webhookId,
          eventId: event.id,
          attempt,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
        this.deliveryLog.push(lastDelivery);
      }

      // Exponential backoff before retry
      if (attempt < MAX_RETRY_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1))
        );
      }
    }

    // Add to dead letter queue after all retries exhausted
    this.deadLetters.push({
      webhookId,
      event,
      lastAttempt: new Date().toISOString(),
      attempts: MAX_RETRY_ATTEMPTS,
      lastError: lastDelivery?.error ?? "Unknown error",
    });

    this.trimCollections();
    return lastDelivery!;
  }

  /** Get delivery log for a webhook. */
  getDeliveryLog(webhookId?: string): WebhookDelivery[] {
    if (webhookId) {
      return this.deliveryLog.filter((d) => d.webhookId === webhookId);
    }
    return [...this.deliveryLog];
  }

  /** Get dead letter queue entries. */
  getDeadLetters(): DeadLetterEntry[] {
    return [...this.deadLetters];
  }

  /** Clear dead letter queue. */
  clearDeadLetters(): void {
    this.deadLetters = [];
  }

  /** Cleanup all subscriptions. */
  destroy(): void {
    for (const unsubs of this.unsubscribesByWebhook.values()) {
      for (const unsub of unsubs) unsub();
    }
    this.unsubscribesByWebhook.clear();
    this.webhooks.clear();
  }
}
