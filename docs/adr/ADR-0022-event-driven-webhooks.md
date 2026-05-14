# ADR-0022: Event-Driven Architecture with Webhook Delivery

## Status

Accepted

## Context

As Innovator grew from a single-pipeline tool to a platform with collaboration, analytics, monitoring, and external integrations, different modules needed to react to system events (session created, idea generated, pipeline completed, gauntlet scored) without tight coupling. External systems (CI/CD, Slack, project management tools) also needed notification when innovation events occurred.

Options considered:

1. **Direct function calls** — Modules call each other directly. Simple but creates tight coupling and makes it impossible to add new consumers without modifying producers.
2. **Polling** — External systems periodically query for changes. High latency, wasteful, and complex state tracking.
3. **Event bus with webhook delivery** — Internal typed events plus HTTP webhook delivery for external consumers.

## Decision

We implement a **typed event bus with webhook delivery** in `packages/core/src/events/`. The system provides:

- **Typed pipeline events** — `SessionCreated`, `InvestigationComplete`, `IdeaGenerated`, `SynthesisComplete`, `GauntletScored`, etc., each with a Zod-validated payload.
- **Internal subscriptions** — Modules subscribe to event types and receive callbacks (e.g., the temporal memory module ingests sessions on `SynthesisComplete`).
- **Webhook delivery** — Registered webhook URLs receive HTTP POST requests with event payloads. Failed deliveries are retried with exponential backoff.
- **Dead-letter handling** — Persistently failed webhook deliveries are logged for manual inspection.
- **Automation rules** — Configurable rules that trigger actions (e.g., "when a gauntlet scores below 30, send a Slack notification").

## Consequences

**Positive:**

- **Decoupled modules** — Producers emit events without knowing who consumes them. New modules can subscribe without modifying existing code.
- **External integration** — Webhook delivery enables Slack/Teams notifications, CI/CD triggers, and third-party dashboards without custom integrations per platform.
- **Audit trail integration** — The provenance ledger can subscribe to all events, automatically recording the full innovation lifecycle.
- **Automation** — Rules engine enables user-defined workflows without code changes.

**Negative:**

- **In-memory subscriptions** — Internal event subscriptions don't survive process restarts. Persistent subscriptions would require a message broker (Redis, RabbitMQ).
- **Webhook reliability** — HTTP delivery is at-most-once without a persistent outbox. Network failures may cause missed deliveries despite retries.
- **Event schema evolution** — Adding or changing event payload fields requires careful versioning to avoid breaking webhook consumers.
- **No backpressure** — A burst of events (e.g., batch pipeline run) sends all webhooks simultaneously. Rate limiting on the delivery side would improve reliability.
