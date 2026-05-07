---
id: cli
title: CLI Guide
sidebar_position: 2
---

# CLI Guide

The Innovator CLI provides the same innovation engine in your terminal — ideal for scripting, pipelines, and quick exploration.

## Running the CLI

```bash
npx tsx apps/cli/src/index.ts <command> [options]
```

Or use the root shortcut:

```bash
npm run cli -- <command> [options]
```

## Commands

### Core Commands

#### `angles` — List available angles

```bash
npx tsx apps/cli/src/index.ts angles
```

Output:

```
💡 Available Innovation Angles

  🔄 scamper              SCAMPER
     Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse

  🧱 first-principles     First Principles
     Decompose to fundamental truths, then rebuild novel solutions
  ...
```

#### `investigate <subject>` — Analyze a subject

```bash
npx tsx apps/cli/src/index.ts investigate "code review processes"
```

Options:

| Option                | Description                                           | Default    |
| --------------------- | ----------------------------------------------------- | ---------- |
| `-m, --model <model>` | LLM model to use                                      | `gpt-4.1`  |
| `--depth <depth>`     | Investigation depth: `shallow`, `standard`, or `deep` | `standard` |
| `--lang <language>`   | Output language: `en`, `es`, `ja`, `de`, `pt`         | `en`       |
| `--score`             | Score and rank ideas after generation                 | —          |
| `--file <path>`       | Use a file or directory as context input              | —          |
| `--url <url>`         | Use a URL as context input                            | —          |
| `--verbose`           | Enable verbose logging (prompts, responses, timing)   | —          |

Output includes summary, key aspects, current state, challenges, opportunities, and a suggestion for which angles to try next.

#### `innovate <subject>` — Generate innovations

```bash
npx tsx apps/cli/src/index.ts innovate "code review processes" \
  --angles scamper,first-principles,inversion
```

Options:

| Option                | Description                              | Default   |
| --------------------- | ---------------------------------------- | --------- |
| `-a, --angles <list>` | Comma-separated angle IDs (**required**) | —         |
| `-m, --model <model>` | LLM model to use                         | `gpt-4.1` |
| `--score`             | Score and rank ideas after generation    | —         |
| `--file <path>`       | Use a file or directory as context input | —         |
| `--url <url>`         | Use a URL as context input               | —         |
| `--verbose`           | Enable verbose logging                   | —         |

This command investigates the subject first, then generates ideas for each selected angle.

#### `auto <subject>` — Full automatic pipeline

```bash
npx tsx apps/cli/src/index.ts auto "home automation"
```

Options:

| Option                     | Description                                                                      | Default    |
| -------------------------- | -------------------------------------------------------------------------------- | ---------- |
| `-m, --model <model>`      | LLM model to use                                                                 | `gpt-4.1`  |
| `--depth <depth>`          | Investigation depth: `shallow`, `standard`, or `deep`                            | `standard` |
| `--lang <language>`        | Output language: `en`, `es`, `ja`, `de`, `pt`                                    | `en`       |
| `--score`                  | Score and rank ideas after generation                                            | —          |
| `--validate`               | Validate ideas against patent, market, and feasibility checks                    | —          |
| `--audience <mode>`        | Generate audience-adapted output (`executive`, `technical`, `pitch`, `research`) | —          |
| `--file <path>`            | Use a file or directory as context input                                         | —          |
| `--url <url>`              | Use a URL as context input                                                       | —          |
| `--constraint <expr...>`   | Apply constraints (e.g., `budget<50K`, `timeline<3months`)                       | —          |
| `--min-confidence <score>` | Minimum investigation confidence score (0–100) before generating ideas           | —          |
| `--playbook [format]`      | Generate an Innovation Playbook (`markdown` or `html`)                           | —          |
| `--debate`                 | Run structured debate on top ideas after synthesis                               | —          |
| `--debate-rounds <n>`      | Number of debate rounds (1–5)                                                    | `2`        |
| `--decision-packet`        | Generate an executive decision packet from results                               | —          |
| `--stress-test`            | Run stress test scenarios on top ideas                                           | —          |
| `--verbose`                | Enable verbose logging                                                           | —          |

Runs the complete pipeline: investigate → all 8 angles → synthesis. Shows a spinner with progress updates. Outputs all ideas plus the synthesized top picks.

#### `evolve <subject>` — Evolve ideas

Evolve ideas through genetic-algorithm-inspired mutation and crossover.

```bash
npx tsx apps/cli/src/index.ts evolve "remote work tools" --generations 5 --population 8
```

| Option                | Description                            | Default   |
| --------------------- | -------------------------------------- | --------- |
| `-m, --model <model>` | LLM model to use                       | `gpt-4.1` |
| `--generations <n>`   | Number of evolution generations (1–10) | `3`       |
| `--population <n>`    | Population size per generation         | `6`       |

#### `diff <subjectA> <subjectB>` — Innovation diff

Compare two snapshots of a subject and generate an innovation diff.

```bash
npx tsx apps/cli/src/index.ts diff "remote work in 2020" "remote work in 2026"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `run <description>` — Natural language pipeline

Run a pipeline described in natural language.

```bash
npx tsx apps/cli/src/index.ts run "investigate solar energy and generate ideas using first-principles"
npx tsx apps/cli/src/index.ts run "deep dive into AI ethics with all angles and synthesis"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `refine <subject>` — Interactive refinement

Start an interactive refinement session on a completed auto pipeline.

```bash
npx tsx apps/cli/src/index.ts refine "sustainable packaging"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `connections` — Serendipitous connections

Find serendipitous connections across past investigations.

```bash
npx tsx apps/cli/src/index.ts connections --min-similarity 0.5 --max 5
```

| Option                         | Description                        | Default   |
| ------------------------------ | ---------------------------------- | --------- |
| `--min-similarity <threshold>` | Minimum similarity threshold (0–1) | `0.3`     |
| `--max <count>`                | Maximum connections to show        | `10`      |
| `-m, --model <model>`          | LLM model to use for explanations  | `gpt-4.1` |

### Angle Chain Commands

#### `chain list`

List available pre-defined angle chains.

```bash
npx tsx apps/cli/src/index.ts chain list
```

#### `chain run <chainId> <subject>`

Run an angle chain by ID.

```bash
npx tsx apps/cli/src/index.ts chain run deep-disruption "AI in healthcare"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

### Angle Management

#### `angles list`

List all available innovation angles (built-in and custom).

#### `angles create`

Create a new custom innovation angle interactively.

#### `angles remove <id>`

Remove a custom angle.

#### `angles export`

Export custom angles to an `.angle.json` pack file.

#### `angles import <file>`

Import angles from an `.angle.json` pack file.

### Feedback Commands

#### `feedback summary`

Show per-angle quality scores from collected feedback.

```bash
npx tsx apps/cli/src/index.ts feedback summary
```

#### `feedback rate <angleId> <rating>`

Rate an idea from a session.

```bash
npx tsx apps/cli/src/index.ts feedback rate scamper up --idea "Smart Packaging" --comment "Very actionable"
```

| Option             | Description        | Default   |
| ------------------ | ------------------ | --------- |
| `--idea <title>`   | Idea title to rate | `general` |
| `--comment <text>` | Optional comment   | —         |
| `--session <id>`   | Session ID         | —         |

### Export

#### `export <sessionId>`

Export a session to Markdown, JSON, or GitHub Issue format.

```bash
npx tsx apps/cli/src/index.ts export abc123 --format markdown
npx tsx apps/cli/src/index.ts export abc123 --format github-issue
```

| Option               | Description                                       | Default    |
| -------------------- | ------------------------------------------------- | ---------- |
| `-f, --format <fmt>` | Output format: `markdown`, `json`, `github-issue` | `markdown` |

### History Commands

#### `history list`

List recent innovation sessions.

```bash
npx tsx apps/cli/src/index.ts history list -n 20 --search "AI" --tag important
```

| Option             | Description                  | Default |
| ------------------ | ---------------------------- | ------- |
| `-n, --limit <n>`  | Number of sessions to show   | `10`    |
| `--search <query>` | Search by subject or content | —       |
| `--tag <tag>`      | Filter by tag                | —       |

#### `history show <id>`

Show details of a session.

#### `history tag <id> <tags...>`

Add tags to a session.

#### `history delete <id>`

Delete a session from history.

### Presets

#### `presets list`

List all available domain presets.

#### `presets run <presetId> <subject>`

Run the auto pipeline with a preset's configuration.

```bash
npx tsx apps/cli/src/index.ts presets run startup-mvp "food delivery optimization"
```

| Option                | Description                              | Default   |
| --------------------- | ---------------------------------------- | --------- |
| `-m, --model <model>` | LLM model to use                         | `gpt-4.1` |
| `--score`             | Score and rank ideas after generation    | —         |
| `--file <path>`       | Use a file or directory as context input | —         |
| `--url <url>`         | Use a URL as context input               | —         |

### Plugin Management

#### `plugin list`

List all registered plugins.

#### `plugin load <source>`

Load a plugin from a file path or npm package.

```bash
npx tsx apps/cli/src/index.ts plugin load ./my-plugin.ts
npx tsx apps/cli/src/index.ts plugin load innovator-plugin-sustainability
```

#### `plugin create <name>`

Scaffold a new plugin project.

```bash
npx tsx apps/cli/src/index.ts plugin create my-plugin --type angle
```

| Option          | Description                                       | Default |
| --------------- | ------------------------------------------------- | ------- |
| `--type <type>` | Plugin type: `angle`, `exporter`, or `visualizer` | `angle` |

### Benchmark

#### `benchmark <subject>`

Compare innovation quality across LLM models.

```bash
npx tsx apps/cli/src/index.ts benchmark "sustainable energy" --models gpt-4.1,claude-sonnet-4.5
```

| Option                | Description                         | Default                                 |
| --------------------- | ----------------------------------- | --------------------------------------- |
| `--models <models>`   | Comma-separated models to benchmark | —                                       |
| `--angles <angles>`   | Comma-separated angle IDs           | `scamper,first-principles,cross-domain` |
| `--judge <model>`     | Model to use as evaluator/judge     | —                                       |
| `-o, --output <file>` | Output report file path             | —                                       |

### Configuration

#### `config show`

Show current LLM provider configuration.

#### `config set-provider <provider>`

Set the default LLM provider (`copilot`, `openai`, `anthropic`, `ollama`).

```bash
npx tsx apps/cli/src/index.ts config set-provider openai
```

#### `config set-model <stage> <model>`

Set the preferred model for a pipeline stage (`investigation`, `generation`, `synthesis`).

```bash
npx tsx apps/cli/src/index.ts config set-model investigation gpt-4.1
```

#### `providers`

List available LLM providers and their status.

#### `setup-offline`

Configure Ollama for offline / local-first innovation. Detects Ollama installation, checks available models, and configures the CLI for offline use.

### Marketplace

#### `marketplace search [query]`

Search the plugin marketplace.

```bash
npx tsx apps/cli/src/index.ts marketplace search "sustainability"
npx tsx apps/cli/src/index.ts marketplace search --category angles
```

| Option                  | Description        | Default |
| ----------------------- | ------------------ | ------- |
| `--category <category>` | Filter by category | —       |

#### `marketplace install <pluginId>`

Install a plugin from the marketplace.

```bash
npx tsx apps/cli/src/index.ts marketplace install sustainability-pack
```

#### `marketplace publish`

Publish a plugin to the marketplace.

```bash
npx tsx apps/cli/src/index.ts marketplace publish \
  --name "My Plugin" \
  --description "Custom angles for healthcare" \
  --category angles \
  --source innovator-plugin-health \
  --version 1.0.0 \
  --author "Jane Doe"
```

| Option                  | Description                           | Default |
| ----------------------- | ------------------------------------- | ------- |
| `--name <name>`         | Plugin name (**required**)            | —       |
| `--description <desc>`  | Plugin description (**required**)     | —       |
| `--category <category>` | Plugin category (**required**)        | —       |
| `--source <source>`     | npm package or git URL (**required**) | —       |
| `--version <version>`   | Plugin version (**required**)         | —       |
| `--author <author>`     | Author name (**required**)            | —       |

### Innovation Radar

#### `radar watch <subject>`

Add a subject to the innovation radar for trend monitoring.

```bash
npx tsx apps/cli/src/index.ts radar watch "AI in healthcare" --frequency weekly
```

| Option               | Description                                   | Default  |
| -------------------- | --------------------------------------------- | -------- |
| `--frequency <freq>` | Check frequency: `daily`, `weekly`, `monthly` | `weekly` |
| `--webhook <url>`    | Webhook URL for alerts                        | —        |

#### `radar list`

List all watched subjects.

```bash
npx tsx apps/cli/src/index.ts radar list
```

### Scaffold

#### `scaffold`

Generate implementation scaffolding from an idea.

```bash
npx tsx apps/cli/src/index.ts scaffold --title "Smart Packaging" --description "AI-powered freshness detection" --stack typescript
```

| Option                 | Description                                      | Default                  |
| ---------------------- | ------------------------------------------------ | ------------------------ |
| `--title <title>`      | Idea title (**required**)                        | —                        |
| `--description <desc>` | Idea description (**required**)                  | —                        |
| `--impact <impact>`    | Potential impact                                 | `High impact innovation` |
| `--stack <stack>`      | Tech stack: `typescript`, `python`, `go`, `rust` | `typescript`             |
| `--name <name>`        | Project name                                     | —                        |

### Wargaming

#### `wargame <subject>`

Run competitive wargaming simulation on an idea.

```bash
npx tsx apps/cli/src/index.ts wargame "AI diagnostics" --idea "AI Health Scanner" --description "AI-powered diagnostic tool"
```

| Option                 | Description                      | Default   |
| ---------------------- | -------------------------------- | --------- |
| `--idea <title>`       | Idea title (**required**)        | —         |
| `--description <desc>` | Idea description (**required**)  | —         |
| `-m, --model <model>`  | LLM model to use                 | `gpt-4.1` |
| `--rounds <n>`         | Number of wargaming rounds (1–5) | `3`       |
| `--markdown`           | Output as Markdown               | —         |

### Scoring Rubrics

#### `rubric list`

List available scoring rubrics.

```bash
npx tsx apps/cli/src/index.ts rubric list
```

#### `rubric show <id>`

Show rubric details including dimensions and weights.

```bash
npx tsx apps/cli/src/index.ts rubric show innovation-quality
```

### Competitive Intelligence

#### `monitor create`

Create a competitive monitor.

```bash
npx tsx apps/cli/src/index.ts monitor create --domain "AI code generation" --competitors "Copilot,Cursor,Cody"
```

| Option                 | Description                                       | Default |
| ---------------------- | ------------------------------------------------- | ------- |
| `--domain <domain>`    | Domain to monitor (**required**)                  | —       |
| `--competitors <list>` | Comma-separated competitor names                  | —       |
| `--keywords <list>`    | Comma-separated keywords                          | —       |
| `--frequency <freq>`   | Monitoring frequency: `hourly`, `daily`, `weekly` | `daily` |

#### `monitor list`

List active competitive monitors.

#### `monitor signals`

View detected competitive signals.

```bash
npx tsx apps/cli/src/index.ts monitor signals --domain "AI code generation" --limit 20
```

| Option              | Description         | Default |
| ------------------- | ------------------- | ------- |
| `--domain <domain>` | Filter by domain    | —       |
| `--limit <n>`       | Max signals to show | `20`    |

### Provenance

#### `provenance <sessionId>`

View provenance and citation chain for ideas in a session.

```bash
npx tsx apps/cli/src/index.ts provenance abc123
npx tsx apps/cli/src/index.ts provenance abc123 --format markdown
```

| Option              | Description                                  | Default |
| ------------------- | -------------------------------------------- | ------- |
| `--format <format>` | Output format: `text`, `markdown`, `json-ld` | `text`  |

### Cost Report

#### `cost-report`

Generate an LLM cost-performance report.

```bash
npx tsx apps/cli/src/index.ts cost-report
npx tsx apps/cli/src/index.ts cost-report --markdown
```

| Option       | Description        | Default |
| ------------ | ------------------ | ------- |
| `--markdown` | Output as Markdown | —       |

### Supply Chain

#### `supply-chain <subject>`

Map the innovation supply chain for an idea.

```bash
npx tsx apps/cli/src/index.ts supply-chain "smart packaging" --idea "AI Freshness Sensor" --description "Embedded freshness detection"
```

| Option                 | Description                     | Default   |
| ---------------------- | ------------------------------- | --------- |
| `--idea <title>`       | Idea title (**required**)       | —         |
| `--description <desc>` | Idea description (**required**) | —         |
| `-m, --model <model>`  | LLM model to use                | `gpt-4.1` |
| `--markdown`           | Output as Markdown              | —         |

### Timing

#### `timing <subject>`

Analyze optimal execution timing for ideas.

```bash
npx tsx apps/cli/src/index.ts timing "AI in healthcare"
```

| Option                | Description        | Default   |
| --------------------- | ------------------ | --------- |
| `-m, --model <model>` | LLM model to use   | `gpt-4.1` |
| `--markdown`          | Output as Markdown | —         |

### Telemetry

#### `telemetry`

View innovation pipeline telemetry and metrics.

```bash
npx tsx apps/cli/src/index.ts telemetry
```

### Webhooks

#### `webhooks templates`

List available webhook templates (Slack, GitHub Issues, Jira, Email).

```bash
npx tsx apps/cli/src/index.ts webhooks templates
```

#### `webhooks list`

List registered webhooks and their status.

```bash
npx tsx apps/cli/src/index.ts webhooks list
```

### Context (RAG)

#### `context add`

Add a knowledge source connector for RAG context grounding.

```bash
npx tsx apps/cli/src/index.ts context add --type github --name "My Repo" --repo owner/repo
npx tsx apps/cli/src/index.ts context add --type local-file --name "Docs" --path ./docs
```

| Option            | Description                                                                   | Default |
| ----------------- | ----------------------------------------------------------------------------- | ------- |
| `--type <type>`   | Connector type: `github`, `confluence`, `notion`, `local-file` (**required**) | —       |
| `--name <name>`   | Connector name (**required**)                                                 | —       |
| `--repo <repo>`   | GitHub repo (`owner/repo`)                                                    | —       |
| `--path <path>`   | Local file or directory path                                                  | —       |
| `--url <url>`     | Base URL (for Confluence)                                                     | —       |
| `--space <space>` | Space key (for Confluence)                                                    | —       |
| `--token <token>` | Auth token                                                                    | —       |

#### `context list`

List registered knowledge source connectors and their sync status.

#### `context sync <id>`

Sync a connector to fetch the latest documents.

```bash
npx tsx apps/cli/src/index.ts context sync github-123456
```

### Data Migration

#### `migrate`

Migrate file-based data (`~/.innovator/`) into a SQLite database.

```bash
npx tsx apps/cli/src/index.ts migrate
npx tsx apps/cli/src/index.ts migrate --db ~/.innovator/innovator.db
```

| Option        | Description               | Default                     |
| ------------- | ------------------------- | --------------------------- |
| `--db <path>` | SQLite database file path | `~/.innovator/innovator.db` |

### Data Migration

#### `migrate`

Migrate file-based data (`~/.innovator/`) into a SQLite database.

```bash
npx tsx apps/cli/src/index.ts migrate
npx tsx apps/cli/src/index.ts migrate --db ~/.innovator/innovator.db
```

| Option        | Description               | Default                     |
| ------------- | ------------------------- | --------------------------- |
| `--db <path>` | SQLite database file path | `~/.innovator/innovator.db` |

### Idea Version Control (IdeaGit)

Track, branch, and diff ideas like source code using a Git-inspired version control system.

#### `idea log <ideaId>`

Show version history for an idea.

```bash
npx tsx apps/cli/src/index.ts idea log idea-abc123
npx tsx apps/cli/src/index.ts idea log idea-abc123 --branch experimental
```

| Option            | Description      | Default |
| ----------------- | ---------------- | ------- |
| `--branch <name>` | Filter by branch | —       |

#### `idea branch <versionId> <branchName>`

Create a branch from an existing version.

```bash
npx tsx apps/cli/src/index.ts idea branch ver-abc123 experimental
```

#### `idea diff <fromId> <toId>`

Compute a semantic diff between two idea versions.

```bash
npx tsx apps/cli/src/index.ts idea diff ver-abc123 ver-def456
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `decode <productDescription>`

Reverse-engineer a product's innovation recipe.

```bash
npx tsx apps/cli/src/index.ts decode "Spotify's Discover Weekly personalized playlist"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `diffusion <ideaTitle> [description]`

Simulate idea diffusion and adoption using the Bass model.

```bash
npx tsx apps/cli/src/index.ts diffusion "AI Code Review" "Automated code review using AI"
```

| Option                | Description                 | Default   |
| --------------------- | --------------------------- | --------- |
| `-m, --model <model>` | LLM model to use            | `gpt-4.1` |
| `--no-monte-carlo`    | Skip Monte Carlo simulation | —         |
| `--iterations <n>`    | Monte Carlo iterations      | `500`     |

#### `classify <subject>`

Classify subject complexity and generate an adaptive execution plan.

```bash
npx tsx apps/cli/src/index.ts classify "quantum computing applications"
```

| Option            | Description                                                   | Default |
| ----------------- | ------------------------------------------------------------- | ------- |
| `--depth <depth>` | Preferred depth: `overview`, `standard`, `deep`, `exhaustive` | —       |

#### `market-test <ideaTitle> [description]`

Run a synthetic market test with AI consumer personas.

```bash
npx tsx apps/cli/src/index.ts market-test "AI Health Scanner" "Personal health diagnostics" --personas 2000
```

| Option                | Description        | Default   |
| --------------------- | ------------------ | --------- |
| `-m, --model <model>` | LLM model to use   | `gpt-4.1` |
| `--personas <n>`      | Number of personas | `1000`    |
| `--price <usd>`       | Base price in USD  | —         |

#### `flow-check`

Check cognitive flow state for the current innovation session.

```bash
npx tsx apps/cli/src/index.ts flow-check --duration 45 --ideas 15
```

| Option             | Description                 | Default |
| ------------------ | --------------------------- | ------- |
| `--duration <min>` | Session duration in minutes | `30`    |
| `--ideas <n>`      | Ideas generated so far      | `10`    |
| `--stall <min>`    | Minutes since last idea     | `2`     |

#### `regulatory <ideaTitle> [description]`

Simulate regulatory compliance across jurisdictions.

```bash
npx tsx apps/cli/src/index.ts regulatory "AI Diagnostic Tool" --jurisdictions US,EU,UK
```

| Option                   | Description                   | Default   |
| ------------------------ | ----------------------------- | --------- |
| `-m, --model <model>`    | LLM model to use              | `gpt-4.1` |
| `--jurisdictions <list>` | Comma-separated jurisdictions | —         |

:::tip
For the full CLI reference with all options and examples, see the [CLI README](https://github.com/josedab/innovator/blob/main/apps/cli/README.md).
:::

## Angle IDs

Use these IDs with the `--angles` flag:

| ID                 | Name                    |
| ------------------ | ----------------------- |
| `scamper`          | SCAMPER                 |
| `first-principles` | First Principles        |
| `cross-domain`     | Cross-Domain Analogy    |
| `constraints`      | Constraint Injection    |
| `inversion`        | Problem Inversion       |
| `perspectives`     | Role-Based Perspectives |
| `what-if`          | What-If Scenarios       |
| `trend-collision`  | Trend Collision         |

## Examples

```bash
# Quick exploration with 2 angles
npx tsx apps/cli/src/index.ts innovate "electric vehicles" \
  --angles constraints,what-if

# Full analysis with a specific model
npx tsx apps/cli/src/index.ts auto "developer onboarding" --model gpt-5

# Pipe output to a file
npx tsx apps/cli/src/index.ts auto "sustainable packaging" > ideas.txt
```

## Language Support

The CLI supports multi-language output. Use the `--lang` flag to set the response language, or let Innovator auto-detect it from your subject text.

### Supported Languages

| Code | Language   |
| ---- | ---------- |
| `en` | English    |
| `es` | Spanish    |
| `ja` | Japanese   |
| `de` | German     |
| `pt` | Portuguese |

### Examples

```bash
# Explicit language selection
npx tsx apps/cli/src/index.ts investigate "energía solar" --lang es
npx tsx apps/cli/src/index.ts auto "再生可能エネルギー" --lang ja

# Auto-detection: Japanese characters are detected automatically
npx tsx apps/cli/src/index.ts investigate "人工知能の教育応用"
```

If `--lang` is omitted, the language is auto-detected from the subject. English is the default fallback. See [Core Concepts — Multi-Language Support](../core-concepts.md#multi-language-support-i18n) for details on detection behavior.
