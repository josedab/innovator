# ADR-0010: Defense-in-Depth API Security

## Status

Accepted

## Context

Innovator's API routes proxy user requests to LLM providers, consuming rate-limited and potentially costly resources (Copilot subscription quota, OpenAI API credits). Without protection, the API is vulnerable to:

- **Denial of Service** — A single client flooding endpoints could exhaust LLM quota for all users.
- **Resource exhaustion** — The `/api/auto` endpoint triggers 10+ LLM calls per request. A burst of auto requests could overwhelm the backend.
- **Unauthorized usage** — Public deployments without auth allow anyone to consume the operator's LLM quota.
- **Request smuggling** — Oversized or malformed request bodies could exploit parsing vulnerabilities.

The team needed a security model that works for both local development (minimal friction) and production deployment (hardened).

## Decision

We implement **layered security** in Next.js middleware (`apps/web/src/middleware.ts`):

### 1. API Key Authentication (Optional)

When `INNOVATOR_API_KEY` is set, all `/api/*` requests must include a matching `X-API-Key` header. `INNOVATOR_API_KEYS` supports comma-separated multi-key auth for team deployments. When unset, the API is open (suitable for local development).

### 2. Rate Limiting (Global + Per-Route)

Three in-memory rate limit maps enforce per-IP request caps:

- **Global**: 10 requests/minute per IP across all endpoints.
- **`/api/auto`**: 3 requests/minute per IP (each triggers 10+ LLM calls).
- **`/api/innovate`**: 5 requests/minute per IP (each triggers up to 9 LLM calls).

### 3. Concurrent Request Limiting

Maximum 2 simultaneous in-flight requests per IP, preventing a single client from monopolizing server resources with multiple long-running SSE streams.

### 4. Request Body Size Limits

`Content-Length` is required on all mutation requests (POST/PUT/PATCH) and capped at 100KB. Requests exceeding this are rejected before body parsing.

### 5. Content Security Policy

Non-API routes receive nonce-based CSP headers preventing XSS:

```
script-src 'self' 'nonce-<random>'; frame-ancestors 'none'; object-src 'none'
```

### 6. Security Headers

All API responses include `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, and request ID tracking via `X-Request-ID`.

### 7. CORS Policy

No CORS headers are set by default, enforcing same-origin access. The embeddable widget endpoint (`/api/embed`) has its own CORS configuration.

### Memory Safety

Rate limit maps are capped at 10,000 entries and periodically cleaned to prevent memory leaks. Expired entries are garbage-collected every 5 minutes.

## Consequences

**Positive:**

- **Proportional protection** — Rate limits are tuned per endpoint based on their LLM cost multiplier. Cheap endpoints (investigate: 1 call) have generous limits; expensive ones (auto: 10+ calls) are tightly controlled.
- **Opt-in auth** — Local development requires zero auth setup. Production deployments add a single env var.
- **Request tracing** — Every API response includes `X-Request-ID` for debugging and log correlation.
- **No external dependencies** — All security logic is in-process, requiring no Redis, no external rate limiter, no auth provider.

**Negative:**

- **In-memory rate limiting is per-instance** — In multi-instance deployments (Vercel serverless, Kubernetes), each instance maintains its own map. Rate limits are effectively multiplied by the instance count. The code includes a comment acknowledging this limitation and recommending Redis/Upstash for production.
- **No user-level rate limiting** — Limits are per-IP, not per-authenticated-user. Users behind shared IPs (corporate NAT) share rate limit buckets.
- **Timeout-based cleanup** — In-flight request tracking uses a 3-minute `setTimeout` as a safety net because Next.js middleware cannot hook into response completion. This is imprecise but prevents permanent counter leaks.
