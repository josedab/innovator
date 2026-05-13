/**
 * @module api-gateway/webhooks
 *
 * Webhook registration, delivery with HMAC-SHA256 signing,
 * retry with exponential backoff, and delivery history tracking.
 */

import { createHmac } from "node:crypto";

// ---- Types ----

export interface WebhookRegistration {
  id: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: string;
  payload: Record<string, unknown>;
  statusCode: number | null;
  deliveredAt: string;
  retries: number;
}

// ---- Webhook Registry ----

const MAX_RETRIES = 3;
const DELIVERY_TIMEOUT_MS = 10_000;

export class WebhookRegistry {
  private registrations = new Map<string, WebhookRegistration>();
  private deliveries: WebhookDelivery[] = [];

  /** Register a new webhook endpoint. */
  register(url: string, events: string[], secret?: string): WebhookRegistration {
    try {
      new URL(url);
    } catch {
      throw new Error(`Invalid webhook URL: ${url}`);
    }

    const id = `wh_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const generatedSecret =
      secret ?? `whsec_${Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join("")}`;

    const registration: WebhookRegistration = {
      id,
      url,
      events,
      secret: generatedSecret,
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.registrations.set(id, registration);
    return registration;
  }

  /** Remove a webhook by ID. */
  unregister(id: string): boolean {
    return this.registrations.delete(id);
  }

  /** List registered webhooks, optionally filtered by apiKeyId metadata. */
  list(apiKeyId?: string): WebhookRegistration[] {
    const all = Array.from(this.registrations.values());
    if (!apiKeyId) return all;
    return all.filter((r) => r.metadata?.apiKeyId === apiKeyId);
  }

  /** Deliver an event to all matching active webhooks. */
  async deliver(
    event: string,
    payload: Record<string, unknown>
  ): Promise<{ delivered: number; failed: number }> {
    let delivered = 0;
    let failed = 0;

    for (const registration of this.registrations.values()) {
      if (!registration.active) continue;
      if (!registration.events.includes(event) && !registration.events.includes("*")) continue;

      const success = await this.deliverToWebhook(registration, event, payload);
      if (success) {
        delivered++;
      } else {
        failed++;
      }
    }

    return { delivered, failed };
  }

  /** Get delivery history for a webhook. */
  getDeliveryHistory(webhookId: string, limit: number = 50): WebhookDelivery[] {
    return this.deliveries
      .filter((d) => d.webhookId === webhookId)
      .slice(-limit);
  }

  /** Send a test event to a webhook. */
  async testWebhook(id: string): Promise<WebhookDelivery | null> {
    const registration = this.registrations.get(id);
    if (!registration) return null;

    const testPayload: Record<string, unknown> = {
      type: "webhook.test",
      message: "This is a test event from the Innovation API.",
      timestamp: new Date().toISOString(),
    };

    await this.deliverToWebhook(registration, "webhook.test", testPayload);

    const history = this.getDeliveryHistory(id, 1);
    return history.length > 0 ? history[history.length - 1] : null;
  }

  /** Get a registration by ID. */
  get(id: string): WebhookRegistration | undefined {
    return this.registrations.get(id);
  }

  /** Clear all registrations and history (for testing). */
  clear(): void {
    this.registrations.clear();
    this.deliveries.length = 0;
  }

  // ---- Internal ----

  private async deliverToWebhook(
    registration: WebhookRegistration,
    event: string,
    payload: Record<string, unknown>
  ): Promise<boolean> {
    const body = JSON.stringify(payload);
    const signature = createHmac("sha256", registration.secret).update(body).digest("hex");

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }

      const delivery: WebhookDelivery = {
        id: `whd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        webhookId: registration.id,
        event,
        payload,
        statusCode: null,
        deliveredAt: new Date().toISOString(),
        retries: attempt,
      };

      try {
        const response = await fetch(registration.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": event,
            "X-Webhook-Signature": `sha256=${signature}`,
            "X-Webhook-Id": delivery.id,
            "X-Webhook-Timestamp": delivery.deliveredAt,
          },
          body,
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });

        delivery.statusCode = response.status;
        this.deliveries.push(delivery);

        if (response.ok) {
          return true;
        }
      } catch {
        delivery.statusCode = 0;
        this.deliveries.push(delivery);
      }
    }

    return false;
  }
}

// ---- Singleton ----

let instance: WebhookRegistry | undefined;

/** Get the singleton WebhookRegistry instance. */
export function getWebhookRegistry(): WebhookRegistry {
  if (!instance) {
    instance = new WebhookRegistry();
  }
  return instance;
}
