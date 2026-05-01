---
id: deployment
title: Deployment
sidebar_position: 5
---

# Deployment

This guide covers deploying the Innovator web app to production.

## Prerequisites

Before deploying, ensure:

1. **GitHub CLI** (`gh`) is authenticated on the deployment target — the Copilot SDK requires it
2. **GitHub Copilot subscription** is active for the authenticated account
3. **Node.js 20+** is available in the runtime

## Environment Variables

Set these in your deployment platform's environment configuration:

| Variable                   | Required | Description                                    |
| -------------------------- | -------- | ---------------------------------------------- |
| `INNOVATOR_DEFAULT_MODEL`  | No       | Default LLM model (default: `gpt-4.1`)         |
| `INNOVATOR_API_KEY`        | **Yes**  | Protects API routes — always set in production |
| `INNOVATOR_LLM_TIMEOUT_MS` | No       | LLM timeout in ms (default: `90000`)           |
| `INNOVATOR_EXTRA_MODELS`   | No       | Additional model IDs (comma-separated)         |
| `PORT`                     | No       | Server port (default: `3000`)                  |

:::caution
**Always set `INNOVATOR_API_KEY` in production.** Without it, anyone with access to your deployment URL can consume your Copilot quota.
:::

See the [Configuration Reference](../configuration.md) for full details on each variable.

## Vercel

### Setup

1. Import the repository in the [Vercel dashboard](https://vercel.com/new)
2. Set the **Root Directory** to `apps/web`
3. Set the **Build Command** to `npm run build` (from the workspace root)
4. Set the **Output Directory** to `.next`
5. Add environment variables (`INNOVATOR_API_KEY`, etc.) in the project settings

### Limitations

The Copilot SDK requires the GitHub CLI for authentication. Vercel's serverless functions do not include `gh` by default. You may need to:

- Use Vercel's **Edge Functions** or a custom runtime that includes `gh`
- Pre-authenticate and pass tokens via environment variables

:::note
Vercel deployment requires the Copilot SDK to support token-based auth. Check the latest `@github/copilot-sdk` docs for serverless deployment options.
:::

## Docker

### Build and run

```dockerfile
FROM node:20-slim

# Install GitHub CLI
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null && \
    apt-get update && apt-get install -y gh && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN npm ci && npm run build

ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t innovator .
docker run -p 3000:3000 \
  -e INNOVATOR_API_KEY=your-secret-key \
  -e INNOVATOR_DEFAULT_MODEL=gpt-4.1 \
  innovator
```

### GitHub CLI auth in Docker

The Copilot SDK authenticates via `gh`. Mount a pre-authenticated config or set `GH_TOKEN`:

```bash
docker run -p 3000:3000 \
  -e GH_TOKEN=ghp_your_token \
  -e INNOVATOR_API_KEY=your-secret-key \
  innovator
```

## Self-hosted (Node.js)

For traditional server deployments:

```bash
# Clone and install
git clone https://github.com/josedab/innovator.git
cd innovator
npm ci

# Authenticate GitHub CLI
gh auth login

# Build
npm run build

# Set production env vars
export INNOVATOR_API_KEY=your-secret-key
export INNOVATOR_DEFAULT_MODEL=gpt-4.1
export PORT=3000

# Start
npm start
```

Use a process manager like [PM2](https://pm2.keymetrics.io/) for production:

```bash
pm2 start npm --name innovator -- start
```

## Security Checklist

- [ ] `INNOVATOR_API_KEY` is set and kept secret
- [ ] API key is rotated periodically
- [ ] HTTPS is enabled (via reverse proxy or platform)
- [ ] Access logs are monitored for unusual Copilot quota usage
- [ ] `gh auth` credentials are scoped to the minimum required permissions
