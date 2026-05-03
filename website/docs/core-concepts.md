---
id: core-concepts
title: Core Concepts
sidebar_position: 2
---

# Core Concepts

Understanding the mental model behind Innovator will help you get the most out of it.

## The Innovation Pipeline

Every innovation session follows a three-stage pipeline:

```mermaid
graph LR
    A[Subject] --> B[Investigate]
    B --> C{Select Angles}
    C --> D[Generate Ideas]
    D --> E[Synthesize]
    E --> F[Results]
```

### Stage 1: Investigation

You provide a **subject** — any topic, technology, product, or process. The AI analyzes it and returns a structured investigation:

| Field             | Description                                |
| ----------------- | ------------------------------------------ |
| **Summary**       | A concise 2-3 sentence overview            |
| **Key Aspects**   | 4-6 important components or dimensions     |
| **Current State** | What the state of the art looks like today |
| **Challenges**    | 3-5 main pain points or obstacles          |
| **Opportunities** | 3-5 areas ripe for innovation              |

This investigation becomes the **shared context** for all subsequent angle prompts.

### Stage 2: Angle Selection

You choose which **innovation angles** to apply. Each angle is a proven creative framework that forces thinking in a specific direction.

### Stage 3: Generation & Synthesis

Each selected angle receives the investigation context and generates 3-5 **specific, actionable ideas**. In Auto Mode, a final **synthesis** step cross-references all ideas, identifies themes, and ranks by feasibility.

## Innovation Angles

Innovator ships with 8 built-in angles:

### 🔄 SCAMPER

The classic brainstorming acronym: **S**ubstitute, **C**ombine, **A**dapt, **M**odify, **P**ut to other use, **E**liminate, **R**everse. Each letter forces a different transformation on the subject.

### 🧱 First Principles

Strip away all assumptions and conventions. Decompose the subject to fundamental truths, then rebuild novel solutions from scratch. Inspired by Elon Musk's reasoning approach.

### 🌐 Cross-Domain Analogy

Map concepts from completely unrelated fields — biology, music, architecture, sports, cooking — onto your subject. The most unexpected analogies often produce the most innovative ideas.

### 🔒 Constraint Injection

Add provocative constraints: "What if the budget were $0?", "What if a 10-year-old had to use it?", "What if it had to work offline?" Constraints force creative breakthroughs.

### 🔃 Problem Inversion

Flip the problem: "How would you make this fail?" Analyze each failure mode, then reverse the insights into innovations. The contrast reveals hidden opportunities.

### 👥 Role-Based Perspectives

View the subject through different lenses: end user, competitor, child, historian, sci-fi author, regulator. Each perspective reveals insights invisible from your default viewpoint.

### 💭 What-If Scenarios

Push boundaries with hypotheticals: "What if this had to scale to 1 billion users?", "What if the primary technology disappeared?" Extremes force fundamentally different thinking.

### ⚡ Trend Collision

Combine the subject with emerging trends: AI/LLMs, spatial computing, sustainability, decentralization, biotech, edge computing. Not just "add AI" — genuine novel combinations.

## Idea Structure

Every generated idea includes four fields:

```typescript
interface InnovationIdea {
  title: string; // Short, descriptive name
  description: string; // Full explanation of the idea
  potentialImpact: string; // What difference it could make
  implementationHint: string; // How to begin implementing it
}
```

## Auto Mode Synthesis

When Auto Mode runs all angles, the synthesis step produces:

- **Top 5-7 Ideas** — ranked by feasibility (low/medium/high) with source angle attribution
- **Cross-Cutting Themes** — patterns that emerged across multiple angles
- **Strategic Recommendation** — an actionable summary of where to focus

## Architecture

```mermaid
graph TB
    subgraph "packages/core"
        CopilotClient[Copilot SDK Client]
        Prompts[Prompt Templates]
        Investigate[investigate]
        Generate[generateForAngle]
        Pipeline[runAutoPipeline]

        CopilotClient --> Investigate
        CopilotClient --> Generate
        Prompts --> Investigate
        Prompts --> Generate
        Investigate --> Pipeline
        Generate --> Pipeline
    end

    subgraph "apps/web"
        API[API Routes]
        UI[React Components]
        API --> Investigate
        API --> Generate
        API --> Pipeline
        UI --> API
    end

    subgraph "apps/cli"
        CLI[Commander.js CLI]
        CLI --> Investigate
        CLI --> Generate
        CLI --> Pipeline
    end
```

The **core** package is the shared engine. Both the web app and CLI are thin adapters that call into it.

## Runtime Validation

LLM responses are inherently unstructured text. Innovator uses [Zod](https://zod.dev/) schemas to validate and parse the JSON output from the LLM before it reaches consumers. If the LLM returns malformed or unexpected data, validation fails fast with a descriptive error instead of propagating bad data downstream.

Four schemas are exported from `@innovator/core`:

| Schema                 | Validates                                             |
| ---------------------- | ----------------------------------------------------- |
| `InvestigationSchema`  | Investigation results (summary, aspects, challenges…) |
| `InnovationIdeaSchema` | A single idea (title, description, impact, hint)      |
| `AngleResultSchema`    | One angle's output (ideas array + reasoning)          |
| `SynthesisSchema`      | Final synthesis (top ideas, themes, recommendation)   |

Each schema enforces field presence, types, and maximum string lengths to guard against oversized or malformed LLM output. The corresponding TypeScript types (`Investigation`, `InnovationIdea`, `AngleResult`, `Synthesis`) are inferred directly from these schemas via `z.infer`, so runtime validation and compile-time types are always in sync.

## Beyond the Pipeline

The three-stage pipeline and 8 angles form the foundation, but Innovator includes several advanced systems that extend the core workflow.

### Workspaces & Collaboration

Multiple users can innovate together in real time through **collaborative sessions**. A host creates a session, shares a join code, and participants submit ideas, vote, and comment. Angles can be assigned to specific participants so the team covers different creative perspectives in parallel. When the session completes, ideas can be merged and exported.

Key concepts:

- **Session** — a shared workspace scoped to a single subject.
- **Participants** — users who join via a share code.
- **Voting & Comments** — lightweight prioritisation within the session.
- **Merge** — combine overlapping ideas from different participants into one.

### Memory & Learning System

Innovator can learn from your behaviour over time. The **memory system** records signals — which angles you select, which ideas you act on, which subjects you return to — and builds a **preference profile**. Future sessions use this profile to surface more relevant ideas.

Key concepts:

- **User Signals** — discrete events such as `angle_selected`, `idea_bookmarked`, or `session_completed`.
- **Preference Profile** — an aggregated view of angle affinity, topic interests, and engagement patterns.
- **A/B Testing** — the system can split users into `adapted` vs. `default` variants to measure whether personalisation improves outcomes.

### Innovation Sprints

For structured, multi-phase innovation work, **sprints** organise ideas through three phases:

| Phase        | Purpose                                     |
| ------------ | ------------------------------------------- |
| **Diverge**  | Generate as many ideas as possible          |
| **Converge** | Evaluate, score, and shortlist ideas        |
| **Refine**   | Deepen the best ideas into actionable plans |

Sprints are persistent — they can be paused, resumed, and reviewed later. A retrospective can be generated at the end to capture learnings.

### Portfolio Tracking

The **portfolio** tracks ideas across their full lifecycle: `ideation` → `evaluation` → `prototyping` → `shipped` (or `abandoned`). Each transition is recorded with timestamps, reasons, and optional user attribution.

Portfolio metrics include:

- **Conversion rates** between stages (e.g. ideation → evaluation).
- **Average time in stage** to identify bottlenecks.
- **Velocity** — ideas created per week.
- **Insights** — automated analysis that flags strengths, warnings, and opportunities.

### Compliance & IP Screening

Before pursuing an idea, the **compliance module** can screen it for potential intellectual property conflicts and regulatory constraints. Ideas are checked against a database of industry-specific regulations (healthcare, finance, etc.) and the results include risk levels and recommended next steps.

### Voice Interaction

Innovator supports **voice-driven workflows**. Users can speak commands like _"investigate solar energy"_ or _"next angle"_, and the system parses them into actions. Results can be narrated back via text-to-speech. Speech-to-text and text-to-speech providers are pluggable.

Built-in voice commands: `investigate`, `next-angle`, `previous-angle`, `score-this`, `refine`, `export`, `summarize`, `stop`, `help`.

### Plugin System

The **plugin registry** lets you extend Innovator with custom functionality. Three plugin types are supported:

| Type           | What it adds                                      |
| -------------- | ------------------------------------------------- |
| **Angle**      | A new innovation angle with a custom prompt       |
| **Exporter**   | A new export format (beyond Markdown/JSON/GitHub) |
| **Visualizer** | A custom visualisation for idea data              |

Plugins can be registered programmatically or loaded from external sources.

### Market Signals

The **market signals** module enriches innovation sessions with real-world data. Pluggable providers fetch signals from sources like Product Hunt, Hacker News, Google Trends, arXiv, and patent filings. The resulting signal report is injected into prompts to ground ideas in current market context.

### Dependency Graphs

After generating ideas across multiple angles, the **dependency graph** module analyses relationships between them. It identifies which ideas depend on, enable, or conflict with each other, producing a directed graph that helps prioritise implementation order.

### Angle Chaining

**Chains** run angles in a defined sequence where each angle's output feeds into the next. Built-in chains include:

| Chain                    | Angles in sequence                            |
| ------------------------ | --------------------------------------------- |
| **Deep Disruption**      | First Principles → Inversion → Constraints    |
| **Practical Innovation** | SCAMPER → Perspectives → What-If              |
| **Market Entry**         | Cross-Domain → Trend Collision → Perspectives |
| **Contrarian Path**      | Inversion → Constraints → First Principles    |
| **Full Spectrum**        | All 8 angles in optimised order               |

### Custom Angles

Beyond the 8 built-in angles, you can **create custom angles** with your own prompt templates. Custom angles are registered via the API and appear alongside built-in angles in the UI and CLI. They can be scoped to specific domains and tagged for discoverability.

## Multi-Language Support (i18n)

Innovator supports generating investigations and innovations in multiple languages. The system detects the language of your input automatically and instructs the LLM to respond in that language.

### Supported Languages

| Code | Language   | Native Name |
| ---- | ---------- | ----------- |
| `en` | English    | English     |
| `es` | Spanish    | Español     |
| `ja` | Japanese   | 日本語      |
| `de` | German     | Deutsch     |
| `pt` | Portuguese | Português   |

### Language Detection

When you submit a subject, Innovator uses heuristic-based language detection:

- **Japanese** is detected via character sets (Hiragana, Katakana, CJK characters).
- **Spanish, German, and Portuguese** are detected via common word patterns and diacritical characters (e.g., `ñ`, `ü`, `ã`).
- **English** is the fallback when no strong signal is detected.

The detected language is applied to prompt templates so the LLM responds in the same language. JSON field names remain in English for programmatic compatibility — only values are localized.

### Using `--lang` in the CLI

You can explicitly set the output language with the `--lang` flag:

```bash
npx tsx apps/cli/src/index.ts investigate "energía solar" --lang es
npx tsx apps/cli/src/index.ts auto "再生可能エネルギー" --lang ja
```

If `--lang` is not specified, the language is auto-detected from the subject text.
