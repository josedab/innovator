# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No unreleased changes._

## [0.2.0] — 2025-05-10

### Added

#### Packages & Integrations

- **MCP Server** — Model Context Protocol server (`packages/mcp-server/`) exposing `investigate`, `innovate`, and `auto` tools via stdio and SSE transports for Claude Desktop, Cursor, VS Code, and other MCP clients
- **Chat Bot** — Chat platform bot (`packages/bot/`) with Slack, Discord, and Teams adapters
- **Copilot Extensions** — Agent manifest and handler for GitHub Copilot Extensions integration
- **Create Innovator** — `npx create-innovator` scaffolding package for quick project setup
- **GitHub Action** — Automated innovation action for CI/CD workflows

#### LLM & Providers

- **Alternative LLM Providers** — Direct OpenAI, Anthropic, and Ollama provider support (non-Copilot usage)
- **Cost Tracking** — Budget management and LLM cost tracking
- **Model Benchmarking** — Compare LLM model performance
- **LLM Output Quality Gate** — Automated quality checks on LLM responses
- **Prompt Replay & A/B Testing** — Replay and compare prompt variations
- **Investigation Confidence Scoring** — Confidence metrics for investigation results
- **Observatory** — API keys management and prompt observatory endpoints

#### Innovation Engine

- **Comparative Analysis Pipeline** — Side-by-side comparison of multiple subjects
- **Structured Debate Engine** — Multi-perspective debate on innovation ideas
- **Genetic-Algorithm Evolution** — Evolve ideas through selection, crossover, and mutation
- **Idea Stress Testing** — Stress-test ideas against adversarial scenarios
- **Deep Research Agent** — Extended research agent for in-depth investigation
- **Hypothesis-Driven Innovation** — Frame innovations as testable hypotheses
- **Adversarial Red Team Analysis** — Challenge ideas from adversarial perspectives
- **Angle Chaining** — Chain multiple angles sequentially
- **Investigation Depth Tiers** — Configure investigation depth levels
- **Cross-Session Serendipity** — Discover unexpected connections across investigations
- **Innovation Diff Engine** — Compare investigation snapshots
- **Innovation Sprint Mode** — Time-boxed innovation sessions
- **Natural Language Pipeline Builder** — Describe pipelines in plain English
- **Stakeholder & Scenario Simulation** — Simulate stakeholder reactions and scenarios
- **Impact Simulator** — Simulate potential impact of ideas

#### Data & Knowledge

- **RAG Knowledge Grounding** — Retrieval-augmented generation for grounded responses
- **Knowledge Graph** — Persistent graph of concepts and relationships
- **Memory & Learning Module** — Persistent memory across sessions
- **Idea Provenance Tracking** — Full lineage tracking for ideas
- **Market Signal Integration** — Live market data integration
- **Competitive Intelligence** — Analyze competitive landscape

#### Collaboration & Management

- **Collaborative Sessions** — `/api/collaborate` endpoint with room codes, voting, commenting, and idea merging
- **Portfolio Lifecycle Management** — Track and manage idea portfolios
- **Idea Validation Engine** — Validate ideas against criteria
- **Idea Deduplication & Clustering** — Detect and merge duplicate ideas
- **Idea Dependency Graph** — Analyze dependencies between ideas
- **Idea Feedback System** — Collect and process feedback on ideas
- **Idea Fitness Tracker** — Track and score idea fitness over time
- **Shareable Investigation Links** — Share investigations via URL

#### Output & Export

- **Artifact Generation** — `/api/artifacts` endpoint for generating PRDs, user stories, tech specs from ideas
- **Executive Decision Packets** — Generate decision-ready documents from innovations
- **Innovation Playbook Generator** — Reusable playbook creation from successful innovation patterns
- **Audience-Adaptive Output** — Transform outputs for different audiences
- **Multi-Language Support** — i18n for multiple languages

#### Platform & UX

- **PWA Support** — Service worker and offline indicator for the web app
- **Embeddable Widget** — Widget SDK and `/api/widget` endpoint for embedding Innovator in external sites
- **Pipeline API** — Natural language pipeline description endpoint with SSE streaming (`/api/pipeline`)
- **Tracker Dashboard** — `/api/tracker` endpoint and dashboard for tracking idea fitness
- **Offline Local-First Mode** — Work offline with local data
- **Compliance & IP Guard Rails** — Screen ideas for compliance issues
- **Innovation Gamification** — Gamification engine for innovation activities
- **Event Bus & Webhooks** — Event-driven architecture with webhook delivery
- **Industry Vertical Packs** — Pre-configured templates for specific industries
- **Web App** — Explore examples, idea workshop with drag-and-drop, priority matrix, idea map, OpenGraph metadata
- **CLI** — Interactive refine, benchmark, provider config, depth/language/chain/feedback/offline commands, serendipitous connections, diff, and pipeline runner commands

### Changed

- Renamed `cosineSimilarity` export to avoid naming collisions
- Exported IdeaMap utility functions for testability
- Added client-safe subpath export for core types

### Fixed

- JSON parse error messages now include descriptive details in API routes
- Resolved unused variable lint warnings in core package

## [0.1.0] — 2025-05-01

### Added

- Initial release of Innovator — AI-powered innovation engine
- Subject investigation via GitHub Copilot SDK
- 8 innovation angles: SCAMPER, First Principles, Cross-Domain Analogy, Constraint Injection, Problem Inversion, Role-Based Perspectives, What-If Scenarios, Trend Collision
- Auto mode pipeline with synthesis
- Next.js web application with investigation → angle selection → results flow
- CLI tool with progress indicators
- Shared `@innovator/core` package with types, prompts, and pipeline logic
- Monorepo setup with npm workspaces
- CI pipeline with lint, typecheck, build, and test
- Docusaurus documentation website
