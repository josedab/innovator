---
id: configuration
title: Configuration
sidebar_position: 3
---

# Configuration

Innovator is configured via environment variables. Copy `.env.local.example` to `.env.local` in the project root and adjust values as needed.

## Environment Variables

| Variable                   | Description                                                             | Default                  | Required |
| -------------------------- | ----------------------------------------------------------------------- | ------------------------ | -------- |
| `INNOVATOR_DEFAULT_MODEL`  | LLM model used when none is specified at runtime                        | `gpt-4.1`                | No       |
| `INNOVATOR_API_KEY`        | API key to protect web API routes via `X-API-Key` header (see below)    | _unset_                  | No       |
| `INNOVATOR_API_KEYS`       | Comma-separated API keys for multi-key auth (`X-API-Key` or Bearer)     | _unset_                  | No       |
| `INNOVATOR_LLM_TIMEOUT_MS` | Timeout for each LLM request in milliseconds                            | `90000`                  | No       |
| `INNOVATOR_EXTRA_MODELS`   | Comma-separated list of additional model IDs to allow                   | _unset_                  | No       |
| `INNOVATOR_EMBED_API_KEY`  | API key for the `/api/embed` widget endpoint (via `X-Embed-Key` header) | _unset_                  | No       |
| `INNOVATOR_EMBED_ORIGINS`  | Comma-separated CORS origins for the `/api/embed` widget endpoint       | `*`                      | No       |
| `OPENAI_API_KEY`           | OpenAI API key for direct OpenAI provider (non-Copilot usage)           | _unset_                  | No       |
| `ANTHROPIC_API_KEY`        | Anthropic API key for direct Anthropic provider (non-Copilot usage)     | _unset_                  | No       |
| `OLLAMA_BASE_URL`          | Base URL for local Ollama instance                                      | `http://localhost:11434` | No       |
| `PLAYWRIGHT_BASE_URL`      | Base URL for Playwright E2E tests                                       | `http://localhost:3000`  | No       |
| `MCP_PORT`                 | Port for the MCP server SSE transport                                   | `3100`                   | No       |
| `GH_TOKEN`                 | GitHub token for Copilot SDK auth in non-interactive/CI environments    | _unset_                  | No       |
| `ALGOLIA_APP_ID`           | Algolia application ID for documentation search                         | `PLACEHOLDER`            | No       |
| `ALGOLIA_SEARCH_KEY`       | Algolia search-only API key for documentation search                    | `PLACEHOLDER`            | No       |
| `ALGOLIA_INDEX_NAME`       | Algolia index name for documentation search                             | `innovator`              | No       |
| `PORT`                     | Port for the Next.js dev server                                         | `3000`                   | No       |

## `INNOVATOR_DEFAULT_MODEL`

Sets the default LLM model for all API, CLI, and programmatic usage. Can be overridden at runtime via the `--model` CLI flag or the `model` field in API requests. See the [Custom Models guide](/docs/guides/custom-models) for details.

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

## `INNOVATOR_EMBED_API_KEY`

When set, the `/api/embed` widget endpoint requires a matching `X-Embed-Key` header. Requests without the correct key receive a `401 Unauthorized` response. Leave unset to allow open access to the embed endpoint (CORS restrictions from `INNOVATOR_EMBED_ORIGINS` still apply).

```bash
INNOVATOR_EMBED_API_KEY=my-embed-secret
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

### `GH_TOKEN`

GitHub personal access token used by the Copilot SDK when the GitHub CLI (`gh`) is not available — for example inside Docker containers, CI runners, or headless servers. When set, the SDK uses this token instead of the interactive `gh auth login` session.

```bash
GH_TOKEN=ghp_your_token
```

See the [Deployment guide](/docs/guides/deployment) for per-platform setup instructions.

## Website / Documentation

The Docusaurus documentation site uses [Algolia DocSearch](https://docsearch.algolia.com/) for full-text search. These variables configure the search widget.

### `ALGOLIA_APP_ID`

Your Algolia application ID. Defaults to `PLACEHOLDER` if not set (search will be non-functional).

```bash
ALGOLIA_APP_ID=your-app-id
```

### `ALGOLIA_SEARCH_KEY`

Algolia **search-only** API key (safe to expose in the browser). Do not use your admin key here.

```bash
ALGOLIA_SEARCH_KEY=your-search-api-key
```

### `ALGOLIA_INDEX_NAME`

Name of the Algolia index containing the crawled documentation. Defaults to `innovator`.

```bash
ALGOLIA_INDEX_NAME=innovator
```

## API Rate Limits & Security

The Next.js middleware (`apps/web/src/middleware.ts`) applies several security layers to all API routes. These are enforced at the edge before requests reach your route handlers.

### Rate Limiting

| Route           | Limit          | Window   | Notes                                              |
| --------------- | -------------- | -------- | -------------------------------------------------- |
| All `/api/*`    | 10 requests/IP | 1 minute | Global rate limit across all API endpoints         |
| `/api/auto`     | 3 requests/IP  | 1 minute | Stricter — each request triggers 10+ LLM calls     |
| `/api/innovate` | 5 requests/IP  | 1 minute | Stricter — each request triggers up to 9 LLM calls |

When a rate limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait.

### Concurrent Request Cap

Each IP address is limited to **2 simultaneous in-flight requests**. Additional requests while 2 are already processing receive a `429` response. This prevents a single client from monopolizing server resources.

### Body Size Limit

Request bodies are capped at **100 KB**. Requests exceeding this limit receive a `413 Payload Too Large` response. Mutation requests (`POST`, `PUT`, `PATCH`) must include a `Content-Length` header or they receive a `411 Length Required` response.

### Content Security Policy

Non-API routes receive a nonce-based `Content-Security-Policy` header that restricts script and style sources to `'self'` plus a per-request nonce. This mitigates cross-site scripting (XSS) attacks.

### Request Tracking

Every API response includes an `X-Request-ID` header (a UUID) for tracing requests through logs.

### Authentication

When `INNOVATOR_API_KEY` or `INNOVATOR_API_KEYS` is set, all `/api/*` routes require a valid key via the `X-API-Key` or `Authorization: Bearer` header. See the [API Key](#innovator_api_key) and [Multi-Key Auth](#innovator_api_keys) sections above.

### Self-Hosting Considerations

The built-in rate limiter uses an **in-memory Map** and is effective for single-instance deployments. In multi-instance environments (e.g., Vercel serverless, Kubernetes), each instance maintains its own map — making rate limits less effective. For production multi-instance deployments, consider:

- [Vercel's built-in rate limiting](https://vercel.com/docs/functions/ratelimit)
- [Upstash Redis-based rate limiting](https://upstash.com/docs/oss/sdks/ts/ratelimit/overview)
- A shared Redis store behind a custom middleware

## Build & Test Configuration

The monorepo uses shared configuration files at the repository root. Each package and app may extend these via local overrides.

### `tsconfig.base.json`

Shared TypeScript compiler options for the entire monorepo. All `packages/*/tsconfig.json` and `apps/*/tsconfig.json` files extend this base.

| Option             | Value     | Rationale                                                  |
| ------------------ | --------- | ---------------------------------------------------------- |
| `target`           | `ES2022`  | Modern runtime support for all packages                    |
| `module`           | `ESNext`  | ESM-first output for tree-shaking                          |
| `moduleResolution` | `Bundler` | Compatible with Next.js, Vite, and direct Node ESM         |
| `strict`           | `true`    | Full strict-mode type checking                             |
| `declaration`      | `true`    | Emit `.d.ts` files for cross-package type sharing          |
| `isolatedModules`  | `true`    | Required for monorepo safety with bundlers and transpilers |
| `sourceMap`        | `true`    | Enable source maps for debugging                           |

### `eslint.config.mjs`

Uses ESLint flat config format with TypeScript integration:

- **Parser:** `@typescript-eslint/parser` for `.ts`/`.tsx` files
- **Ignored directories:** `node_modules/`, `dist/`, `.next/`, `coverage/`, `website/`
- **Key rules:** Unused variables allowed when prefixed with `_` (underscore convention)
- **Prettier integration:** Formatting is handled by Prettier; ESLint focuses on code quality

Run linting with:

```bash
npm run lint
```

### `vitest.config.ts`

Unit and integration test runner for the monorepo:

- **Test files:** `packages/*/src/**/*.test.ts` and `apps/*/src/**/*.test.ts`
- **Environment:** `jsdom` for web application tests (React component testing)
- **Path alias:** `@` maps to `apps/web/src` for import convenience
- **Coverage provider:** `v8` with 35% minimum thresholds for lines, functions, and branches
- **Coverage reports:** `text` (terminal) and `json-summary`

Run tests with:

```bash
npm test                 # Run all tests
npm run test:coverage    # Run with coverage report
```

### `apps/web/playwright.config.ts`

End-to-end test configuration for the web application:

- **Browser:** Chromium only (single project)
- **Base URL:** `http://localhost:3000` (override with `PLAYWRIGHT_BASE_URL` env var)
- **Parallelism:** Fully parallel in local mode; single worker in CI
- **Retries:** 2 retries in CI, 0 locally
- **Traces:** Collected on first retry for debugging
- **Dev server:** Automatically starts via `npm run dev` in local mode; disabled in CI (expects pre-started server)

Run E2E tests with:

```bash
npm run test:e2e         # Run all E2E tests
npm run test:e2e:ui      # Run with interactive UI
```
