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

## Security Best Practices

When deploying Innovator, follow these practices:

- **Always set `INNOVATOR_API_KEY`** in production to protect API routes
- **Rotate API keys** periodically
- **Use HTTPS** via reverse proxy or platform
- **Monitor access logs** for unusual Copilot quota usage
- **Scope `gh auth` credentials** to minimum required permissions
- **Use `GH_TOKEN`** with limited scopes for Docker deployments

See the [Deployment Guide](/docs/guides/deployment) for detailed security configuration.
