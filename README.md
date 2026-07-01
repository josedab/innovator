# 💡 Innovator — AI-Powered Innovation Engine

[![CI](https://github.com/josedab/innovator/actions/workflows/ci.yml/badge.svg)](https://github.com/josedab/innovator/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![codecov](https://codecov.io/gh/josedab/innovator/graph/badge.svg)](https://codecov.io/gh/josedab/innovator)

[![npm](https://img.shields.io/npm/v/create-innovator)](https://www.npmjs.com/package/create-innovator)

Explore any subject from multiple innovation angles using AI. Built with Next.js, the GitHub Copilot SDK, and TypeScript.

## Quick Install

```bash
# Scaffold a new project
npx create-innovator my-project

# Or use the CLI directly
npx innovator auto 'solar energy'
```

## Demo

<p align="center">
  <img src="website/static/img/demo-screenshot.svg" alt="Innovator — investigation, angle selection, and results flow" width="800" />
</p>

> 📸 _Run `npm run dev` and open http://localhost:3000 to try the investigate → angle select → results flow._

## Features

- **Subject Investigation** — AI analyzes your subject to identify key aspects, challenges, and opportunities
- **8 Innovation Angles** — Choose from SCAMPER, First Principles, Cross-Domain Analogy, Constraint Injection, Problem Inversion, Role-Based Perspectives, What-If Scenarios, and Trend Collision
- **Auto Mode** — Runs all angles automatically and synthesizes a strategic recommendation
- **Development Web App** — Browser UI for local experimentation and feature development
- **CLI Tool** — Full-featured command-line interface with progress indicators
- **Copilot SDK** — Powered by your GitHub Copilot subscription; local development can use `gh auth`, while production passes `GH_TOKEN`

## Production Support

The first production release is a **headless, single-process, single-tenant API** deployment. The browser UI and experimental SaaS surfaces remain available for development, but intentionally return `404` when `NODE_ENV=production`.

Production exposes only these routes:

| Access    | Routes                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public    | `GET /healthz`, `GET /readyz`                                                                                                                                                                                                                       |
| Protected | `GET /api/health`, `GET /api/angles`, `GET /api/presets`, `POST /api/investigate`, `POST /api/innovate`, `POST /api/auto`, `POST /api/nl-innovate`, `POST /api/v1/investigate`, `POST /api/v1/innovate`, `POST /api/v1/auto`, `GET /api/v1/openapi` |

OAuth, billing, tenant/workspace administration, uploads, webhooks, integrations, collaboration, dynamic API keys, the developer portal, and all other routes are development/experimental only. See the [Deployment guide](website/docs/guides/deployment.md) for the supported production setup.

## Prerequisites

- Node.js 22+
- GitHub Copilot subscription
- GitHub CLI authenticated (`gh auth login`)

## Quick Start

> **💻 Using GitHub Codespaces or VS Code Dev Containers?** Open the repo in a dev container — Node.js 22, GitHub CLI, and extensions are pre-configured. See [Dev Container / Codespaces](#dev-container--codespaces).

```bash
# Use the correct Node.js version (see .nvmrc)
nvm use  # or fnm use

# Install dependencies
npm install

# Copy environment config (edit as needed)
cp .env.local.example .env.local

# Verify prerequisites (Node 22+, npm 10+, gh CLI, Copilot auth)
npm run doctor

# Start the web app (automatically builds core first)
npm run dev

# Open http://localhost:3000 (customize with PORT=3001)
```

> **Prefer `make`?** Run `make help` to see all available targets.

### Running Tests

```bash
# Run all tests
npm test

# Watch mode (re-runs on file changes)
npm run test:watch

# Run a single test file
npx vitest run packages/core/src/__tests__/gauntlet.test.ts

# Run tests with coverage
npm run test:coverage
```

## CLI Usage

```bash
# List available angles
npx tsx apps/cli/src/index.ts angles

# Investigate a subject
npx tsx apps/cli/src/index.ts investigate "code review processes"

# Generate innovations for specific angles
npx tsx apps/cli/src/index.ts innovate "code review processes" --angles scamper,first-principles

# Run full auto pipeline (all angles + synthesis)
npx tsx apps/cli/src/index.ts auto "code review processes"

# Use a specific model
npx tsx apps/cli/src/index.ts auto "home automation" --model gpt-5

# Or via the root script shortcut:
npm run cli -- investigate "code review processes"
```

## Innovation Angles

| Angle                          | Description                                                              |
| ------------------------------ | ------------------------------------------------------------------------ |
| 🔄 **SCAMPER**                 | Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse |
| 🧱 **First Principles**        | Decompose to fundamental truths, then rebuild novel solutions            |
| 🌐 **Cross-Domain Analogy**    | Map concepts from unrelated fields to spark unexpected ideas             |
| 🔒 **Constraint Injection**    | Add provocative constraints to force creative breakthroughs              |
| 🔃 **Problem Inversion**       | Flip the problem upside down, then reverse the insights                  |
| 👥 **Role-Based Perspectives** | View through different stakeholder lenses                                |
| 💭 **What-If Scenarios**       | Explore provocative hypotheticals to push boundaries                     |
| ⚡ **Trend Collision**         | Combine with emerging technology and social trends                       |

## Project Structure

```
innovator/
├── apps/
│   ├── web/          # Next.js web application
│   └── cli/          # Command-line interface
├── packages/
│   ├── core/         # Shared innovation engine
│   │   └── src/
│   │       ├── copilot/    # GitHub Copilot SDK client wrapper
│   │       ├── innovation/ # Investigation, generation, pipeline
│   │       └── prompts/    # Prompt templates for each angle
│   ├── sdk/          # Framework-agnostic SDK client (@innovator/sdk)
│   ├── bot/          # Chat bot integration
│   ├── copilot-extension/ # Retired GitHub App extension compatibility/migration stub
│   ├── create-innovator/  # Project scaffolder (npx create-innovator)
│   ├── mcp-server/   # MCP server for AI tool integration
│   └── vscode-extension/  # VS Code extension
└── package.json      # Workspace root
```

### Build Order & Dependencies

The monorepo must be built in dependency order. `npm run build` handles all supported workspaces automatically.

```
packages/core → apps/cli → apps/web → packages/bot → packages/mcp-server
              → packages/sdk → packages/vscode-extension → packages/create-innovator
```

| Package                       | Depends On        | Build Command                                |
| ----------------------------- | ----------------- | -------------------------------------------- |
| `@innovator/core`             | _(none)_          | `npm run build -w packages/core`             |
| `apps/cli`                    | `@innovator/core` | `npm run build -w apps/cli`                  |
| `apps/web`                    | `@innovator/core` | `npm run build -w apps/web`                  |
| `@innovator/mcp-server`       | `@innovator/core` | `npm run build -w packages/mcp-server`       |
| `@innovator/bot`              | `@innovator/core` | `npm run build -w packages/bot`              |
| `@innovator/sdk`              | _(standalone)_    | `npm run build -w packages/sdk`              |
| `@innovator/vscode-extension` | `@innovator/core` | `npm run build -w packages/vscode-extension` |
| `create-innovator`            | _(standalone)_    | `npm run build -w packages/create-innovator` |
| `website`                     | _(standalone)_    | `npm run build -w website`                   |

`packages/copilot-extension` is a retired compatibility stub. It remains type-checked for compatibility but is not part of the supported root production build.

> **Always build `packages/core` first.** Never build a consumer before core. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full dependency graph.

## MCP Server

The MCP (Model Context Protocol) server in `packages/mcp-server/` exposes Innovator's capabilities as tools callable by any MCP-compatible AI client — Claude Desktop, Cursor, Windsurf, VS Code, and others.

```bash
# stdio transport (the only supported transport)
npx @innovator/mcp-server
```

`--sse` is intentionally disabled and exits with an error. Filesystem analysis tools are restricted to `MCP_ALLOWED_ROOT` (the process working directory by default), and `maxFiles` cannot exceed `1000`.

Available tools: `investigate`, `innovate`, `auto`, `innovate-from-code`, `innovate-file`, and `innovate-architecture`. See the [MCP Server README](packages/mcp-server/README.md) for client configuration examples.

> **Copilot Extension migration:** GitHub retired GitHub App-based, server-side Copilot Extensions on November 10, 2025. `packages/copilot-extension` is a compatibility stub whose start command fails with migration guidance. Use `@innovator/mcp-server` for direct Copilot integration. The client-side [VS Code extension](packages/vscode-extension/README.md) is separate and remains supported.

## Chat Bot

The [`packages/bot/`](packages/bot/) package provides chat platform adapters for Slack, Discord, and Microsoft Teams. Expose a `/innovate` command that runs the full auto pipeline and streams progress updates directly into your chat channel.

Chat-platform integrations are development/experimental and are not part of the first production API deployment.

```bash
npm install @innovator/bot
```

See the [Bot README](packages/bot/README.md) and the [Bot Guide](website/docs/guides/bot.md) for setup and configuration.

## GitHub Action

The [`action/`](action/) directory contains a GitHub Action that runs AI-powered innovation analysis directly in your CI/CD workflows. Trigger it on issue labels, pull requests, or manual dispatch to automatically investigate subjects and post results as comments.

```yaml
- uses: josedab/innovator/action@main
  with:
    label: "needs-innovation"
    post-comment: "true"
```

See the [Action README](action/README.md) for full configuration options and examples.

## Examples

Runnable example scripts live in the [`examples/`](examples/) directory. Each script demonstrates a specific workflow:

```bash
npx tsx examples/basic-usage.ts
```

See the [Feature Module Catalog](website/docs/guides/feature-catalog.md) for a comprehensive list of all available modules.

## How It Works

1. **Investigate** — The AI analyzes your subject, identifying key aspects, state of the art, challenges, and opportunities
2. **Select Angles** — Choose which innovation frameworks to apply (or use Auto Mode for all)
3. **Generate** — Each angle applies a unique creative framework to generate specific, actionable ideas
4. **Synthesize** (Auto Mode) — Cross-references all ideas, identifies themes, ranks by feasibility, and provides a strategic recommendation

## Configuration

Copy `.env.local.example` to `.env.local` to customize:

```bash
# Default model (optional, defaults to gpt-4.1)
INNOVATOR_DEFAULT_MODEL=gpt-4.1
```

Supported models include `gpt-4.1`, `gpt-5`, `claude-sonnet-4.5`, and others available through your Copilot subscription.

### Environment Variables

Production requires all four variables below:

| Variable                       | Production value/requirement                                         |
| ------------------------------ | -------------------------------------------------------------------- |
| `NODE_ENV`                     | Must be `production`                                                 |
| `INNOVATOR_DEPLOYMENT_PROFILE` | Must be `single-tenant`                                              |
| `INNOVATOR_API_KEYS`           | One or more unique comma-separated keys, each at least 32 characters |
| `GH_TOKEN`                     | Required for the production GitHub Copilot provider                  |

`INNOVATOR_API_KEY` is a legacy single-key option for development and compatibility. Do not configure it together with `INNOVATOR_API_KEYS`; production must use the plural variable. Clients may send one configured key with `X-API-Key` or `Authorization: Bearer`.

Optional settings include `INNOVATOR_DEFAULT_MODEL` (default `gpt-4.1`), `INNOVATOR_LLM_TIMEOUT_MS` (default `90000`), `INNOVATOR_EXTRA_MODELS`, and `PORT` (default `3000`). Embed, OAuth, billing, database, and other SaaS variables configure development/experimental surfaces only.

## Docker

Docker Compose is the supported first-production deployment path:

```bash
export INNOVATOR_CLIENT_API_KEY="$(openssl rand -hex 32)"
export INNOVATOR_API_KEYS="$INNOVATOR_CLIENT_API_KEY"
export GH_TOKEN="$(gh auth token)"
docker compose up -d --build

curl http://127.0.0.1:3000/healthz
curl -H "X-API-Key: $INNOVATOR_CLIENT_API_KEY" http://127.0.0.1:3000/api/health
```

Compose binds only to `127.0.0.1:3000`, mounts `innovator_data` at `/home/innovator/.innovator` and `copilot_data` at `/home/innovator/.copilot`, keeps the rest of the container read-only, rotates logs, and allows two minutes for graceful shutdown. PostgreSQL and pgAdmin are intentionally absent because the PostgreSQL adapter is not implemented.

Place an authenticated TLS reverse proxy in front of the service and inject or forward an API key. **Never expose port 3000 directly.** Run one replica only: rate limiting and state are process-local. Back up both production volumes before upgrades and restore them together if rollback is required.

## Dev Container / Codespaces

This repository includes a [dev container](.devcontainer/devcontainer.json) configuration for **GitHub Codespaces** and **VS Code Dev Containers**. It provides:

- **Node.js 22** runtime
- **GitHub CLI** pre-installed
- **ESLint & Prettier** VS Code extensions with format-on-save enabled
- **Port 3000** forwarded automatically

To get started, click **"Code → Codespaces → New codespace"** on GitHub, or open the repo in VS Code and select **"Reopen in Container"**. Dependencies install automatically via the `postCreateCommand`.

## Troubleshooting

| Issue                                | Solution                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`gh auth` / Copilot token errors** | Run `gh auth login` and ensure your GitHub account has an active Copilot subscription. In CI, set the `GH_TOKEN` env var.                                                |
| **Model not available**              | Check model availability with your provider. Use `INNOVATOR_EXTRA_MODELS` to allowlist custom model IDs, or switch providers via `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. |
| **Port 3000 already in use**         | Set `PORT=3001` in `.env.local` or kill the existing process on port 3000.                                                                                               |
| **Build failures after upgrade**     | Run `npm run clean:all && rm -rf node_modules && npm install && npm run build` for a clean rebuild.                                                                      |
| **LLM request timeouts**             | Increase `INNOVATOR_LLM_TIMEOUT_MS` (default: 90000). Complex subjects or slower models may need 120000+.                                                                |

For the full troubleshooting guide, see the [documentation site](https://josedab.github.io/innovator/docs/troubleshooting).

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding standards, and PR guidelines.

## Community

Have a question or idea? Join the conversation on [GitHub Discussions](https://github.com/josedab/innovator/discussions):

- **💡 [Ideas](https://github.com/josedab/innovator/discussions/categories/ideas)** — Propose new features, angles, or improvements
- **❓ [Q&A](https://github.com/josedab/innovator/discussions/categories/q-a)** — Ask questions about setup, usage, or troubleshooting
- **📜 [Code of Conduct](.github/CODE_OF_CONDUCT.md)** — Our community standards (Contributor Covenant 2.1)
- **🆘 [Support](.github/SUPPORT.md)** — How to get help, report bugs, and request features

## Security

To report a vulnerability, please follow the instructions in [SECURITY.md](.github/SECURITY.md). **Do not open a public issue for security vulnerabilities.** We aim to acknowledge reports within 48 hours.

Run `npm run audit:production` to audit runtime dependencies; the policy fails on any production advisory. CI also validates Docker Compose, builds the production image, and gates releases on a successful CI run for the exact revision.

## Tech Stack

- **Next.js 16.2.12** — App Router runtime for the development UI and production API
- **@github/copilot-sdk** — AI via GitHub Copilot subscription
- **TypeScript** — End-to-end type safety
- **Tailwind CSS** — Utility-first styling
- **Zod** — Runtime validation of AI outputs
- **Commander.js** — CLI framework

The repository requires Node.js 22+ and pins root dependency overrides for `postcss` 8.5.23 and `sharp` 0.35.3.

## Architecture Decision Records

Significant architectural decisions are documented as ADRs in [`docs/adr/`](docs/adr/). See the [ADR index](docs/adr/README.md) for a summary of all decisions.

## Documentation

| Document                                   | Description                                   |
| ------------------------------------------ | --------------------------------------------- |
| [API Reference](docs/API.md)               | Comprehensive `@innovator/core` API reference |
| [Developer Guide](docs/DEVELOPER_GUIDE.md) | Recipes, patterns, and how-to guides          |
| [Architecture](ARCHITECTURE.md)            | System architecture with Mermaid diagrams     |
| [Contributing](CONTRIBUTING.md)            | Setup, coding standards, and PR guidelines    |
| [Migration Guide](MIGRATION.md)            | Upgrade paths and breaking changes            |
| [Changelog](CHANGELOG.md)                  | Version history                               |
| [ADR Index](docs/adr/README.md)            | Architecture Decision Records                 |
