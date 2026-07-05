---
id: sdk
title: SDK Guide
sidebar_position: 14
---

# SDK Guide

The `@innovator/sdk` package provides a framework-agnostic TypeScript client for the Innovator API. Use it to integrate innovation capabilities into any Node.js or browser application.

:::caution Production availability
The first production profile supports SDK calls backed by `POST /api/investigate`, `/api/innovate`, `/api/auto`, and `/api/nl-innovate`. Production API-key authentication is required. Advanced methods backed by other routes are development/experimental and receive `404`.
:::

## Installation

```bash
npm install @innovator/sdk
```

## Quick Start

```ts
import { InnovatorClient } from "@innovator/sdk";

const client = new InnovatorClient({
  baseUrl: "http://localhost:3000",
  apiKey: process.env.INNOVATOR_CLIENT_API_KEY, // required by production servers
});

// Investigate a subject
const investigation = await client.investigate("renewable energy");
console.log(investigation);

// Run the full auto pipeline
const events = await client.auto("renewable energy");
console.log(events);
```

This is a server-side Node.js example. Do not bundle a production Innovator key into browser JavaScript; route browser requests through your authenticated backend or reverse proxy.

## Configuration

```ts
const client = new InnovatorClient({
  baseUrl: "https://innovator.example.com", // Required — your Innovator instance URL
  apiKey: process.env.INNOVATOR_CLIENT_API_KEY, // Required in production
  timeout: 120_000, // Optional — request timeout in ms (default: 120s)
  maxRetries: 2, // Optional — retries for 408/429/5xx errors (default: 2)
});
```

Use a client-specific environment variable for the selected key. Do not expose the server's full `INNOVATOR_API_KEYS` list to browser bundles or other client applications.

## Core Methods

### Investigate

Analyze a subject to gather background research — key aspects, state of the art, challenges, and opportunities.

```ts
const investigation = await client.investigate("code review processes", {
  model: "gpt-5", // optional model override
});
```

### Innovate

Generate ideas using specific innovation angles against a prior investigation.

```ts
const result = await client.innovate("code review processes", ["scamper", "first-principles"], {
  investigation, // from a previous investigate() call
  synthesize: true, // cross-reference results
  score: true, // add feasibility scoring
});

console.log(result.angleResults); // ideas from each angle
console.log(result.synthesis); // cross-angle synthesis
```

### Auto Pipeline

Run the full pipeline (investigate → all angles → synthesize) in a single call.

```ts
// Collect all SSE events after completion
const events = await client.auto("remote work tools");

// Or stream events in real-time
await client.streamAuto("remote work tools", (event) => {
  if (event.event === "progress") {
    console.log(`Stage: ${event.data.stage}`);
  }
});
```

### Natural Language Innovation

Describe what you want in plain English and let the system build the pipeline.

```ts
const events = await client.nlInnovate("How can we improve developer onboarding using AI?");

// Or stream
await client.streamNLInnovate("Improve developer onboarding", (event) => console.log(event.data));
```

## Development/Experimental Methods

These methods target routes outside the first production allowlist. Use them only with the development server; production intentionally returns `404`.

### Session Diff & Merge

Compare or merge two innovation sessions.

```ts
const diff = await client.diffMerge("diff", {
  sessionA: session1Data,
  sessionB: session2Data,
});

const merged = await client.diffMerge("merge", {
  sessionA: session1Data,
  sessionB: session2Data,
});
```

### Memory Search

Search past investigations in the memory graph.

```ts
const results = await client.memorySearch("renewable energy", {
  threshold: 0.7,
  limit: 10,
});
```

### Organisation DNA

Get an aggregated summary of your organisation's innovation patterns.

```ts
const dna = await client.getOrgDNA("markdown");
```

### Persona Evaluation

Evaluate an idea against different stakeholder personas.

```ts
const evaluation = await client.evaluatePersonas(
  { title: "AI Tutor", description: "An AI-powered tutoring system" },
  ["student", "teacher", "administrator"],
  { format: "markdown" }
);
```

### Innovation Monitor

Track and digest innovation signals from configured sources.

```ts
// Get current monitor state
const state = await client.getMonitorState();

// Generate a weekly digest
const digest = await client.generateDigest("weekly");
```

## Request Options

All methods accept an optional `RequestOptions` parameter:

| Option   | Type          | Description            |
| -------- | ------------- | ---------------------- |
| `model`  | `string`      | Override the LLM model |
| `signal` | `AbortSignal` | Cancel the request     |

```ts
const controller = new AbortController();

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30_000);

const result = await client.investigate("topic", {
  model: "gpt-5",
  signal: controller.signal,
});
```

## Error Handling

The SDK throws `InnovatorError` for all failures, with automatic retries for transient errors (408, 429, 502, 503, 504).

```ts
import { InnovatorError } from "@innovator/sdk";

try {
  await client.investigate("topic");
} catch (err) {
  if (err instanceof InnovatorError) {
    console.error(err.message); // Human-readable message
    console.error(err.status); // HTTP status (0 for network/timeout)
    console.error(err.code); // "TIMEOUT", "ABORTED", "NETWORK_ERROR"
  }
}
```

## Validation Schemas

The SDK exports Zod schemas that match the API request formats. Use them for client-side validation:

```ts
import { InvestigateRequestSchema } from "@innovator/sdk";

const parsed = InvestigateRequestSchema.safeParse(userInput);
if (!parsed.success) {
  console.error(parsed.error.flatten());
}
```

Available schemas: `InvestigateRequestSchema`, `InnovateRequestSchema`, `AutoRequestSchema`, `NLInnovateRequestSchema`, `DiffMergeRequestSchema`, `MemorySearchRequestSchema`, `PersonaEvaluationRequestSchema`, `MonitorRequestSchema`.

## Next Steps

- [API Reference](/docs/api-reference) — full endpoint documentation
- [Web App Guide](/docs/guides/web-app) — using the web interface
- [CLI Guide](/docs/guides/cli) — command-line usage
- [Auto Mode](/docs/guides/auto-mode) — understanding the auto pipeline
