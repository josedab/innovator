---
id: configuration
title: Configuration
sidebar_position: 3
---

# Configuration

Innovator is configured via environment variables. Copy `.env.local.example` to `.env.local` in the project root and adjust values as needed.

## Environment Variables

| Variable                   | Description                                                              | Default   | Required |
| -------------------------- | ------------------------------------------------------------------------ | --------- | -------- |
| `INNOVATOR_DEFAULT_MODEL`  | LLM model used when none is specified at runtime                         | `gpt-4.1` | No       |
| `INNOVATOR_API_KEY`        | API key to protect web API routes via `X-API-Key` header (see below)     | _unset_   | No       |
| `INNOVATOR_API_KEYS`       | Comma-separated API keys for multi-key auth (`X-API-Key` or Bearer)      | _unset_   | No       |
| `INNOVATOR_LLM_TIMEOUT_MS` | Timeout for each LLM request in milliseconds                             | `90000`   | No       |
| `INNOVATOR_EXTRA_MODELS`   | Comma-separated list of additional model IDs to allow                    | _unset_   | No       |
| `INNOVATOR_EMBED_ORIGINS`  | Comma-separated CORS origins for the `/api/embed` widget endpoint        | `*`       | No       |
| `OPENAI_API_KEY`           | OpenAI API key for direct OpenAI provider (non-Copilot usage)            | _unset_   | No       |
| `ANTHROPIC_API_KEY`        | Anthropic API key for direct Anthropic provider (non-Copilot usage)      | _unset_   | No       |
| `OLLAMA_BASE_URL`          | Base URL for local Ollama instance                                       | `http://localhost:11434` | No |
| `PLAYWRIGHT_BASE_URL`     | Base URL for Playwright E2E tests                                        | `http://localhost:3000`  | No |
| `MCP_PORT`                | Port for the MCP server SSE transport                                    | `3100`   | No       |
| `PORT`                    | Port for the Next.js dev server                                          | `3000`   | No       |

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

## `INNOVATOR_API_KEYS`

When set, enables multi-key authentication. Provide a comma-separated list of valid API keys. Clients authenticate via `Authorization: Bearer <key>` or `X-API-Key: <key>` headers. Each key is assigned a positional identifier (`key-0`, `key-1`, etc.) for audit logging.

Takes precedence over `INNOVATOR_API_KEY` when both are set.

```bash
INNOVATOR_API_KEYS=team-key-abc,ci-key-xyz,partner-key-123
```

## `INNOVATOR_EMBED_ORIGINS`

Comma-separated list of allowed CORS origins for the `/api/embed` widget endpoint. Set to `*` (the default) to allow all origins, or restrict to specific domains for production deployments.

```bash
INNOVATOR_EMBED_ORIGINS=https://mysite.com,https://docs.mysite.com
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

## Alternative LLM Providers

By default, Innovator uses the GitHub Copilot SDK. If you want to use a different LLM provider directly (without Copilot), set the corresponding environment variable.

### `OPENAI_API_KEY`

API key for direct OpenAI API access. When set, enables the OpenAI provider as a fallback for non-Copilot usage.

```bash
OPENAI_API_KEY=sk-...
```

### `ANTHROPIC_API_KEY`

API key for direct Anthropic API access. When set, enables the Anthropic provider.

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

### `OLLAMA_BASE_URL`

Base URL for a local [Ollama](https://ollama.ai) instance. Defaults to `http://localhost:11434` when not set.

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

## Testing & Development

### `PLAYWRIGHT_BASE_URL`

Base URL for Playwright E2E tests. Used by `apps/web/playwright.config.ts`. CI environments may need to customize this if the dev server runs on a different host or port.

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000
```

### `MCP_PORT`

Port for the MCP server when using SSE transport (`npx @innovator/mcp-server --sse`).

```bash
MCP_PORT=3100
```
