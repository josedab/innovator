---
id: configuration
title: Configuration
sidebar_position: 3
---

# Configuration

Innovator is configured via environment variables. Copy `.env.local.example` to `.env.local` in the project root and adjust values as needed.

## Environment Variables

| Variable                   | Description                                                          | Default   | Required |
| -------------------------- | -------------------------------------------------------------------- | --------- | -------- |
| `INNOVATOR_DEFAULT_MODEL`  | LLM model used when none is specified at runtime                     | `gpt-4.1` | No       |
| `INNOVATOR_API_KEY`        | API key to protect web API routes via `X-API-Key` header (see below) | _unset_   | No       |
| `INNOVATOR_LLM_TIMEOUT_MS` | Timeout for each LLM request in milliseconds                         | `90000`   | No       |
| `INNOVATOR_EXTRA_MODELS`   | Comma-separated list of additional model IDs to allow                | _unset_   | No       |
| `PORT`                     | Port for the Next.js dev server                                      | `3000`    | No       |

## `INNOVATOR_DEFAULT_MODEL`

Sets the default LLM model for all API, CLI, and programmatic usage. Can be overridden at runtime via the `--model` CLI flag or the `model` field in API requests. See the [Custom Models guide](./guides/custom-models.md) for details.

```bash
INNOVATOR_DEFAULT_MODEL=gpt-5
```

## `INNOVATOR_API_KEY`

When set, all web API routes (`/api/investigate`, `/api/innovate`, `/api/auto`) require a matching `X-API-Key` header. Requests without the correct key receive a `401 Unauthorized` response.

Leave unset during local development to allow unauthenticated access. **Always set this in production** to prevent unauthorized usage of your Copilot quota.

```bash
INNOVATOR_API_KEY=my-secret-api-key
```

Example authenticated request:

```bash
curl -X POST http://localhost:3000/api/investigate \
  -H "Content-Type: application/json" \
  -H "X-API-Key: my-secret-api-key" \
  -d '{"subject": "quantum computing"}'
```

## `INNOVATOR_LLM_TIMEOUT_MS`

Maximum time in milliseconds to wait for an LLM response before timing out. Increase this if you experience timeouts with complex subjects or slower models.

```bash
INNOVATOR_LLM_TIMEOUT_MS=120000
```

## `INNOVATOR_EXTRA_MODELS`

Extend the built-in model allowlist with additional model identifiers. This is useful when new models become available through your Copilot subscription before they are added to Innovator's built-in list.

```bash
INNOVATOR_EXTRA_MODELS=gpt-5-turbo,claude-opus-4
```

## `PORT`

Port for the Next.js development server.

```bash
PORT=3001
```
