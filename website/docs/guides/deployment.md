---
id: deployment
title: Deployment
sidebar_position: 5
---

# Deployment

The first production release supports one deployment profile: a **headless, single-process, single-tenant API** running as one Docker Compose replica.

The browser UI and experimental SaaS surfaces are intentionally unavailable in production and return `404`.

## Runtime Requirements

- Node.js 22+ for local builds and repository tooling
- Next.js 16.2.12
- GitHub Copilot access through `GH_TOKEN`
- Persistent Docker volumes for `/home/innovator/.innovator` and `/home/innovator/.copilot`
- An authenticated TLS reverse proxy in front of the service

Root dependency overrides pin `postcss` 8.5.23 and `sharp` 0.35.3.

## Required Environment

Production startup requires all of these variables:

| Variable                       | Requirement                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------- |
| `NODE_ENV`                     | Exactly `production`                                                              |
| `INNOVATOR_DEPLOYMENT_PROFILE` | Exactly `single-tenant`                                                           |
| `INNOVATOR_API_KEYS`           | One or more unique comma-separated keys; every key must be at least 32 characters |
| `GH_TOKEN`                     | Non-empty token used by the production Copilot provider                           |

Generate a key with at least 32 characters:

```bash
export INNOVATOR_CLIENT_API_KEY="$(openssl rand -hex 32)"
export INNOVATOR_API_KEYS="$INNOVATOR_CLIENT_API_KEY"
export GH_TOKEN="$(gh auth token)"
```

For rotation, add a second unique key to the comma-separated list, deploy, update clients, and then remove the old key.

:::caution Legacy key
`INNOVATOR_API_KEY` is a legacy single-key setting. Do not configure it together with `INNOVATOR_API_KEYS`; that is a startup error. Production must use `INNOVATOR_API_KEYS`.
:::

## Start with Docker Compose

From the repository root:

```bash
export INNOVATOR_CLIENT_API_KEY="$(openssl rand -hex 32)"
export INNOVATOR_API_KEYS="$INNOVATOR_CLIENT_API_KEY"
export GH_TOKEN="$(gh auth token)"

docker compose config --quiet
docker compose up -d --build
docker compose ps
```

The Compose service:

- binds `127.0.0.1:3000:3000`
- requires `INNOVATOR_API_KEYS` and `GH_TOKEN`
- sets `NODE_ENV=production`
- sets `INNOVATOR_DEPLOYMENT_PROFILE=single-tenant`
- mounts `innovator_data` at `/home/innovator/.innovator`
- mounts `copilot_data` at `/home/innovator/.copilot`
- runs with a read-only root filesystem and a restricted `/tmp`
- enables `no-new-privileges`
- rotates JSON logs at 10 MB with five retained files
- allows a two-minute graceful shutdown period
- applies CPU and memory limits

PostgreSQL and pgAdmin are not included. The PostgreSQL adapter is not implemented for this production profile.

## Reverse Proxy and Network Boundary

**Never expose port 3000 directly.** It is bound to loopback so a TLS reverse proxy on the same host can be the only network entry point.

The proxy must:

1. Terminate TLS.
2. Authenticate callers or forward a caller-supplied API key.
3. Inject or forward one configured Innovator key as `X-API-Key` or `Authorization: Bearer`.
4. Preserve long-lived streaming responses and allow at least a 180-second upstream timeout.

Example Caddy upstream configuration that injects a key held by the proxy:

```caddyfile
api.example.com {
  # Configure your organization-approved client authentication here.

  reverse_proxy 127.0.0.1:3000 {
    header_up X-API-Key {$INNOVATOR_UPSTREAM_API_KEY}
    transport http {
      response_header_timeout 180s
    }
  }
}
```

This snippet is incomplete until the comment is replaced with a working authentication policy. Do not deploy it as an unauthenticated public proxy.

Set `INNOVATOR_UPSTREAM_API_KEY` in the proxy environment to one entry from `INNOVATOR_API_KEYS`. If clients send their own Innovator key, forward `X-API-Key` or `Authorization` unchanged instead of injecting a shared key.

## Production Routes

### Public probes

| Method | Route      | Purpose                                                                  |
| ------ | ---------- | ------------------------------------------------------------------------ |
| GET    | `/healthz` | Liveness: confirms the process can answer HTTP                           |
| GET    | `/readyz`  | Readiness: validates configuration, writable state, and Copilot provider |

### Protected API

| Method | Route                 |
| ------ | --------------------- |
| GET    | `/api/health`         |
| GET    | `/api/angles`         |
| GET    | `/api/presets`        |
| POST   | `/api/investigate`    |
| POST   | `/api/innovate`       |
| POST   | `/api/auto`           |
| POST   | `/api/nl-innovate`    |
| POST   | `/api/v1/investigate` |
| POST   | `/api/v1/innovate`    |
| POST   | `/api/v1/auto`        |
| GET    | `/api/v1/openapi`     |

All protected routes require a configured key. OAuth, billing, tenant/workspace administration, uploads, webhooks, integrations, collaboration, dynamic API keys, the portal, and every other route return `404` in production. A method other than the one listed for an allowlisted path returns `405`.

## Health Checks

```bash
# Liveness: no API key
curl --fail http://127.0.0.1:3000/healthz

# Readiness: no API key; returns 503 when config, storage, or Copilot is not ready
curl --fail http://127.0.0.1:3000/readyz

# Detailed component health: authenticated
curl --fail \
  -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" \
  http://127.0.0.1:3000/api/health
```

Use `/healthz` for process restart decisions and `/readyz` before sending traffic. Use `/api/health` for operator diagnostics, not as a public probe.

## State, Replicas, and Backups

Run **exactly one replica**. Rate limiting, metering, and runtime coordination are process-local. Application state lives in `innovator_data`; Copilot session state lives in `copilot_data`. Horizontal scaling or active-active replicas can bypass limits and diverge state.

Back up the named volume before upgrades. Docker Compose commonly prefixes the actual volume name with the project name; find it with:

```bash
docker volume ls --filter label=com.docker.compose.project
```

Back up both volumes, replacing the names with those reported by Docker:

```bash
docker run --rm \
  -v innovator_innovator_data:/data:ro \
  -v "$PWD":/backup \
  alpine \
  tar -czf /backup/innovator-data.tgz -C /data .

docker run --rm \
  -v innovator_copilot_data:/data:ro \
  -v "$PWD":/backup \
  alpine \
  tar -czf /backup/copilot-data.tgz -C /data .
```

Restore only while the application is stopped:

```bash
docker compose down

docker run --rm \
  -v innovator_innovator_data:/data \
  -v "$PWD":/backup \
  alpine \
  sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /backup/innovator-data.tgz -C /data'

docker run --rm \
  -v innovator_copilot_data:/data \
  -v "$PWD":/backup \
  alpine \
  sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -xzf /backup/copilot-data.tgz -C /data'

docker compose up -d
curl --fail http://127.0.0.1:3000/readyz
```

Test restore procedures on a non-production host. A backup is not complete until it has been restored successfully.

## Upgrades and Shutdown

```bash
docker compose up -d --build
```

Compose allows two minutes for shutdown so in-flight pipelines can finish. Monitor logs and readiness before declaring the upgrade complete:

```bash
docker compose logs --tail=100 innovator
curl --fail http://127.0.0.1:3000/readyz
```

## Unsupported Production Paths

The following are intentionally unsupported for the first production profile:

- Vercel and other serverless runtimes
- horizontal scaling or multiple replicas
- a browser UI deployment
- Kubernetes deployments that create more than one pod
- PostgreSQL/pgAdmin-backed deployments
- production OAuth, billing, tenant/workspace administration, uploads, webhooks, integrations, collaboration, dynamic API keys, or portal routes

Do not treat `vercel.json`, development UI routes, or experimental modules as recommended production paths.

## Release and Supply-Chain Gates

- `npm run audit:production` audits runtime dependencies and fails on any production advisory.
- Root `npm run build` and `npm run typecheck` cover all supported workspaces.
- CI validates Docker Compose and builds the production image.
- Release automation runs only after CI succeeds for the exact `main` revision being released.
