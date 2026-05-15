---
id: changelog
title: Changelog
sidebar_position: 10
---

# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the full changelog, see the [`CHANGELOG.md`](https://github.com/josedab/innovator/blob/main/CHANGELOG.md) file in the repository root.

---

## [0.3.0] — 2026-05-14

### Moonshot Modules

Six advanced modules extending the core innovation engine:

- **Adversarial Idea Gauntlet** — Multi-agent stress-testing with 5 adversary personas (Competitor, Regulator, Skeptic, Economist, Engineer), Survivability Index scoring (0–100), and optional Strengthen mode
- **Innovation Provenance Ledger** — Tamper-evident append-only audit trail with SHA-256 hash chaining, GDPR Art. 15 export and Art. 17 erasure support
- **Temporal Innovation Memory** — Persistent temporal knowledge graph tracking concept evolution, idea genealogy, and outcome causality across sessions
- **Sentinel: Always-On Innovation Agent** — Signal monitoring agent collecting RSS/Atom feeds, scoring relevance, and generating daily opportunity briefs with cost budget enforcement
- **Idea Genome Sequencer** — Decomposes ideas into 7 genome traits with Jaccard similarity search and LLM-powered recombination
- **Federation DP** — Differential privacy layer for cross-organization pattern sharing using Laplace mechanism with privacy budget tracking

### Web App UX

- **Global Navigation** — Collapsible sidebar with 21 pages grouped into Create/Explore/Analyze/Tools, mobile hamburger menu
- **Dark Mode Toggle** — Light/dark/system theme switcher persisted to localStorage
- **Session Persistence** — Auto-saves results to localStorage with recent sessions list and restore capability
- **Results Action Bar** — Sticky export toolbar with Copy Markdown, Copy JSON, Download .md, and Download .json
- **Copy-to-Clipboard** — Reusable `CopyButton` for investigation summary, synthesis, and idea cards
- **Elapsed Timer** — Progress indication with elapsed time during loading states
- **Onboarding Wizard** — First-run experience with role selection and preset angles
- **Improved Error Messages** — Context-aware parsing for rate limits, timeouts, auth failures, and network errors

### Documentation

- 10 new Architecture Decision Records (ADR-0013 through ADR-0022)
- Updated API Reference with full moonshot module documentation
- Updated Developer Guide with 4 new recipe sections
- Root AGENTS.md for AI-assisted development

### Developer Experience

- Shared test factories for typed test data builders
- Coverage thresholds raised from 35% to 50%
- ESLint `--cache` for faster pre-commit linting
- Resolved 6 high-severity npm vulnerabilities

---

## [0.2.0] — 2025-05-10

### Packages & Integrations

- **MCP Server** — Model Context Protocol server exposing `investigate`, `innovate`, and `auto` tools via stdio and SSE transports
- **Chat Bot** — Slack, Discord, and Teams adapters with `/innovate` command
- **Copilot Extensions** — Agent manifest and handler for GitHub Copilot Extensions
- **Create Innovator** — `npx create-innovator` scaffolding CLI
- **GitHub Action** — CI/CD action for automated innovation analysis

### LLM & Providers

- Alternative LLM providers (OpenAI, Anthropic, Ollama)
- Cost tracking and budget management
- Model benchmarking and comparison
- Model routing — different models for investigation, generation, and synthesis

### Innovation Engine

- Structured debate engine, genetic-algorithm evolution, idea stress testing
- Deep research agent, hypothesis-driven innovation, adversarial red team analysis
- Comparative analysis pipeline, angle chaining, investigation depth tiers
- Natural language pipeline builder, stakeholder simulation, impact simulation

### Data & Knowledge

- RAG knowledge grounding, persistent knowledge graph
- Memory and learning module, idea provenance tracking
- Market signal integration, competitive intelligence

### Collaboration & Management

- Collaborative sessions with room codes, voting, commenting, and idea merging
- Portfolio lifecycle management, idea validation engine
- Idea deduplication and clustering, dependency graphs
- Shareable investigation links

### Output & Export

- Artifact generation (PRDs, user stories, tech specs, pitch decks)
- Executive decision packets, innovation playbooks
- Audience-adaptive output, multi-language support

### Platform & UX

- PWA support with offline indicator
- Embeddable widget SDK
- Pipeline API with SSE streaming
- Event bus and webhook delivery system

---

## [0.1.0] — 2025-05-01

### Added

- Initial release of Innovator — AI-powered innovation engine
- Subject investigation via GitHub Copilot SDK
- 8 innovation angles: SCAMPER, First Principles, Cross-Domain Analogy, Constraint Injection, Problem Inversion, Role-Based Perspectives, What-If Scenarios, Trend Collision
- Auto mode pipeline with synthesis
- Next.js web application with investigation → angle selection → results flow
- CLI tool with progress indicators
- Shared `@innovator/core` package
- Monorepo setup with npm workspaces
- CI pipeline with lint, typecheck, build, and test
- Docusaurus documentation website
