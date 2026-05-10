---
id: changelog
title: Changelog
sidebar_position: 10
---

# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

For the full changelog, see the [`CHANGELOG.md`](https://github.com/josedab/innovator/blob/main/CHANGELOG.md) file in the repository root.

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
