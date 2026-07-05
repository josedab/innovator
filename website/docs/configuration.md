---
id: configuration
title: Configuration
sidebar_position: 3
---

# Configuration

Innovator is configured via environment variables. Copy `.env.local.example` to `.env.local` in the project root and adjust values as needed.

Production uses a strict **headless, single-process, single-tenant** profile. Development may enable the browser UI and experimental surfaces, but those surfaces return `404` in production.

## Environment Variables

### Required in production

| Variable                       | Required value                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `NODE_ENV`                     | `production`                                                                           |
| `INNOVATOR_DEPLOYMENT_PROFILE` | `single-tenant`                                                                        |
| `INNOVATOR_API_KEYS`           | One or more unique comma-separated keys; every key must contain at least 32 characters |
| `GH_TOKEN`                     | Non-empty GitHub token for the production Copilot provider                             |

### Optional or development-only

| Variable                   | Description                                        | Default                   |
| -------------------------- | -------------------------------------------------- | ------------------------- |
| `INNOVATOR_DEFAULT_MODEL`  | LLM model used when none is specified              | `gpt-4.1`                 |
| `INNOVATOR_API_KEY`        | Legacy single key; development/compatibility only  | _unset_                   |
| `INNOVATOR_LLM_TIMEOUT_MS` | Timeout for each LLM request in milliseconds       | `90000`                   |
| `INNOVATOR_EXTRA_MODELS`   | Comma-separated additional model IDs               | _unset_                   |
| `MCP_ALLOWED_ROOT`         | Filesystem boundary for MCP code analysis          | Current working directory |
| `PORT`                     | Next.js server port                                | `3000`                    |
| `PLAYWRIGHT_BASE_URL`      | Base URL for Playwright E2E tests                  | `http://localhost:3000`   |
| `OPENAI_API_KEY`           | Development/experimental direct OpenAI provider    | _unset_                   |
| `ANTHROPIC_API_KEY`        | Development/experimental direct Anthropic provider | _unset_                   |
| `OLLAMA_BASE_URL`          | Development/experimental local Ollama provider     | `http://localhost:11434`  |
| `INNOVATOR_EMBED_API_KEY`  | Development-only `/api/embed` key                  | _unset_                   |
| `INNOVATOR_EMBED_ORIGINS`  | Development-only `/api/embed` CORS origins         | `*`                       |

OAuth, billing, PostgreSQL, Copilot Extension, portal, integration, and similar variables configure development/experimental code only. Their routes are not part of the production allowlist. The PostgreSQL adapter is not implemented for the first production profile.

## `INNOVATOR_DEFAULT_MODEL`

Sets the default LLM model for all API, CLI, and programmatic usage. Can be overridden at runtime via the `--model` CLI flag or the `model` field in API requests. See the [Custom Models guide](/docs/guides/custom-models) for details.

```bash
INNOVATOR_DEFAULT_MODEL=gpt-5
```

## `INNOVATOR_API_KEY`

Legacy single-key authentication for development and compatibility. When set, API routes require a matching key.

Leave unset during local development to allow anonymous requests. Do not combine it with `INNOVATOR_API_KEYS`; production must use the plural variable.

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

Required in production. Provide one or more comma-separated API keys. Every key must be unique and at least 32 characters long. Clients authenticate with `X-API-Key` or a bearer-scheme `Authorization` header. Each key is assigned a positional identifier (`key-0`, `key-1`, etc.) for logging.

Configuring both `INNOVATOR_API_KEYS` and legacy `INNOVATOR_API_KEY` is an error.

```bash
INNOVATOR_API_KEYS=replace-with-a-unique-32-character-or-longer-key
```

## `INNOVATOR_EMBED_API_KEY`

Development/experimental only. `/api/embed` returns `404` in production.

```bash
INNOVATOR_EMBED_API_KEY=my-embed-secret
```

## `INNOVATOR_EMBED_ORIGINS`

Development/experimental comma-separated CORS origins for `/api/embed`. The endpoint returns `404` in production.

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

Alternative providers are development/experimental options. The first production profile requires `GH_TOKEN` and the GitHub Copilot provider.

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

### `MCP_ALLOWED_ROOT`

Filesystem boundary for MCP code-analysis tools. It defaults to the MCP process working directory. The MCP server uses stdio only; `--sse` fails closed and there is no `MCP_PORT`.

```bash
MCP_ALLOWED_ROOT=/absolute/path/to/repository
```

### `GH_TOKEN`

GitHub token used by the Copilot SDK in Docker, CI, and headless environments. It is required in the production profile.

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

The Next.js proxy (`apps/web/src/proxy.ts`) applies production route policy, authentication, rate limiting, and security headers before requests reach route handlers.

### Rate Limiting

| Route           | Limit          | Window   | Notes                                              |
| --------------- | -------------- | -------- | -------------------------------------------------- |
| All `/api/*`    | 10 requests/IP | 1 minute | Global rate limit across all API endpoints         |
| `/api/auto`     | 3 requests/IP  | 1 minute | Stricter — each request triggers 10+ LLM calls     |
| `/api/innovate` | 5 requests/IP  | 1 minute | Stricter — each request triggers up to 9 LLM calls |

When a rate limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header indicating how many seconds to wait.

### LLM Backpressure

Copilot calls share a process-wide semaphore. `INNOVATOR_LLM_MAX_CONCURRENCY` defaults to `2`, and `INNOVATOR_LLM_MAX_QUEUE` defaults to `16`. The request timeout includes time spent waiting for a permit.

### Body Size Limit

Supported JSON request bodies are capped at **100 KB using the actual streamed byte count**. Requests exceeding this limit receive `413 Payload Too Large`. Chunked requests are supported; `Content-Length` is used only for an early rejection when present.

### Content Security Policy

Non-API routes receive a nonce-based `Content-Security-Policy` header that restricts script and style sources to `'self'` plus a per-request nonce. This mitigates cross-site scripting (XSS) attacks.

### Request Tracking

Every API response includes an `X-Request-ID` header (a UUID) for tracing requests through logs.

### Authentication

Production always requires `INNOVATOR_API_KEYS`, and every supported `/api/*` route requires a valid key via `X-API-Key` or `Authorization: Bearer`. Only `/healthz` and `/readyz` are public.

### Self-Hosting Considerations

The rate limiter, metering, and runtime state are process-local. Run one production replica only. Vercel/serverless deployments and horizontal scaling are unsupported for the first production profile.

## `.innovator/` Directory

Innovator stores application state under `/home/innovator/.innovator` and Copilot session state under `/home/innovator/.copilot`. The production container backs these with `innovator_data` and `copilot_data`. Local development modules may also create repository-local `.innovator/` state.

### Directory Structure

```
.innovator/
└── workspaces/
    ├── 00023d1f-3fd0-4f5b-bad6-177e97a50076.json
    ├── 2070ad7f-115f-43e1-b4c6-9e6dc78a30d6.json
    └── ...  (one JSON file per workspace, UUID-named)
```

### Workspace JSON Format

Each file contains a serialized workspace object:

```json
{
  "id": "00023d1f-3fd0-4f5b-bad6-177e97a50076",
  "name": "Team",
  "createdAt": "2026-05-03T22:14:33.862Z",
  "updatedAt": "2026-05-03T22:14:33.870Z",
  "ownerId": "owner",
  "members": [
    {
      "userId": "owner",
      "displayName": "Owner",
      "role": "admin",
      "joinedAt": "2026-05-03T22:14:33.862Z"
    }
  ],
  "sessionIds": [],
  "sharedPresetIds": [],
  "sharedAngleIds": [],
  "tags": [],
  "activityFeed": [...]
}
```

Key fields: `id` (UUID), `name`, `members` (with roles: `admin`, `contributor`, `viewer`), `sessionIds` (linked innovation sessions), and `activityFeed` (audit log of workspace events).

### `.gitignore`

The `.innovator/` directory is included in `.gitignore` by default. Workspace state is local and should not be committed — it contains user-specific data and UUIDs that differ across environments.

### Backup & Restore

For local development, copy the entire relevant `.innovator/` directory. For production, back up and restore both Docker volumes while the service is stopped. See the [Deployment guide](/docs/guides/deployment#state-replicas-and-backups).

### Resetting Workspace State

This operation is for local development only. To reset local workspace state, delete the relevant `.innovator/` directory:

```bash
rm -rf .innovator/
```

Do not delete the production volume as a troubleshooting shortcut; restore a known-good backup instead.

## Build & Test Configuration

The monorepo uses shared configuration files at the repository root. Each package and app may extend these via local overrides.

The supported runtime baseline is Node.js 22+, Next.js 16.2.12, `postcss` 8.5.23, and `sharp` 0.35.3.

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

- **Test files:** `packages/*/src/**/*.test.ts` and `apps/*/src/**/*.test.{ts,tsx}`
- **Environment:** `jsdom` for web application tests (React component testing)
- **Path alias:** `@` maps to `apps/web/src` for import convenience
- **Coverage provider:** `v8` with thresholds of 72% lines, 73% functions, and 58% branches
- **Coverage reports:** `text` (terminal) and `lcov`

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
