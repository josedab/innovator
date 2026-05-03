# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MCP Server** — Model Context Protocol server (`packages/mcp-server/`) exposing `investigate`, `innovate`, and `auto` tools via stdio and SSE transports for Claude Desktop, Cursor, VS Code, and other MCP clients
- **Chat Bot** — Chat platform bot (`packages/bot/`) with Slack, Discord, and Teams adapters
- **Copilot Extensions** — Agent manifest and handler for GitHub Copilot Extensions integration
- **Create Innovator** — `npx create-innovator` scaffolding package for quick project setup
- **GitHub Action** — Automated innovation action for CI/CD workflows
- **Alternative LLM Providers** — Direct OpenAI, Anthropic, and Ollama provider support (non-Copilot usage)
- **PWA Support** — Service worker and offline indicator for the web app
- **Embeddable Widget** — Widget SDK and `/api/widget` endpoint for embedding Innovator in external sites
- **Pipeline API** — Natural language pipeline description endpoint with SSE streaming (`/api/pipeline`)
- **Collaborative Sessions** — `/api/collaborate` endpoint with room codes, voting, commenting, and idea merging
- **Artifact Generation** — `/api/artifacts` endpoint for generating PRDs, user stories, tech specs from ideas
- **Tracker Dashboard** — `/api/tracker` endpoint and dashboard for tracking idea fitness
- **Observatory** — API keys management and prompt observatory endpoints
- **Deep Research Agent** — Extended research agent for in-depth investigation
- **Structured Debate Engine** — Multi-perspective debate on innovation ideas
- **Idea Stress Testing** — Stress-test ideas against adversarial scenarios
- **Executive Decision Packets** — Generate decision-ready documents from innovations
- **Genetic-Algorithm Evolution** — Evolve ideas through selection, crossover, and mutation
- **Innovation Playbook Generator** — Reusable playbook creation from successful innovation patterns
- **LLM Output Quality Gate** — Automated quality checks on LLM responses
- **Investigation Confidence Scoring** — Confidence metrics for investigation results
- **Cross-Session Serendipity** — Discover unexpected connections across investigations
- **Natural Language Pipeline Builder** — Describe pipelines in plain English
- **Innovation Diff Engine** — Compare investigation snapshots
- **Idea Provenance Tracking** — Full lineage tracking for ideas
- **RAG Knowledge Grounding** — Retrieval-augmented generation for grounded responses
- **Comparative Analysis Pipeline** — Side-by-side comparison of multiple subjects
- **Portfolio Lifecycle Management** — Track and manage idea portfolios
- **Event Bus & Webhooks** — Event-driven architecture with webhook delivery
- **Cost Tracking** — Budget management and LLM cost tracking
- **Memory & Learning Module** — Persistent memory across sessions
- **Stakeholder & Scenario Simulation** — Simulate stakeholder reactions and scenarios
- **Idea Deduplication & Clustering** — Detect and merge duplicate ideas
- **Innovation Sprint Mode** — Time-boxed innovation sessions
- **Market Signal Integration** — Live market data integration
- **Idea Dependency Graph** — Analyze dependencies between ideas
- **Audience-Adaptive Output** — Transform outputs for different audiences
- **Prompt Replay & A/B Testing** — Replay and compare prompt variations
- **Idea Validation Engine** — Validate ideas against criteria
- **Model Benchmarking** — Compare LLM model performance
- **Knowledge Graph** — Persistent graph of concepts and relationships
- **Multi-Language Support** — i18n for multiple languages
- **Angle Chaining** — Chain multiple angles sequentially
- **Investigation Depth Tiers** — Configure investigation depth levels
- **Idea Feedback System** — Collect and process feedback on ideas
- **Offline Local-First Mode** — Work offline with local data
- **Idea Fitness Tracker** — Track and score idea fitness over time
- **Compliance & IP Guard Rails** — Screen ideas for compliance issues
- **Shareable Investigation Links** — Share investigations via URL
- **Innovation Gamification** — Gamification engine for innovation activities
- **Adversarial Red Team Analysis** — Challenge ideas from adversarial perspectives
- **Competitive Intelligence** — Analyze competitive landscape
- **Hypothesis-Driven Innovation** — Frame innovations as testable hypotheses
- **Impact Simulator** — Simulate potential impact of ideas
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
