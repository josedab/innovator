---
id: security
title: Security Policy
---

# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please use one of the following methods:

### GitHub Private Security Advisories (Preferred)

1. Go to the [Security Advisories](https://github.com/josedab/innovator/security/advisories) tab of the repository
2. Click **"Report a vulnerability"**
3. Fill in the details of the vulnerability

GitHub will notify the maintainers privately, and we can collaborate on a fix before public disclosure.

### Email

If you prefer email, contact the maintainers at the email address listed in the repository's profile.

## Response Timeline

| Stage              | Target          |
| ------------------ | --------------- |
| Acknowledgment     | Within 48 hours |
| Initial assessment | Within 1 week   |
| Fix and disclosure | Within 30 days  |

## Supported Versions

| Version | Supported |
| ------- | --------- |
| Latest  | ✅        |

## Scope

This policy applies to the Innovator codebase and its official distributions. Third-party dependencies should be reported to their respective maintainers.

## Security Architecture

Innovator applies multiple layers of security throughout the stack:

### API Security

- **Production authentication** — `INNOVATOR_API_KEYS` is required. It must contain one or more unique comma-separated keys, each at least 32 characters. Every supported `/api/*` route requires `X-API-Key` or `Authorization: Bearer`.
- **Legacy key isolation** — `INNOVATOR_API_KEY` is a legacy development/compatibility setting and must not be combined with `INNOVATOR_API_KEYS`.
- **Public probes only** — `/healthz` and `/readyz` are the only unauthenticated production routes. `/api/health` is authenticated and returns detailed component health.
- **Production allowlist** — Middleware returns `404` for the browser UI and non-production API surfaces, including OAuth, billing, tenant/workspace administration, uploads, webhooks, integrations, collaboration, dynamic key management, and the portal.
- **Rate limiting** — Fixed per-route and global limits are enforced in `proxy.ts`.
- **Body size limits** — Supported JSON routes enforce a 100 KB streamed-byte limit, including chunked requests.
- **LLM backpressure** — A process-wide semaphore bounds active Copilot sessions and the wait queue.
- **No Copilot built-in tools** — One-shot generation sessions expose no filesystem, shell, or MCP tools; prompts cannot ask the SDK to read runtime files.
- **Security headers** — CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy headers set on all responses.
- **Single-replica boundary** — Rate limiting, metering, and runtime state are process-local. Horizontal scaling and serverless deployment are unsupported.

### Input Validation

- **Zod schemas** — All API request bodies are validated with Zod schemas at the route level (see [ADR-0006](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0006-zod-schema-validation-at-all-boundaries.md)).
- **LLM output validation** — AI responses are parsed and validated with Zod schemas before being returned to clients.
- **Subject length limits** — Investigation subjects are capped at 500 characters; natural-language orchestration prompts are capped at 5,000.

### Prompt Injection Defense

- **Input sanitization** — `sanitizeUserInput()` strips known injection patterns before prompt interpolation.
- **Delimiter wrapping** — `wrapUserInput()` wraps user text with clear delimiters so the LLM can distinguish user input from system instructions.
- **Output sanitization** — `sanitizeLlmOutput()` cleans LLM responses before they're used in subsequent prompts (see [ADR-0011](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0011-prompt-injection-defense.md)).

### LLM Permissions

- **Read-only mode** — The Copilot SDK client operates with restricted permissions: shell, write, and custom-tool requests are denied. Only read operations are allowed.

### MCP Filesystem Boundary

- **stdio only** — The MCP server does not expose a network listener; `--sse` fails closed.
- **Restricted paths** — Filesystem tools resolve real paths and reject targets outside `MCP_ALLOWED_ROOT`, which defaults to the process working directory.
- **Bounded scans** — `innovate-from-code.maxFiles` is capped at `1000`.

## Security Best Practices

When deploying Innovator, follow these practices:

- **Set all required production variables**: `NODE_ENV=production`, `INNOVATOR_DEPLOYMENT_PROFILE=single-tenant`, `INNOVATOR_API_KEYS`, and `GH_TOKEN`
- **Rotate API keys** with a staged overlap using two unique keys
- **Use an authenticated TLS reverse proxy** that injects or forwards the API key
- **Never expose port 3000 directly**; Docker Compose binds it to `127.0.0.1`
- **Run exactly one replica**
- **Back up and test restoration of both `innovator_data` and `copilot_data`**
- **Monitor access logs** for unusual Copilot quota usage
- **Scope `GH_TOKEN`** to the minimum permissions required by the Copilot provider
- **Run `npm run audit:production`** before deployment
- **Keep dependencies updated** — review the repository's weekly Dependabot pull requests

## Dependency Security

- **CodeQL analysis** runs weekly on JavaScript/TypeScript code via GitHub Actions
- **Production dependency policy** — `npm run audit:production` audits runtime dependencies and fails on any production advisory
- **Build coverage** — root build and typecheck commands cover all supported production workspaces
- **Container validation** — CI validates Docker Compose and builds the production image
- **Release gating** — releases run only after CI succeeds for the exact `main` revision
- **Dependabot** opens weekly dependency update pull requests

See the [Deployment Guide](/docs/guides/deployment) for detailed security configuration.
