---
id: v1-api
title: V1 Authenticated API
sidebar_position: 10
---

# V1 Authenticated API

The `/api/v1/*` production surface provides stable, API-key-authenticated access for integrations and scripts.

## Configure Keys

Production keys are static runtime configuration:

```bash
export INNOVATOR_API_KEYS="$(openssl rand -hex 32)"
```

Requirements:

- one or more comma-separated values
- every key contains at least 32 characters
- every key is unique
- legacy `INNOVATOR_API_KEY` is not set at the same time

Dynamic key creation, listing, and revocation endpoints are development/experimental only and return `404` in production. Rotate keys by updating `INNOVATOR_API_KEYS` in the deployment environment.

## Authentication

Send one configured key with either header:

```http
X-API-Key: <key>
```

```http
Authorization: Bearer <key>
```

Example:

```bash
export INNOVATOR_CLIENT_API_KEY="<one key from INNOVATOR_API_KEYS>"

curl -X POST https://api.example.com/api/v1/investigate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  -d '{"subject":"remote work tools"}'
```

Missing or invalid keys return `401`. Invalid server authentication configuration returns `503`.

## Production Endpoints

| Method | Route                 | Description                                       |
| ------ | --------------------- | ------------------------------------------------- |
| POST   | `/api/v1/investigate` | Investigate a subject                             |
| POST   | `/api/v1/innovate`    | Investigate and generate for selected angles      |
| POST   | `/api/v1/auto`        | Run the full pipeline, streaming or non-streaming |
| GET    | `/api/v1/openapi`     | Retrieve the authenticated OpenAPI specification  |

Other `/api/v1/*` routes, including dynamic keys, webhooks, and plugins, return `404` in production.

### `POST /api/v1/investigate`

```bash
curl -X POST https://api.example.com/api/v1/investigate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  -d '{"subject":"developer productivity tools","model":"gpt-4.1"}'
```

Request:

| Field     | Type     | Required | Constraint  |
| --------- | -------- | -------- | ----------- |
| `subject` | `string` | Yes      | 1–500 chars |
| `model`   | `string` | No       | Valid model |

Response:

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

Handler limit: 30 requests/minute per key.

### `POST /api/v1/innovate`

```bash
curl -X POST https://api.example.com/api/v1/innovate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  -d '{
    "subject": "developer productivity tools",
    "angles": ["scamper", "first-principles"],
    "model": "gpt-4.1"
  }'
```

Request:

| Field     | Type        | Required | Constraint                     |
| --------- | ----------- | -------- | ------------------------------ |
| `subject` | `string`    | Yes      | 1–500 chars                    |
| `angles`  | `AngleId[]` | Yes      | 1–8 built-in angle identifiers |
| `model`   | `string`    | No       | Valid model                    |

Response:

```json
{
  "data": {
    "investigation": {},
    "angleResults": []
  }
}
```

Handler limit: 20 requests/minute per key.

### `POST /api/v1/auto`

Streaming is enabled by default:

```bash
curl -N -X POST https://api.example.com/api/v1/auto \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  -d '{"subject":"developer productivity tools","stream":true}'
```

Each SSE `data:` line contains a `PipelineProgress` object. Keepalive comments are sent every 15 seconds.

For a single JSON response:

```bash
curl -X POST https://api.example.com/api/v1/auto \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  -d '{"subject":"developer productivity tools","stream":false}'
```

Handler limit: 10 requests/minute per key.

### `GET /api/v1/openapi`

The OpenAPI document is protected in production:

```bash
curl \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  https://api.example.com/api/v1/openapi
```

## Rate Limits

V1 handler limits run in addition to middleware limits:

| Layer                  | Limit                              |
| ---------------------- | ---------------------------------- |
| Global proxy           | 10 requests/minute per IP          |
| V1 investigate handler | 30 requests/minute per route + key |
| V1 innovate handler    | 20 requests/minute per route + key |
| V1 auto handler        | 10 requests/minute per route + key |
| Copilot semaphore      | 2 active calls, 16 queued          |

The global 10 requests/minute per-IP limit is the effective ceiling for a single client IP. Limits and counters are process-local, which is one reason production supports only one replica.

Rate-limited requests return `429`; middleware responses include `Retry-After` where applicable.

## Error Responses

| Status | Meaning                                            |
| ------ | -------------------------------------------------- |
| `200`  | Success                                            |
| `400`  | Invalid JSON, model, or request body               |
| `401`  | Missing or invalid API key                         |
| `404`  | Route is outside the production allowlist          |
| `411`  | Required `Content-Length` is missing               |
| `413`  | Request body exceeds 100 KB                        |
| `429`  | Rate or concurrency limit exceeded                 |
| `500`  | Pipeline or provider failure                       |
| `503`  | Production runtime or authentication misconfigured |

## Node.js Example

```typescript
const apiKey = process.env.INNOVATOR_CLIENT_API_KEY;
const baseUrl = "https://api.example.com";

async function investigate(subject: string) {
  const response = await fetch(`${baseUrl}/api/v1/investigate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey!,
    },
    body: JSON.stringify({ subject }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}
```

## Versioning

The API uses URL-path versioning. A future incompatible API would use a new prefix such as `/api/v2`. Deprecation and migration details will be published before any supported production endpoint is removed.
