---
id: events-webhooks
title: Events & Webhooks
sidebar_position: 9
---

# Events & Webhooks

Subscribe to pipeline events and deliver them to external systems via webhooks.

:::caution Production availability
Webhook management, automation, and third-party integration routes are development/experimental and return `404` in the first production profile. Core-package examples in this guide are for local library development.
:::

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

## Automation Triggers

The automation system lets you define event-driven rules that trigger actions when specific conditions are met. Rules are registered in-memory and evaluate incoming events against conditions before executing actions.

### Creating an Automation Rule

```typescript
import { createAutomationRule } from "@innovator/core";

const rule = createAutomationRule({
  name: "High Score Alert",
  description: "Notify when an idea scores above 80",
  enabled: true,
  triggerEvent: "idea.scored",
  conditions: [{ field: "payload.score", operator: "gte", value: 80 }],
  actions: [
    { type: "send-notification", config: { channel: "innovation" } },
    { type: "create-github-issue", config: { repo: "owner/repo" } },
  ],
});

console.log(`Rule created: ${rule.id}`);
```

### Condition Operators

| Operator   | Description                     | Example                                                        |
| ---------- | ------------------------------- | -------------------------------------------------------------- |
| `eq`       | Equals                          | `{ field: "type", operator: "eq", value: "idea.scored" }`      |
| `neq`      | Not equals                      | `{ field: "payload.status", operator: "neq", value: "draft" }` |
| `gt`       | Greater than (numeric)          | `{ field: "payload.score", operator: "gt", value: 90 }`        |
| `gte`      | Greater than or equal (numeric) | `{ field: "payload.score", operator: "gte", value: 80 }`       |
| `lt`       | Less than (numeric)             | `{ field: "payload.score", operator: "lt", value: 50 }`        |
| `lte`      | Less than or equal (numeric)    | `{ field: "payload.score", operator: "lte", value: 30 }`       |
| `contains` | String contains                 | `{ field: "subject", operator: "contains", value: "AI" }`      |
| `exists`   | Field exists and is not null    | `{ field: "payload.score", operator: "exists" }`               |

Conditions use AND logic — all conditions must be met for the rule to trigger.

### Action Types

| Action Type           | Description                                 | Config                   |
| --------------------- | ------------------------------------------- | ------------------------ |
| `webhook`             | Send event payload to an external URL       | `{ url: "https://..." }` |
| `generate-prd`        | Queue PRD generation from the event subject | —                        |
| `create-github-issue` | Create a GitHub issue from the event        | `{ repo: "owner/repo" }` |
| `send-notification`   | Send a notification to a channel            | `{ channel: "general" }` |
| `index-for-search`    | Index the event data for semantic search    | —                        |
| `record-outcome`      | Record the outcome for learning loops       | —                        |
| `log`                 | Log the event to the automation log         | —                        |

### Managing Rules

```typescript
import {
  listAutomationRules,
  getAutomationRule,
  toggleAutomationRule,
  deleteAutomationRule,
  getAutomationLog,
} from "@innovator/core";

// List all rules
const rules = listAutomationRules();

// Enable/disable a rule
toggleAutomationRule("rule-abc123", false);

// View execution log
const log = getAutomationLog("rule-abc123");
for (const entry of log) {
  console.log(
    `${entry.eventType}: ${entry.actionsExecuted.map((a) => `${a.type}=${a.status}`).join(", ")}`
  );
}

// Delete a rule
deleteAutomationRule("rule-abc123");
```

### Preset Automation Chains

Two pre-built chains are available for common workflows:

#### High Score Chain

Automatically generates a PRD and creates a GitHub issue when an idea scores above a threshold:

```typescript
import { createHighScoreChain } from "@innovator/core";

const rule = createHighScoreChain(85, "owner/repo");
// Triggers on idea.scored where payload.score >= 85
// Actions: generate-prd → create-github-issue → send-notification
```

#### Pipeline Notification Chain

Sends a notification, records the outcome, and indexes for search when a pipeline completes:

```typescript
import { createPipelineNotificationChain } from "@innovator/core";

const rule = createPipelineNotificationChain("innovation");
// Triggers on pipeline.completed (no conditions)
// Actions: send-notification → record-outcome → index-for-search
```

## Webhook Templates

Pre-built webhook templates are available for common integrations. Each template includes a URL pattern, event filters, and a body formatter.

### Available Templates

| Template ID     | Name                 | Events                                  | URL Pattern                                          |
| --------------- | -------------------- | --------------------------------------- | ---------------------------------------------------- |
| `slack`         | Slack Notification   | `pipeline.completed`, `idea.scored`     | `https://hooks.slack.com/services/T.../B.../...`     |
| `github-issues` | GitHub Issue Creator | `idea.scored`, `pipeline.completed`     | `https://api.github.com/repos/{owner}/{repo}/issues` |
| `jira`          | Jira Ticket Creator  | `idea.scored`                           | `https://{domain}.atlassian.net/rest/api/3/issue`    |
| `email`         | Email Notification   | `pipeline.completed`, `pipeline.failed` | `https://api.sendgrid.com/v3/mail/send`              |

### Listing Templates

```typescript
import { listWebhookTemplates } from "@innovator/core";

const templates = listWebhookTemplates();
for (const t of templates) {
  console.log(`${t.name} (${t.id}): ${t.description}`);
  console.log(`  URL: ${t.urlPattern}`);
  console.log(`  Events: ${t.events.join(", ")}`);
}
```

### Getting a Specific Template

```typescript
import { getWebhookTemplate } from "@innovator/core";

const slack = getWebhookTemplate("slack");
if (slack) {
  console.log(slack.name); // "Slack Notification"
  console.log(slack.events); // ["pipeline.completed", "idea.scored"]
}
```

### Template Body Format

Each template includes a `bodyTemplate` function that formats events for the target integration:

- **Slack**: Sends Block Kit messages with event type and payload
- **GitHub Issues**: Creates issues with `[Innovation]` prefix, JSON payload in code blocks, and `innovation`/`auto-generated` labels
- **Jira**: Creates tasks in the `INNOV` project with Atlassian Document Format descriptions
- **Email**: Sends HTML emails via SendGrid/Mailgun with event summary and payload
