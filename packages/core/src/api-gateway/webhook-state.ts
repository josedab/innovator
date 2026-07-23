import { webhookSubscriptions, webhookUrls } from "./state.js";
import type { WebhookEvent, WebhookSubscription } from "./types.js";

/** Register a webhook URL for an API key. */
export function registerWebhook(keyId: string, url: string): void {
  const urls = webhookUrls.get(keyId) ?? [];
  if (!urls.includes(url)) urls.push(url);
  webhookUrls.set(keyId, urls);
}

/**
 * Get registered webhook URLs for an API key.
 *
 * @param keyId - The API key identifier.
 * @returns Array of webhook URLs, or empty array if none registered.
 */
export function getWebhooks(keyId: string): string[] {
  return webhookUrls.get(keyId) ?? [];
}

/**
 * Remove a specific webhook URL from an API key.
 *
 * @param keyId - The API key identifier.
 * @param url - The webhook URL to remove.
 * @returns `true` if found and removed, `false` otherwise.
 */
export function removeWebhook(keyId: string, url: string): boolean {
  const urls = webhookUrls.get(keyId);
  if (!urls) return false;
  const idx = urls.indexOf(url);
  if (idx === -1) return false;
  urls.splice(idx, 1);
  return true;
}

/** Create a webhook subscription for specific events. */
export function createWebhookSubscription(
  keyId: string,
  url: string,
  events: WebhookSubscription["events"]
): WebhookSubscription {
  const id = `whsub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const secret = `whsec_${Array.from({ length: 32 }, () => Math.random().toString(36)[2]).join("")}`;

  const sub: WebhookSubscription = {
    id,
    keyId,
    url,
    events,
    secret,
    active: true,
    createdAt: new Date().toISOString(),
    failureCount: 0,
  };

  webhookSubscriptions.set(id, sub);
  return sub;
}

/** List webhook subscriptions for a key. */
export function listWebhookSubscriptions(keyId: string): WebhookSubscription[] {
  return Array.from(webhookSubscriptions.values()).filter((s) => s.keyId === keyId);
}

/** Get a webhook subscription by ID. */
export function getWebhookSubscription(id: string): WebhookSubscription | undefined {
  return webhookSubscriptions.get(id);
}

/** Delete a webhook subscription. */
export function deleteWebhookSubscription(id: string): boolean {
  return webhookSubscriptions.delete(id);
}

/** Toggle a webhook subscription active/inactive. */
export function toggleWebhookSubscription(id: string): boolean {
  const sub = webhookSubscriptions.get(id);
  if (!sub) return false;
  sub.active = !sub.active;
  return true;
}

/** Dispatch a webhook event to matching subscriptions. */
export async function dispatchWebhookEvent(
  event: WebhookEvent
): Promise<{ delivered: number; failed: number }> {
  let delivered = 0;
  let failed = 0;

  for (const sub of webhookSubscriptions.values()) {
    if (!sub.active || sub.keyId !== event.keyId) continue;
    if (!sub.events.includes(event.type as WebhookSubscription["events"][number])) continue;

    try {
      const response = await fetch(sub.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": sub.secret,
          "X-Webhook-Event": event.type,
          "X-Webhook-Id": event.id,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        sub.lastDeliveredAt = new Date().toISOString();
        sub.failureCount = 0;
        delivered++;
      } else {
        sub.failureCount++;
        failed++;
      }
    } catch {
      sub.failureCount++;
      failed++;
    }

    // Auto-disable after 10 consecutive failures
    if (sub.failureCount >= 10) {
      sub.active = false;
    }
  }

  return { delivered, failed };
}
