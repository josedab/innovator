# @innovator/cli

Command-line interface for the Innovator AI-powered innovation engine.

## Prerequisites

- Node.js 20+
- GitHub Copilot subscription
- GitHub CLI authenticated (`gh auth login`)

## Usage

```bash
# Via the root workspace shortcut
npm run cli -- <command> [options]

# Or directly with tsx
npx tsx apps/cli/src/index.ts <command> [options]
```

## Commands

### Core Commands

#### `investigate <subject>`

Analyze a subject to identify key aspects, challenges, and opportunities.

```bash
npm run cli -- investigate "code review processes"
npm run cli -- investigate "home automation" --model gpt-5
npm run cli -- investigate "AI ethics" --depth deep --lang es
npm run cli -- investigate "sustainable packaging" --file ./context.md
```

| Option                | Description                                           | Default    |
| --------------------- | ----------------------------------------------------- | ---------- |
| `-m, --model <model>` | LLM model to use                                      | `gpt-4.1`  |
| `--depth <depth>`     | Investigation depth: `shallow`, `standard`, or `deep` | `standard` |
| `--lang <language>`   | Output language: `en`, `es`, `ja`, `de`, `pt`         | `en`       |
| `--score`             | Score and rank ideas after generation                 | —          |
| `--file <path>`       | Use a file or directory as context input              | —          |
| `--url <url>`         | Use a URL as context input                            | —          |

#### `innovate <subject> --angles <angles>`

Generate innovations for a subject using selected angles. Requires `--angles`.

```bash
npm run cli -- innovate "code review processes" --angles scamper,first-principles
npm run cli -- innovate "home automation" --angles inversion,what-if,trend-collision
```

| Option                | Description                              | Default   |
| --------------------- | ---------------------------------------- | --------- |
| `-m, --model <model>` | LLM model to use                         | `gpt-4.1` |
| `--angles <ids>`      | Comma-separated angle IDs (**required**) | —         |
| `--score`             | Score and rank ideas after generation    | —         |
| `--file <path>`       | Use a file or directory as context input | —         |
| `--url <url>`         | Use a URL as context input               | —         |

#### `auto <subject>`

Run the full innovation pipeline automatically — all 8 angles plus synthesis.

```bash
npm run cli -- auto "code review processes"
npm run cli -- auto "home automation" --model gpt-5
npm run cli -- auto "AI ethics" --depth deep --playbook --debate
```

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

#### `evolve <subject>`

Evolve ideas through genetic-algorithm-inspired mutation and crossover.

```bash
npm run cli -- evolve "remote work tools" --generations 5 --population 8
```

| Option                | Description                            | Default   |
| --------------------- | -------------------------------------- | --------- |
| `-m, --model <model>` | LLM model to use                       | `gpt-4.1` |
| `--generations <n>`   | Number of evolution generations (1–10) | `3`       |
| `--population <n>`    | Population size per generation         | `6`       |

#### `diff <subjectA> <subjectB>`

Compare two snapshots of a subject and generate an innovation diff.

```bash
npm run cli -- diff "remote work in 2020" "remote work in 2026"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `run <description>`

Run a pipeline described in natural language. The description is parsed into pipeline phases and angles automatically.

```bash
npm run cli -- run "investigate solar energy and generate ideas using first-principles"
npm run cli -- run "deep dive into AI ethics with all angles and synthesis"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `refine <subject>`

Start an interactive refinement session on a completed auto pipeline. Allows iterative conversation to deepen and refine results.

```bash
npm run cli -- refine "sustainable packaging"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `connections`

Find serendipitous connections across past investigations.

```bash
npm run cli -- connections --min-similarity 0.5 --max 5
```

| Option                         | Description                        | Default   |
| ------------------------------ | ---------------------------------- | --------- |
| `--min-similarity <threshold>` | Minimum similarity threshold (0–1) | `0.3`     |
| `--max <count>`                | Maximum connections to show        | `10`      |
| `-m, --model <model>`          | LLM model to use for explanations  | `gpt-4.1` |

### Angle Chain Commands

#### `chain list`

List available pre-defined angle chains for composed innovation.

```bash
npm run cli -- chain list
```

#### `chain run <chainId> <subject>`

Run an angle chain by ID.

```bash
npm run cli -- chain run deep-disruption "AI in healthcare"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

### Feedback Commands

#### `feedback summary`

Show per-angle quality scores from collected feedback.

```bash
npm run cli -- feedback summary
```

#### `feedback rate <angleId> <rating>`

Rate an idea from a session.

```bash
npm run cli -- feedback rate scamper up --idea "Smart Packaging" --comment "Very actionable"
```

| Option             | Description        | Default   |
| ------------------ | ------------------ | --------- |
| `--idea <title>`   | Idea title to rate | `general` |
| `--comment <text>` | Optional comment   | —         |
| `--session <id>`   | Session ID         | —         |

### Angle Management

#### `angles list`

List all available innovation angles (built-in and custom).

```bash
npm run cli -- angles list
```

#### `angles create`

Create a new custom innovation angle.

```bash
npm run cli -- angles create --name "Biomimicry" --description "Nature-inspired solutions" --icon 🌿
```

| Option                 | Description                      | Default |
| ---------------------- | -------------------------------- | ------- |
| `--name <name>`        | Angle name (**required**)        | —       |
| `--description <desc>` | Angle description (**required**) | —       |
| `--icon <icon>`        | Emoji icon                       | `🔧`    |
| `--author <author>`    | Author name                      | —       |
| `--tags <tags>`        | Comma-separated tags             | —       |

#### `angles remove <id>`

Remove a custom angle by ID.

```bash
npm run cli -- angles remove biomimicry
```

#### `angles export`

Export custom angles to an angle pack file.

```bash
npm run cli -- angles export --angles biomimicry,custom-1 -o my-angles.angle.json
```

| Option                | Description                                 | Default             |
| --------------------- | ------------------------------------------- | ------------------- |
| `--angles <ids>`      | Comma-separated angle IDs (defaults to all) | all                 |
| `-o, --output <file>` | Output file path                            | `angles.angle.json` |

#### `angles import <file>`

Import angles from an `.angle.json` pack file.

```bash
npm run cli -- angles import my-angles.angle.json
```

### Export

#### `export <sessionId>`

Export a session to Markdown, JSON, or GitHub Issue format.

```bash
npm run cli -- export abc123 --format markdown -o report.md
npm run cli -- export abc123 --format github-issue
```

| Option                  | Description                                       | Default    |
| ----------------------- | ------------------------------------------------- | ---------- |
| `-f, --format <format>` | Export format: `markdown`, `json`, `github-issue` | `markdown` |
| `-o, --output <file>`   | Output file path (defaults to stdout)             | stdout     |

### Session History

#### `history list`

List recent innovation sessions.

```bash
npm run cli -- history list -n 20 --search "AI" --tag important
```

| Option             | Description                  | Default |
| ------------------ | ---------------------------- | ------- |
| `-n, --limit <n>`  | Number of sessions to show   | `10`    |
| `--search <query>` | Search by subject or content | —       |
| `--tag <tag>`      | Filter by tag                | —       |

#### `history show <id>`

Show details of a session.

```bash
npm run cli -- history show abc123
```

#### `history tag <id> <tags...>`

Add tags to a session.

```bash
npm run cli -- history tag abc123 important follow-up
```

#### `history delete <id>`

Delete a session from history.

```bash
npm run cli -- history delete abc123
```

### Presets

#### `presets list`

List all available domain presets.

```bash
npm run cli -- presets list
```

#### `presets run <presetId> <subject>`

Run the auto pipeline with a preset's configuration.

```bash
npm run cli -- presets run startup-mvp "food delivery optimization"
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

```bash
npm run cli -- plugin list
```

#### `plugin load <source>`

Load a plugin from a file path or npm package.

```bash
npm run cli -- plugin load ./my-plugin.ts
npm run cli -- plugin load innovator-plugin-sustainability
```

#### `plugin create <name>`

Scaffold a new plugin project.

```bash
npm run cli -- plugin create my-plugin --type angle
```

| Option          | Description                                       | Default |
| --------------- | ------------------------------------------------- | ------- |
| `--type <type>` | Plugin type: `angle`, `exporter`, or `visualizer` | `angle` |

### Benchmark

#### `benchmark <subject>`

Compare innovation quality across LLM models.

```bash
npm run cli -- benchmark "sustainable energy" --models gpt-4.1,claude-sonnet-4.5
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

```bash
npm run cli -- config show
```

#### `config set-provider <provider>`

Set the default LLM provider.

```bash
npm run cli -- config set-provider openai
```

Supported providers: `copilot`, `openai`, `anthropic`, `ollama`

#### `config set-model <stage> <model>`

Set the preferred model for a pipeline stage.

```bash
npm run cli -- config set-model investigation gpt-4.1
npm run cli -- config set-model generation claude-sonnet-4.5
npm run cli -- config set-model synthesis gpt-4.1
```

#### `providers`

List available LLM providers and their status.

```bash
npm run cli -- providers
```

#### `setup-offline`

Configure Ollama for offline / local-first innovation.

```bash
npm run cli -- setup-offline
```

Detects Ollama installation, checks available models, and configures the CLI for offline use with recommended models.

### Marketplace

#### `marketplace search [query]`

Search the plugin marketplace.

```bash
npm run cli -- marketplace search "sustainability"
npm run cli -- marketplace search --category angles
```

| Option                  | Description        | Default |
| ----------------------- | ------------------ | ------- |
| `--category <category>` | Filter by category | —       |

#### `marketplace install <pluginId>`

Install a plugin from the marketplace.

```bash
npm run cli -- marketplace install sustainability-pack
```

#### `marketplace publish`

Publish a plugin to the marketplace.

```bash
npm run cli -- marketplace publish \
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
npm run cli -- radar watch "AI in healthcare" --frequency weekly
npm run cli -- radar watch "sustainable packaging" --webhook https://hooks.slack.com/...
```

| Option               | Description                                   | Default  |
| -------------------- | --------------------------------------------- | -------- |
| `--frequency <freq>` | Check frequency: `daily`, `weekly`, `monthly` | `weekly` |
| `--webhook <url>`    | Webhook URL for alerts                        | —        |

#### `radar list`

List all watched subjects.

```bash
npm run cli -- radar list
```

### Scaffold

#### `scaffold`

Generate implementation scaffolding from an idea.

```bash
npm run cli -- scaffold --title "Smart Packaging" --description "AI-powered freshness detection" --stack typescript
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
npm run cli -- wargame "AI diagnostics" --idea "AI Health Scanner" --description "AI-powered diagnostic tool" --rounds 3
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
npm run cli -- rubric list
```

#### `rubric show <id>`

Show rubric details including dimensions and weights.

```bash
npm run cli -- rubric show innovation-quality
```

### Competitive Intelligence

#### `monitor create`

Create a competitive monitor.

```bash
npm run cli -- monitor create --domain "AI code generation" --competitors "Copilot,Cursor,Cody" --frequency daily
```

| Option                 | Description                                       | Default |
| ---------------------- | ------------------------------------------------- | ------- |
| `--domain <domain>`    | Domain to monitor (**required**)                  | —       |
| `--competitors <list>` | Comma-separated competitor names                  | —       |
| `--keywords <list>`    | Comma-separated keywords                          | —       |
| `--frequency <freq>`   | Monitoring frequency: `hourly`, `daily`, `weekly` | `daily` |

#### `monitor list`

List active competitive monitors.

```bash
npm run cli -- monitor list
```

#### `monitor signals`

View detected competitive signals.

```bash
npm run cli -- monitor signals --domain "AI code generation" --limit 20
```

| Option              | Description         | Default |
| ------------------- | ------------------- | ------- |
| `--domain <domain>` | Filter by domain    | —       |
| `--limit <n>`       | Max signals to show | `20`    |

### Provenance

#### `provenance <sessionId>`

View provenance and citation chain for ideas in a session.

```bash
npm run cli -- provenance abc123
npm run cli -- provenance abc123 --format markdown
npm run cli -- provenance abc123 --format json-ld
```

| Option              | Description                                  | Default |
| ------------------- | -------------------------------------------- | ------- |
| `--format <format>` | Output format: `text`, `markdown`, `json-ld` | `text`  |

### Cost Report

#### `cost-report`

Generate an LLM cost-performance report showing total cost, tokens, and routing recommendations.

```bash
npm run cli -- cost-report
npm run cli -- cost-report --markdown
```

| Option       | Description        | Default |
| ------------ | ------------------ | ------- |
| `--markdown` | Output as Markdown | —       |

### Supply Chain

#### `supply-chain <subject>`

Map the innovation supply chain for an idea, identifying build/buy/partner decisions.

```bash
npm run cli -- supply-chain "smart packaging" --idea "AI Freshness Sensor" --description "Embedded freshness detection"
```

| Option                 | Description                     | Default   |
| ---------------------- | ------------------------------- | --------- |
| `--idea <title>`       | Idea title (**required**)       | —         |
| `--description <desc>` | Idea description (**required**) | —         |
| `-m, --model <model>`  | LLM model to use                | `gpt-4.1` |
| `--markdown`           | Output as Markdown              | —         |

### Timing

#### `timing <subject>`

Analyze optimal execution timing for ideas, including market maturity and urgency scoring.

```bash
npm run cli -- timing "AI in healthcare"
npm run cli -- timing "electric vehicles" --markdown
```

| Option                | Description        | Default   |
| --------------------- | ------------------ | --------- |
| `-m, --model <model>` | LLM model to use   | `gpt-4.1` |
| `--markdown`          | Output as Markdown | —         |

### Telemetry

#### `telemetry`

View innovation pipeline telemetry and metrics including stage performance, angle metrics, and recent spans.

```bash
npm run cli -- telemetry
```

### Webhooks

#### `webhooks templates`

List available webhook templates (Slack, GitHub Issues, Jira, Email).

```bash
npm run cli -- webhooks templates
```

#### `webhooks list`

List registered webhooks and their status.

```bash
npm run cli -- webhooks list
```

### Context (RAG)

#### `context add`

Add a knowledge source connector for RAG context grounding.

```bash
npm run cli -- context add --type github --name "My Repo" --repo owner/repo
npm run cli -- context add --type local-file --name "Docs" --path ./docs
npm run cli -- context add --type confluence --name "Wiki" --url https://wiki.example.com --space ENG
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

```bash
npm run cli -- context list
```

#### `context sync <id>`

Sync a connector to fetch the latest documents.

```bash
npm run cli -- context sync github-123456
```

### Data Migration

#### `migrate`

Migrate file-based data (`~/.innovator/`) into a SQLite database.

```bash
npm run cli -- migrate
npm run cli -- migrate --db ~/.innovator/innovator.db
```

| Option        | Description               | Default                     |
| ------------- | ------------------------- | --------------------------- |
| `--db <path>` | SQLite database file path | `~/.innovator/innovator.db` |

### Data Migration

#### `migrate`

Migrate file-based data (`~/.innovator/`) into a SQLite database.

```bash
npm run cli -- migrate
npm run cli -- migrate --db ~/.innovator/innovator.db
```

| Option        | Description               | Default                     |
| ------------- | ------------------------- | --------------------------- |
| `--db <path>` | SQLite database file path | `~/.innovator/innovator.db` |

### Idea Version Control (IdeaGit)

#### `idea log <ideaId>`

Show version history for an idea, similar to `git log`.

```bash
npm run cli -- idea log idea-abc123
npm run cli -- idea log idea-abc123 --branch experimental
```

| Option            | Description      | Default |
| ----------------- | ---------------- | ------- |
| `--branch <name>` | Filter by branch | —       |

#### `idea branch <versionId> <branchName>`

Create a branch from an existing version to explore alternative directions.

```bash
npm run cli -- idea branch ver-abc123 experimental
```

#### `idea diff <fromId> <toId>`

Compute a semantic diff between two idea versions, showing field-level changes and significance.

```bash
npm run cli -- idea diff ver-abc123 ver-def456
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `decode <productDescription>`

Reverse-engineer a product's innovation recipe — identify the patterns, angles, and steps that created it.

```bash
npm run cli -- decode "Spotify's Discover Weekly personalized playlist"
```

| Option                | Description      | Default   |
| --------------------- | ---------------- | --------- |
| `-m, --model <model>` | LLM model to use | `gpt-4.1` |

#### `diffusion <ideaTitle> [description]`

Simulate idea diffusion and adoption using the Bass model with optional Monte Carlo simulation.

```bash
npm run cli -- diffusion "AI Code Review" "Automated code review using AI" --iterations 1000
```

| Option                | Description                 | Default   |
| --------------------- | --------------------------- | --------- |
| `-m, --model <model>` | LLM model to use            | `gpt-4.1` |
| `--no-monte-carlo`    | Skip Monte Carlo simulation | —         |
| `--iterations <n>`    | Monte Carlo iterations      | `500`     |

#### `classify <subject>`

Classify subject complexity and generate an adaptive execution plan with recommended depth, angles, and model selection.

```bash
npm run cli -- classify "quantum computing applications"
npm run cli -- classify "sustainable packaging" --depth deep
```

| Option            | Description                                                   | Default |
| ----------------- | ------------------------------------------------------------- | ------- |
| `--depth <depth>` | Preferred depth: `overview`, `standard`, `deep`, `exhaustive` | —       |

#### `market-test <ideaTitle> [description]`

Run a synthetic market test with AI consumer personas to estimate adoption rates and pricing.

```bash
npm run cli -- market-test "AI Health Scanner" "Personal health diagnostics" --personas 2000 --price 29.99
```

| Option                | Description        | Default   |
| --------------------- | ------------------ | --------- |
| `-m, --model <model>` | LLM model to use   | `gpt-4.1` |
| `--personas <n>`      | Number of personas | `1000`    |
| `--price <usd>`       | Base price in USD  | —         |

#### `flow-check`

Check cognitive flow state for the current innovation session.

```bash
npm run cli -- flow-check --duration 45 --ideas 15 --stall 5
```

| Option             | Description                 | Default |
| ------------------ | --------------------------- | ------- |
| `--duration <min>` | Session duration in minutes | `30`    |
| `--ideas <n>`      | Ideas generated so far      | `10`    |
| `--stall <min>`    | Minutes since last idea     | `2`     |

#### `regulatory <ideaTitle> [description]`

Simulate regulatory compliance across jurisdictions.

```bash
npm run cli -- regulatory "AI Diagnostic Tool" "AI-powered medical diagnostics" --jurisdictions US,EU,UK
```

| Option                   | Description                   | Default   |
| ------------------------ | ----------------------------- | --------- |
| `-m, --model <model>`    | LLM model to use              | `gpt-4.1` |
| `--jurisdictions <list>` | Comma-separated jurisdictions | —         |

## Global Options

| Option             | Description                                 |
| ------------------ | ------------------------------------------- |
| `-m, --model <id>` | LLM model to use (default: `gpt-4.1`)       |
| `--verbose`        | Show prompts, responses, and timing details |
| `-V, --version`    | Display version number                      |
| `-h, --help`       | Show help for any command                   |

## Configuration

The CLI uses the same environment variables as the web app:

| Variable                   | Description                               | Default   |
| -------------------------- | ----------------------------------------- | --------- |
| `INNOVATOR_DEFAULT_MODEL`  | Default LLM model                         | `gpt-4.1` |
| `INNOVATOR_LLM_TIMEOUT_MS` | LLM request timeout in milliseconds       | `90000`   |
| `INNOVATOR_EXTRA_MODELS`   | Comma-separated additional allowed models | —         |

## Examples

```bash
# Quick investigation
npm run cli -- investigate "sustainable packaging"

# Targeted innovation with two angles
npm run cli -- innovate "sustainable packaging" --angles constraints,cross-domain

# Full pipeline with verbose output
npm run cli -- auto "sustainable packaging" --verbose

# Use a specific model
npm run cli -- auto "sustainable packaging" --model claude-sonnet-4.5
```

## Building

```bash
npm run build -w apps/cli
```
