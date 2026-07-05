---
id: monitoring
title: Production Monitoring
sidebar_position: 19
---

# Production Monitoring

The supported production profile is a headless, single-process, single-tenant API. Monitor it through the three supported health routes, container logs, reverse-proxy metrics, and the persistent volume.

## Health Endpoints

| Route         | Auth    | Purpose                                                                               | Healthy response |
| ------------- | ------- | ------------------------------------------------------------------------------------- | ---------------- |
| `/healthz`    | Public  | Liveness: confirms the process can answer HTTP                                        | `200`            |
| `/readyz`     | Public  | Readiness: validates configuration, writable state, and Copilot provider availability | `200`            |
| `/api/health` | API key | Detailed component-level health for operator diagnostics                              | `200` or `503`   |

### Liveness

Use `/healthz` for Docker and process restart decisions:

```bash
curl --fail https://api.example.com/healthz
```

A failed liveness check means the process is unavailable. The check deliberately does not validate credentials or state storage.

### Readiness

Use `/readyz` before routing traffic:

```bash
curl --fail https://api.example.com/readyz
```

Readiness returns `503` when the production environment is invalid, state storage is not writable, or the Copilot provider fails a live ping, authentication-status check, or model lookup. Common causes include:

Provider checks are single-flight and cached briefly, so public readiness polling does not stop active sessions or create a new Copilot process per request.

- missing or invalid `INNOVATOR_DEPLOYMENT_PROFILE`
- missing, short, or duplicate `INNOVATOR_API_KEYS`
- both `INNOVATOR_API_KEY` and `INNOVATOR_API_KEYS` being set
- missing `GH_TOKEN`
- an unavailable or read-only `innovator_data` or `copilot_data` mount

### Detailed Health

`/api/health` is protected:

```bash
curl --fail \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  https://api.example.com/api/health
```

Do not expose the detailed report as a public uptime endpoint.

## Recommended Checks

| Signal                  | Source                       | Suggested alert                                     |
| ----------------------- | ---------------------------- | --------------------------------------------------- |
| Process unavailable     | `/healthz`                   | Two consecutive failures                            |
| Instance not ready      | `/readyz`                    | Any sustained `503` after startup                   |
| Component unhealthy     | `/api/health`                | `503` or reported unhealthy component               |
| Elevated API errors     | Reverse proxy/container logs | Sustained increase in `5xx`                         |
| Authentication failures | Reverse proxy/container logs | Unexpected increase in `401` or configuration `503` |
| Rate limiting           | Reverse proxy/container logs | Sustained increase in `429`                         |
| LLM latency             | Request duration logs        | p95 above the operator's service objective          |
| Volume capacity         | Docker host filesystem       | Free space below the host's safety threshold        |
| Backup freshness        | Backup system                | Either production volume is outside the target RPO  |

## Docker Compose Logs

Compose uses the `json-file` logging driver with 10 MB files and five retained files.

```bash
docker compose logs --tail=200 innovator
docker compose logs --follow innovator
```

Application logs are written to stdout/stderr. Forward them from the Docker host to your approved log platform rather than installing agents inside the read-only application container.

Useful fields include:

| Field        | Description                    |
| ------------ | ------------------------------ |
| `route`      | API route path                 |
| `requestId`  | Request correlation identifier |
| `durationMs` | Request or pipeline duration   |
| `error`      | Sanitized error message        |

Production logs omit development stack detail. Never log API keys or `GH_TOKEN`.

## Reverse-Proxy Monitoring

Monitor the TLS reverse proxy because it is the production network boundary:

- TLS certificate expiry and handshake failures
- authentication failures
- request count and status distribution
- upstream connection errors
- request and streaming duration
- bytes sent/received

Allow at least a 180-second upstream timeout for long-running SSE API responses. Preserve streaming rather than buffering the full response.

## Single-Replica Constraint

Run exactly one application replica. Rate limiting, metering, and runtime coordination are process-local, so multiple replicas make limits inconsistent and can diverge state.

Do not use Vercel/serverless monitoring assumptions or aggregate several active replicas as one service. Horizontal scaling is unsupported for this profile.

## State and Backup Monitoring

Production application state is stored in `innovator_data`; Copilot session state is stored in `copilot_data`.

Monitor:

- volume attachment at container startup
- host disk capacity and inode usage
- backup success and age
- periodic restore-test success

See [Deployment: State, Replicas, and Backups](/docs/guides/deployment#state-replicas-and-backups) for backup and restore commands.

## Development-Only Observability Surfaces

Routes such as `/api/analytics`, `/api/observatory`, `/api/monitor`, `/api/metrics`, webhook management, dashboards, and other SaaS/administration endpoints are development/experimental only and return `404` in production. Do not build production alerts around them.

Core-library APIs such as cost tracking may still be useful in custom development integrations, but they are not supported production HTTP monitoring endpoints in this release.

## Monitoring Checklist

- [ ] `/healthz` liveness polling configured
- [ ] `/readyz` readiness polling configured
- [ ] Authenticated `/api/health` diagnostic check available to operators
- [ ] TLS reverse-proxy metrics and certificate expiry monitored
- [ ] Container logs forwarded and retained
- [ ] `401`, `429`, and `5xx` rates alerted
- [ ] Exactly one application replica running
- [ ] `innovator_data` and `copilot_data` capacity monitored
- [ ] Volume backups scheduled and restore-tested
- [ ] Port 3000 unreachable from external networks
