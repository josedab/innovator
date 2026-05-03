---
id: events-webhooks
title: Events & Webhooks
sidebar_position: 9
---

# Events & Webhooks

Subscribe to pipeline events and deliver them to external systems via webhooks.

## Overview

The event system provides a typed pub/sub event bus for pipeline lifecycle events, plus a webhook manager that delivers events to external URLs with HMAC-SHA256 signing and automatic retries.

## Event Types

The system emits 16 event types across four categories:

| Category          | Events                                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| **Investigation** | `investigation.started`, `investigation.completed`, `investigation.failed` |
| **Angle**         | `angle.started`, `angle.completed`, `angle.failed`                         |
| **Synthesis**     | `synthesis.started`, `synthesis.completed`, `synthesis.failed`             |
| **Pipeline**      | `pipeline.started`, `pipeline.completed`, `pipeline.failed`                |
| **Ideas**         | `idea.created`, `idea.scored`                                              |
| **Sessions**      | `session.saved`                                                            |

## Event Bus

### Subscribing to Events

```typescript
import { getEventBus } from "@innovator/core";

const bus = getEventBus();

// Subscribe to a specific event
bus.on("pipeline.completed", (event) => {
  console.log(`Pipeline finished for: ${event.subject}`);
  console.log(`Session: ${event.sessionId}`);
});

// Subscribe to all events (wildcard)
bus.on("*", (event) => {
  console.log(`[${event.type}] ${event.timestamp}`);
});

// One-time listener
bus.once("investigation.completed", (event) => {
  console.log("First investigation done!");
});
```

### Emitting Events

```typescript
const bus = getEventBus();

const event = bus.emit(
  "idea.created",
  { title: "AI Code Review", score: 85 },
  "developer productivity", // subject (optional)
  "session-123" // sessionId (optional)
);
```

### Event Schema

```typescript
interface PipelineEvent {
  id: string;
  type: string; // e.g., "pipeline.completed"
  payload: unknown; // Event-specific data
  subject?: string; // Innovation subject
  sessionId?: string; // Session identifier
  timestamp: string; // ISO 8601
}
```

### Resetting the Bus

```typescript
import { resetEventBus } from "@innovator/core";

resetEventBus(); // Clears all listeners
```

## Webhooks

### Registering a Webhook

```typescript
import { WebhookManager } from "@innovator/core";

const manager = new WebhookManager();

manager.register({
  url: "https://example.com/hooks/innovator",
  events: ["pipeline.completed", "idea.created"], // Event filter
  secret: "whsec_your_secret_key", // HMAC-SHA256 secret
});
```

The webhook manager automatically subscribes to the event bus for matching events.

### Webhook Delivery

When a matching event fires, the manager sends an HTTP POST to the registered URL:

```http
POST /hooks/innovator HTTP/1.1
Content-Type: application/json
X-Innovator-Event: pipeline.completed
X-Innovator-Delivery: delivery-uuid
X-Innovator-Signature: sha256=<hmac-hex>

{
  "id": "event-uuid",
  "type": "pipeline.completed",
  "payload": { ... },
  "subject": "developer productivity",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

### Signature Verification

Verify the HMAC-SHA256 signature on the receiving end:

```typescript
import { createHmac } from "crypto";

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  return expected === signature;
}
```

### Retry Policy

Failed deliveries are retried with exponential backoff:

| Attempt | Delay |
| ------- | ----- |
| 1st     | 1s    |
| 2nd     | 2s    |
| 3rd     | 4s    |

Each delivery attempt has a 10-second timeout. After 3 failed attempts, the delivery is moved to the **dead letter queue**.

### Dead Letter Queue

Failed deliveries are tracked for inspection:

```typescript
const deadLetters = manager.getDeadLetters();
// [{ event, url, error, attempts, lastAttemptAt }]
```

### Webhook Configuration

```typescript
interface WebhookConfig {
  url: string; // Delivery URL
  events: string[]; // Event type filter
  secret: string; // HMAC-SHA256 signing secret
}
```

### Delivery Headers

| Header                  | Description                             |
| ----------------------- | --------------------------------------- |
| `X-Innovator-Event`     | Event type (e.g., `pipeline.completed`) |
| `X-Innovator-Delivery`  | Unique delivery ID                      |
| `X-Innovator-Signature` | HMAC-SHA256 signature                   |
