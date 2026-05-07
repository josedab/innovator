---
id: monitoring
title: Production Monitoring
sidebar_position: 19
---

# Production Monitoring

A unified guide to monitoring, observability, and operational awareness for Innovator deployments. This consolidates health checking, cost monitoring, analytics, webhook integration, and logging into a single reference.

## Health Check Polling

The `/api/health` endpoint returns the service status and build version:

```bash
curl https://your-domain.com/api/health
# { "status": "ok", "version": "0.2.0" }
```

### Automated Health Checks

Set up periodic polling with your monitoring tool of choice:

```bash
# Simple cron-based health check (every 5 minutes)
*/5 * * * * curl -sf https://your-domain.com/api/health || echo "Innovator is DOWN" | mail -s "Health Alert" ops@example.com
```

For uptime monitoring services (UptimeRobot, Pingdom, Better Uptime, etc.), configure:

- **URL:** `https://your-domain.com/api/health`
- **Method:** GET
- **Expected status:** 200
- **Expected body contains:** `"ok"`
- **Check interval:** 1–5 minutes

### What to Monitor

| Signal           | Source                     | Alert when                                    |
| ---------------- | -------------------------- | --------------------------------------------- |
| Service up/down  | `/api/health`              | Non-200 response or timeout                   |
| Response latency | `/api/health` timing       | > 2 seconds (indicates server load)           |
| Version drift    | `/api/health` version      | Version doesn't match expected deployment     |
| LLM availability | `/api/investigate` latency | Investigation calls > 60 seconds consistently |

---

## Cost Tracking & Alerts

Innovator tracks LLM costs automatically. Use the cost tracker to set up alerts for budget overruns.

### Programmatic Cost Monitoring

```typescript
import { getCostTracker } from "@innovator/core";

const tracker = getCostTracker();
const summary = tracker.getSummary();

// Check cost thresholds
if (summary.totalCostUsd > 10.0) {
  console.warn(`Cost alert: $${summary.totalCostUsd.toFixed(2)} spent`);
}

// Per-model breakdown
for (const [model, stats] of Object.entries(summary.byModel)) {
  console.log(`${model}: $${stats.costUsd.toFixed(4)} (${stats.calls} calls)`);
}
```

### Budget Caps

Set a hard budget cap that automatically aborts pipelines when exceeded:

```typescript
import { getCostTracker } from "@innovator/core";

const tracker = getCostTracker();
const abortController = new AbortController();

tracker.setBudget({
  maxCostUsd: 50.0, // Daily budget
  abortController,
});

abortController.signal.addEventListener("abort", () => {
  // Send alert to your monitoring system
  console.error("Budget exceeded:", abortController.signal.reason);
});
```

See the [Cost Tracking guide](/docs/guides/cost-tracking) for full details on pricing tables and per-stage breakdowns.

---

## Analytics Dashboard

The `/api/analytics` endpoint provides aggregated usage data.

### Fetching Analytics

```bash
# Get analytics summary
curl https://your-domain.com/api/analytics \
  -H "X-API-Key: your-key"

# Response
{
  "summary": {
    "totalInvestigations": 142,
    "totalIdeasGenerated": 1,136,
    "topAngles": ["scamper", "first-principles", "biomimicry"],
    ...
  },
  "insights": [...]
}
```

### Tracking Custom Events

```bash
# Track a custom event for your dashboards
curl -X POST https://your-domain.com/api/analytics \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{"type": "idea_generated", "data": {"angleId": "scamper", "subject": "logistics"}}'
```

### Key Metrics to Track

| Metric                  | Description        | How to get                          |
| ----------------------- | ------------------ | ----------------------------------- |
| Investigations per day  | Usage volume       | `GET /api/analytics` summary        |
| Ideas per investigation | Quality indicator  | `GET /api/analytics` summary        |
| Most-used angles        | Feature popularity | `GET /api/analytics` summary        |
| Error rate              | Reliability        | Count 4xx/5xx from server logs      |
| LLM latency (p50/p95)   | Performance        | `GET /api/observatory?action=stats` |
| Token usage per session | Cost efficiency    | Cost tracker `getSummary().byStage` |

---

## Webhook Integration

Use the event system to push pipeline events to external monitoring tools (Slack, PagerDuty, Datadog, etc.).

### Setting Up Webhooks

```typescript
import { createWebhookManager } from "@innovator/core";

const webhooks = createWebhookManager();

// Register a webhook for pipeline events
webhooks.register({
  url: "https://hooks.slack.com/services/T.../B.../xxx",
  events: ["pipeline.completed", "pipeline.failed"],
  secret: "your-hmac-secret", // HMAC-SHA256 signing
});

// Register for cost alerts
webhooks.register({
  url: "https://your-monitoring.com/webhook",
  events: ["investigation.completed", "synthesis.completed"],
  secret: "another-secret",
});
```

Webhooks are signed with HMAC-SHA256 and include automatic retries. See the [Events & Webhooks guide](/docs/guides/events-webhooks) for the full list of 16 event types.

### Event Payload Example

```json
{
  "type": "pipeline.completed",
  "timestamp": "2026-01-15T10:30:00Z",
  "data": {
    "subject": "remote work tools",
    "anglesCompleted": 8,
    "durationMs": 45000,
    "totalCostUsd": 0.12
  }
}
```

---

## Observatory (LLM Debugging)

The prompt observatory records every LLM call for debugging and optimization. Access it via the `/api/observatory` endpoint or the web dashboard at `/analytics`.

```bash
# Aggregated stats
curl "https://your-domain.com/api/observatory?action=stats"

# Recent call timeline
curl "https://your-domain.com/api/observatory?action=timeline&limit=20"

# Compare two calls
curl "https://your-domain.com/api/observatory?action=diff&a=call-id-1&b=call-id-2"
```

See the [Observatory guide](/docs/guides/observatory) for details on quality scoring, prompt diffing, and A/B comparisons.

---

## Logging

Innovator uses structured logging via `apps/web/src/lib/logger.ts`. In development, errors include full stack traces; in production, sensitive details are omitted.

### Log Levels

| Level   | When used                                  |
| ------- | ------------------------------------------ |
| `error` | Pipeline failures, unhandled exceptions    |
| `warn`  | Budget approaching limit, rate limit hit   |
| `info`  | Request received, pipeline completed       |
| `debug` | Full prompt/response pairs (dev mode only) |

### Structured Log Fields

All API route logs include:

| Field        | Description                            |
| ------------ | -------------------------------------- |
| `route`      | API route path (e.g., `/api/auto`)     |
| `requestId`  | Unique request identifier              |
| `durationMs` | Total request duration in milliseconds |
| `error`      | Error message (on failure)             |

### Production Log Aggregation

Forward logs to your aggregation service of choice:

- **Vercel:** Logs are available in the Vercel dashboard automatically
- **Docker/Self-hosted:** Pipe stdout/stderr to Datadog, Elastic, or CloudWatch
- **PM2:** Use `pm2 logs innovator` or configure PM2 log rotation

```bash
# Example: Forward PM2 logs to a file
pm2 start npm --name innovator -- start --log /var/log/innovator.log
```

---

## Monitoring Checklist

Use this checklist when setting up a production Innovator deployment:

- [ ] Health check polling configured (1–5 minute interval)
- [ ] Budget cap set via `CostTracker.setBudget()`
- [ ] Webhook registered for `pipeline.failed` events
- [ ] Log aggregation configured
- [ ] Rate limiting tuned for expected traffic (see [API Reference](/docs/api-reference#rate-limiting))
- [ ] `INNOVATOR_API_KEY` set and rotated periodically
- [ ] HTTPS enabled (required for service workers and security headers)
- [ ] Observatory reviewed for prompt quality and cost optimization
