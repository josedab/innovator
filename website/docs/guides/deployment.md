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

:::note
The Dockerfile below is an illustrative example — no `Dockerfile` is included in the repository yet. Copy it into your project root and adjust as needed for your deployment environment.
:::

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

## AWS

### EC2

Deploy as a standard Node.js application on an EC2 instance:

```bash
# On your EC2 instance (Amazon Linux 2023 or Ubuntu 22.04+)
# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs   # Amazon Linux
# sudo apt install -y nodejs   # Ubuntu

# Install GitHub CLI
sudo yum install -y gh   # or: sudo apt install -y gh

# Clone and build
git clone https://github.com/josedab/innovator.git
cd innovator
npm ci && npm run build

# Authenticate GitHub CLI
gh auth login

# Set environment variables
export INNOVATOR_API_KEY=your-secret-key
export PORT=3000

# Run with PM2
npm install -g pm2
pm2 start npm --name innovator -- start
pm2 save
pm2 startup
```

Open port 3000 in your EC2 security group, or place behind an ALB with HTTPS.

### ECS (Fargate)

Use the Docker image from the [Docker section](#docker) with ECS Fargate:

1. Push the Docker image to **Amazon ECR**
2. Create an ECS **task definition** with the image, setting environment variables (`INNOVATOR_API_KEY`, `GH_TOKEN`)
3. Create an ECS **service** with a Fargate launch type
4. Attach an **Application Load Balancer** with HTTPS listener

Pass `GH_TOKEN` as a secret via AWS Secrets Manager rather than plain environment variables.

### Lambda (Experimental)

Next.js can be deployed to Lambda via [OpenNext](https://open-next.js.org/) or the [Serverless Next.js Component](https://github.com/serverless-nextjs/serverless-next.js). However, the Copilot SDK's reliance on `gh` CLI makes serverless deployment challenging. Consider using an alternative LLM provider (OpenAI/Anthropic direct) with API key auth for Lambda deployments.

## Azure App Service

1. Create a **Node.js 20 LTS** App Service in the Azure Portal
2. Configure deployment from your GitHub repository (or push the Docker image to Azure Container Registry)
3. Set environment variables in **Configuration → Application settings**:
   - `INNOVATOR_API_KEY`
   - `INNOVATOR_DEFAULT_MODEL`
   - `GH_TOKEN` (for Copilot SDK auth)
4. Set the **Startup Command** to `npm start`

```bash
# Or deploy via Azure CLI
az webapp up --name innovator-app --runtime "NODE:20-lts" --sku B1
az webapp config appsettings set --name innovator-app \
  --settings INNOVATOR_API_KEY=your-key GH_TOKEN=your-token
```

## Railway

[Railway](https://railway.app/) auto-detects Node.js projects and provides simple deployments.

1. Connect your GitHub repository in the Railway dashboard
2. Railway detects the project and runs `npm install && npm run build` automatically
3. Set environment variables in the Railway project settings:
   - `INNOVATOR_API_KEY`
   - `GH_TOKEN`
   - `PORT` — Railway sets this automatically; Innovator reads it
4. Deploy — Railway assigns a public URL with HTTPS

```bash
# Or deploy via Railway CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

## Heroku

1. Create a new Heroku app and connect your repository
2. Add the **GitHub CLI buildpack** (Copilot SDK requires `gh`):
   ```bash
   heroku buildpacks:add --index 1 https://github.com/heroku/heroku-buildpack-github-cli
   heroku buildpacks:add heroku/nodejs
   ```
3. Set config vars:
   ```bash
   heroku config:set INNOVATOR_API_KEY=your-key
   heroku config:set GH_TOKEN=your-token
   heroku config:set NPM_CONFIG_PRODUCTION=false
   ```
4. Deploy:
   ```bash
   git push heroku main
   ```

Add a `Procfile` to the repository root if not already present:

```
web: npm start
```

## Fly.io

[Fly.io](https://fly.io/) runs Docker containers globally with low latency.

1. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Create the app:
   ```bash
   fly launch --name innovator --region iad
   ```
3. Set secrets:
   ```bash
   fly secrets set INNOVATOR_API_KEY=your-key GH_TOKEN=your-token
   ```
4. Create a `fly.toml` (or let `fly launch` generate one):

   ```toml
   [build]
     dockerfile = "Dockerfile"

   [env]
     PORT = "3000"

   [[services]]
     internal_port = 3000
     protocol = "tcp"
     [services.concurrency]
       hard_limit = 25
       soft_limit = 20
     [[services.ports]]
       handlers = ["http"]
       port = 80
     [[services.ports]]
       handlers = ["tls", "http"]
       port = 443
   ```

5. Deploy:
   ```bash
   fly deploy
   ```

## Security Checklist

- [ ] `INNOVATOR_API_KEY` is set and kept secret
- [ ] API key is rotated periodically
- [ ] HTTPS is enabled (via reverse proxy or platform)
- [ ] Access logs are monitored for unusual Copilot quota usage
- [ ] `gh auth` credentials are scoped to the minimum required permissions

## Security Headers

The Next.js app sets the following security headers on all responses via `apps/web/next.config.ts`. If you deploy behind a reverse proxy (e.g., nginx, Cloudflare), be aware these are already set to avoid duplicate or conflicting headers.

| Header                      | Value                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `X-Frame-Options`           | `DENY`                                                                             |
| `X-Content-Type-Options`    | `nosniff`                                                                          |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                  |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()` |
| `X-DNS-Prefetch-Control`    | `off`                                                                              |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                                     |

Additionally, the middleware (`apps/web/src/middleware.ts`) applies a nonce-based `Content-Security-Policy` header on all non-API routes.
