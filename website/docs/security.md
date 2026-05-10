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

- **Authentication** — Optional API key auth via `INNOVATOR_API_KEY` or `INNOVATOR_API_KEYS` (comma-separated). When set, all `/api/*` routes require a valid key in the `X-API-Key` header or `Authorization: Bearer` header.
- **Rate limiting** — Per-route and global rate limits enforced in `middleware.ts`. Configurable window and max requests.
- **Body size limits** — Request bodies are capped at 100 KB to prevent resource exhaustion.
- **Concurrent request cap** — Limits simultaneous in-flight requests per IP.
- **Security headers** — CSP, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, and Permissions-Policy headers set on all responses.

### Input Validation

- **Zod schemas** — All API request bodies are validated with Zod schemas at the route level (see [ADR-0006](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0006-zod-schema-validation-at-all-boundaries.md)).
- **LLM output validation** — AI responses are parsed and validated with Zod schemas before being returned to clients.
- **Subject length limits** — Investigation subjects are capped at 5,000 characters.

### Prompt Injection Defense

- **Input sanitization** — `sanitizeUserInput()` strips known injection patterns before prompt interpolation.
- **Delimiter wrapping** — `wrapUserInput()` wraps user text with clear delimiters so the LLM can distinguish user input from system instructions.
- **Output sanitization** — `sanitizeLlmOutput()` cleans LLM responses before they're used in subsequent prompts (see [ADR-0011](https://github.com/josedab/innovator/blob/main/docs/adr/ADR-0011-prompt-injection-defense.md)).

### LLM Permissions

- **Read-only mode** — The Copilot SDK client operates with restricted permissions: shell, write, and custom-tool requests are denied. Only read operations are allowed.

## Security Best Practices

When deploying Innovator, follow these practices:

- **Always set `INNOVATOR_API_KEY`** in production to protect API routes
- **Rotate API keys** periodically
- **Use HTTPS** via reverse proxy or platform (required for CSP headers and service workers)
- **Monitor access logs** for unusual Copilot quota usage
- **Scope `gh auth` credentials** to minimum required permissions
- **Use `GH_TOKEN`** with limited scopes for Docker and CI deployments
- **Run `npm audit`** regularly to check for dependency vulnerabilities
- **Keep dependencies updated** — the CI pipeline includes `npm outdated` checks

## Dependency Security

- **CodeQL analysis** runs weekly on JavaScript/TypeScript code via GitHub Actions
- **npm audit** is included in the CI pipeline
- **Dependabot** (or equivalent) can be enabled for automated dependency updates

See the [Deployment Guide](/docs/guides/deployment) for detailed security configuration.
