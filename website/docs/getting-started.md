---
id: getting-started
title: Getting Started
sidebar_position: 1
---

# Getting Started

Get Innovator running and generate your first innovation ideas in under 5 minutes.

## Prerequisites

- **Node.js 20+** (see `.nvmrc`)
- **npm** as package manager (yarn and pnpm are not supported and will be blocked at install time)
- **GitHub Copilot subscription** (Free, Pro, or Enterprise)
- **GitHub CLI** authenticated (`gh auth login`)

## Installation

```bash
git clone https://github.com/josedab/innovator.git
cd innovator
npm install
```

## Build the core package

The shared engine must be built before the web app or CLI can use it:

```bash
npm run build --workspace=packages/core
```

## Start the web app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll see the subject input screen.

## Try it out

1. Type a subject — for example: **"Code review processes"**
2. Click **🔍 Investigate**
3. Review the AI-generated analysis: key aspects, challenges, opportunities
4. Select one or more innovation angles (try **SCAMPER** and **First Principles**)
5. Click **Generate Innovations** and wait for results

That's it — you're innovating with AI.

## Or use Auto Mode

Click **🚀 Auto Mode** instead. It runs all 8 angles automatically and synthesizes a ranked report with top ideas, cross-cutting themes, and a strategic recommendation.

## CLI quick start

```bash
# List available angles
npx tsx apps/cli/src/index.ts angles

# Investigate a subject
npx tsx apps/cli/src/index.ts investigate "home automation"

# Run the full pipeline
npx tsx apps/cli/src/index.ts auto "home automation"
```

## Project structure

```
innovator/
├── apps/
│   ├── web/            # Next.js 16 web application
│   └── cli/            # Command-line interface
├── packages/
│   └── core/           # Shared innovation engine
│       ├── copilot/    # GitHub Copilot SDK client wrapper
│       ├── innovation/ # Investigation, generation, pipeline
│       └── prompts/    # Prompt templates for each angle
└── package.json        # Workspace root
```

## Dev Container / Codespaces

If you prefer a pre-configured environment, this repository includes a [dev container](https://containers.dev/) configuration:

- **GitHub Codespaces** — click **"Code → Codespaces → New codespace"** on the GitHub repo page
- **VS Code Dev Containers** — open the repo locally and select **"Reopen in Container"**

The dev container provides Node.js 20, GitHub CLI, ESLint/Prettier extensions with format-on-save, and port 3000 forwarded automatically. Dependencies are installed via the `postCreateCommand`, so you can run `npm run dev` immediately.

## Next steps

- [Core Concepts](/docs/core-concepts) — understand the mental model
- [Web App Guide](/docs/guides/web-app) — explore the full UI
- [CLI Guide](/docs/guides/cli) — power-user workflows
- [API Reference](/docs/api-reference) — all exported functions and types
