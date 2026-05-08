---
id: v1-api
title: V1 Authenticated API
sidebar_position: 10
---

# V1 Authenticated API

Programmatic access to Innovator with API key authentication, rate limiting, and an OpenAPI specification.

## Overview

The `/api/v1/*` endpoints provide a stable, authenticated API surface for integrations, scripts, and third-party applications. All requests require an `X-API-Key` header.

## API Key Management

### Creating a Key

```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Content-Type: application/json" \
  -d '{ "name": "My Integration" }'
```

Response:

```json
{
  "id": "key-uuid",
  "name": "My Integration",
  "key": "inv_abc123...",
  "enabled": true,
  "createdAt": "2025-01-15T10:00:00.000Z"
}
```

:::caution
The full API key is only returned once at creation time. Store it securely.
:::

### Listing Keys

```bash
curl http://localhost:3000/api/v1/keys
```

```json
{
  "keys": [
    {
      "id": "key-uuid",
      "name": "My Integration",
      "enabled": true,
      "createdAt": "2025-01-15T10:00:00.000Z",
      "lastUsedAt": "2025-01-15T12:30:00.000Z",
      "usage": { "totalRequests": 42 }
    }
  ]
}
```

### Revoking a Key

```bash
curl -X DELETE http://localhost:3000/api/v1/keys \
  -H "Content-Type: application/json" \
  -d '{ "id": "key-uuid" }'
```

## Authentication

Include the API key in every request via the `X-API-Key` header:

```bash
curl -X POST http://localhost:3000/api/v1/investigate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: inv_abc123..." \
  -d '{ "subject": "remote work tools" }'
```

Unauthenticated requests return `401`:

```json
{ "error": "API key required" }
```

## Endpoints

### `POST /api/v1/investigate`

Run an investigation on a subject.

```bash
curl -X POST http://localhost:3000/api/v1/investigate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: inv_abc123..." \
  -d '{ "subject": "developer productivity tools", "model": "gpt-4.1" }'
```

```json
{
  "data": {
    "summary": "...",
    "keyAspects": [{ "title": "...", "description": "..." }],
    "currentState": "...",
    "challenges": ["..."],
    "opportunities": ["..."]
  }
}
```

**Rate limit:** 30 req/min

### `POST /api/v1/innovate`

Generate innovations for specific angles.

```bash
curl -X POST http://localhost:3000/api/v1/innovate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: inv_abc123..." \
  -d '{
    "subject": "developer productivity tools",
    "angles": ["scamper", "first-principles"],
    "model": "gpt-4.1"
  }'
```

```json
{
  "data": {
    "investigation": { ... },
    "angleResults": [
      { "angleId": "scamper", "angleName": "SCAMPER", "ideas": [...], "reasoning": "..." }
    ]
  }
}
```

**Rate limit:** 20 req/min. Max 20 angles per request.

### `POST /api/v1/auto`

Run the full auto pipeline with optional streaming.

```bash
# Streaming (default)
curl -X POST http://localhost:3000/api/v1/auto \
  -H "Content-Type: application/json" \
  -H "X-API-Key: inv_abc123..." \
  -d '{ "subject": "developer productivity tools", "stream": true }'

# Non-streaming
curl -X POST http://localhost:3000/api/v1/auto \
  -H "Content-Type: application/json" \
  -H "X-API-Key: inv_abc123..." \
  -d '{ "subject": "developer productivity tools", "stream": false }'
```

**Streaming response:** SSE events with `PipelineProgress` payloads.
**Non-streaming response:**

```json
{ "data": { "investigation": { ... }, "angleResults": [...], "synthesis": { ... } } }
```

**Rate limit:** 10 req/min

### `GET /api/v1/plugins`

List registered plugins (requires API key).

```bash
curl http://localhost:3000/api/v1/plugins \
  -H "X-API-Key: inv_abc123..."
```

```json
{ "data": [{ "id": "...", "name": "...", "type": "...", "version": "...", "description": "..." }] }
```

### `GET /api/v1/openapi`

Retrieve the OpenAPI specification (no authentication required).

```bash
curl http://localhost:3000/api/v1/openapi
```

## Rate Limits

### Rate Limiting Layers

Requests to the V1 API pass through **two independent rate limiting layers**. Both must allow the request for it to succeed:

1. **Global middleware limit (per IP):** The Next.js middleware (`apps/web/src/middleware.ts`) enforces a blanket limit of **10 requests/min per IP** across _all_ `/api/*` routes — including v1 endpoints. This layer also limits each IP to **2 concurrent in-flight requests**.

2. **Per-key endpoint limits:** The v1 route handlers apply additional rate limits keyed by API key, as listed below.

If you are hitting `429` errors sooner than the per-endpoint limits suggest, the global middleware limit is likely the cause. To avoid this, spread requests across time or reduce parallel calls.

### Per-Endpoint Limits

| Endpoint              | Limit      |
| --------------------- | ---------- |
| `/api/v1/investigate` | 30 req/min |
| `/api/v1/innovate`    | 20 req/min |
| `/api/v1/auto`        | 10 req/min |

:::caution
The global middleware limit of 10 req/min per IP is the effective ceiling regardless of the per-endpoint limits above. For example, even though `/api/v1/investigate` allows 30 req/min per key, a single IP cannot exceed 10 total API requests per minute.
:::

When rate limited, the API returns `429`:

```json
{ "error": "Rate limit exceeded. Try again later." }
```

## Error Responses

| Status | Meaning              |
| ------ | -------------------- |
| `200`  | Success              |
| `201`  | Resource created     |
| `400`  | Invalid request body |
| `401`  | Missing/invalid key  |
| `429`  | Rate limit exceeded  |
| `500`  | Internal error       |

## Programmatic Usage (Node.js)

```typescript
const API_KEY = process.env.INNOVATOR_API_KEY;
const BASE_URL = "http://localhost:3000";

async function investigate(subject: string) {
  const res = await fetch(`${BASE_URL}/api/v1/investigate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY!,
    },
    body: JSON.stringify({ subject }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const result = await investigate("remote work tools");
console.log(result.data.summary);
```

## API Versioning & Deprecation Policy

### Versioning Scheme

The API uses URL-path versioning (`/api/v1/...`). New major versions introduce a new path prefix (`/api/v2/...`) while the previous version continues to be served.

### What Constitutes a Breaking Change

The following are **breaking changes** that require a new major version:

- Removing an endpoint or HTTP method
- Removing or renaming a response field
- Changing a field's type (e.g., `string` → `number`)
- Adding a new required request field
- Changing the meaning of an existing field
- Changing authentication requirements for an endpoint

The following are **non-breaking** and may be introduced in the current version:

- Adding new optional request fields
- Adding new response fields
- Adding new endpoints
- Adding new enum values to existing fields
- Relaxing validation constraints (e.g., increasing max length)

### Deprecation Timeline

When a new API version is released:

1. **Announcement** — Deprecation notice added to the changelog and documentation
2. **Overlap period** — The deprecated version continues to function for at least **6 months** after the new version is available
3. **Deprecation headers** — Deprecated endpoints return a `Deprecation` header with the sunset date and a `Link` header pointing to the migration guide
4. **Sunset** — After the overlap period, deprecated endpoints return `410 Gone`

### Version Lifecycle

| Version | Status  | Notes                                    |
| ------- | ------- | ---------------------------------------- |
| `v1`    | Current | Active development; no planned successor |

### Migration Guidance

When a new version is released, a migration guide will be published at `/docs/guides/migration-v{N}` with endpoint-by-endpoint upgrade instructions.
