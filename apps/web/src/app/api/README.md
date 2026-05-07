# API Routes Reference

This document catalogs all API routes exposed by the Innovator web application.

## Overview

- **Total routes:** ~76
- **Framework:** Next.js App Router (`route.ts` handlers)
- **Streaming:** Routes marked with SSE use `ReadableStream` for real-time output
- **Authentication:** Public by default; `/v1/*` routes require API key authentication with rate limiting
- **Validation:** Most POST routes validate `Content-Type: application/json` and request body with Zod schemas

---

## Core Innovation Routes

| Method | Path                    | Auth | Description                                                          |
| ------ | ----------------------- | ---- | -------------------------------------------------------------------- |
| POST   | `/api/investigate`      | No   | Analyze a subject to identify aspects, challenges, and opportunities |
| POST   | `/api/innovate`         | No   | Generate ideas for selected innovation angles with synthesis         |
| POST   | `/api/refine`           | No   | Conversational refinement and exploration trees                      |
| POST   | `/api/validate`         | No   | Patent, market, and feasibility validation                           |
| POST   | `/api/auto`             | No   | Full pipeline automation via SSE streaming                           |
| POST   | `/api/pipeline`         | No   | Parse natural-language pipeline descriptions and execute via SSE     |
| POST   | `/api/pipeline-dag`     | No   | Compile and execute DAG pipelines from descriptions                  |
| POST   | `/api/compare`          | No   | Parallel investigation across multiple subjects                      |
| POST   | `/api/combinatorial`    | No   | Combinatorial synthesis across angles                                |
| POST   | `/api/autonomous-agent` | No   | Self-directed exploration via SSE streaming                          |

## Angles & Presets

| Method | Path           | Auth | Description                                    |
| ------ | -------------- | ---- | ---------------------------------------------- |
| GET    | `/api/angles`  | No   | List all built-in and custom innovation angles |
| POST   | `/api/angles`  | No   | Create or import custom angles                 |
| DELETE | `/api/angles`  | No   | Remove a custom angle by ID                    |
| GET    | `/api/presets` | No   | List innovation presets by category            |

## Analysis & Simulation

| Method    | Path                      | Auth | Description                                          |
| --------- | ------------------------- | ---- | ---------------------------------------------------- |
| POST      | `/api/adaptive-scaling`   | No   | Classify complexity and generate execution plans     |
| POST      | `/api/dependency-graph`   | No   | Build idea dependency graphs (JSON/Markdown/Mermaid) |
| POST      | `/api/diffusion`          | No   | Simulate idea adoption diffusion                     |
| GET, POST | `/api/digital-twin`       | No   | Ecosystem simulation and strategy comparison         |
| POST      | `/api/embedding-explorer` | No   | 3D embedding space and clustering                    |
| POST      | `/api/inverse-decoder`    | No   | Product analysis and innovation recipe generation    |
| POST      | `/api/monte-carlo`        | No   | Simulate idea impact via Monte Carlo analysis        |
| POST      | `/api/nl-visualization`   | No   | Generate D3.js visualizations from natural language  |
| POST      | `/api/patent-scanner`     | No   | Scan ideas for prior art and patent conflicts        |
| POST      | `/api/portfolio-optimize` | No   | Portfolio optimization with Monte Carlo simulation   |
| POST      | `/api/process-mining`     | No   | Mine innovation pipeline events                      |
| POST      | `/api/stakeholders`       | No   | Simulate stakeholder reactions                       |
| POST      | `/api/supply-chain`       | No   | Map supply chain for ideas                           |
| POST      | `/api/timing`             | No   | Analyze implementation timing and milestones         |
| POST      | `/api/wargaming`          | No   | Competitive wargaming scenarios                      |

## Content & Artifacts

| Method | Path              | Auth | Description                                                |
| ------ | ----------------- | ---- | ---------------------------------------------------------- |
| POST   | `/api/artifacts`  | No   | Generate structured artifacts (PRD, user story, tech spec) |
| POST   | `/api/cinematics` | No   | Generate cinematic scripts from sessions                   |
| POST   | `/api/content`    | No   | Generate and revise marketing content from ideas           |
| POST   | `/api/scaffold`   | No   | Generate implementation scaffolding and project templates  |

## Assessment & Evaluation

| Method    | Path               | Auth | Description                                             |
| --------- | ------------------ | ---- | ------------------------------------------------------- |
| GET, POST | `/api/bias`        | No   | Cognitive bias calibration and debiasing challenges     |
| GET, POST | `/api/climate`     | No   | Innovation climate assessment surveys                   |
| GET, POST | `/api/flow-state`  | No   | Assess flow state and intervention recommendations      |
| POST      | `/api/market-test` | No   | Synthetic market test with persona adoption rates       |
| POST      | `/api/negotiate`   | No   | AI-assisted negotiation simulation                      |
| GET, POST | `/api/regulatory`  | No   | Regulatory compliance simulation                        |
| GET, POST | `/api/rubric`      | No   | Create and score ideas with custom rubrics              |
| POST      | `/api/team-dna`    | No   | Analyze team composition and synergies                  |
| POST      | `/api/telemetry`   | No   | Quality metrics, diversity, and hallucination detection |

## Collaboration & Social

| Method    | Path                 | Auth | Description                                          |
| --------- | -------------------- | ---- | ---------------------------------------------------- |
| GET, POST | `/api/collaborate`   | No   | Multi-user collaborative sessions with voting        |
| GET, POST | `/api/idea-exchange` | No   | Publish and search idea marketplace listings         |
| POST      | `/api/idea-version`  | No   | Version control for ideas (log, diff, create, merge) |
| GET, POST | `/api/realtime`      | No   | Real-time collaboration (SSE fallback)               |
| GET, POST | `/api/social`        | No   | Share, like, comment, follow, feed, trending         |

## Data & History

| Method                   | Path               | Auth | Description                                         |
| ------------------------ | ------------------ | ---- | --------------------------------------------------- |
| GET                      | `/api/analytics`   | No   | Retrieve analytics events                           |
| POST                     | `/api/analytics`   | No   | Track analytics events                              |
| GET                      | `/api/cost-report` | No   | Cost analysis and optimization report               |
| GET, POST, DELETE, PATCH | `/api/history`     | No   | Session history management, search, and tagging     |
| POST                     | `/api/memory`      | No   | Record outcomes, model stats, and auto-tune         |
| GET                      | `/api/portfolio`   | No   | Dashboard with comprehensive analytics              |
| POST                     | `/api/search`      | No   | Semantic search, clustering, and document discovery |
| GET                      | `/api/tracker`     | No   | Dashboard with recent tracked ideas                 |

## Sharing & Export

| Method    | Path                | Auth                     | Description                                                          |
| --------- | ------------------- | ------------------------ | -------------------------------------------------------------------- |
| GET, POST | `/api/embed`        | Optional (`X-Embed-Key`) | Embeddable widget with CORS support                                  |
| GET, POST | `/api/export`       | No                       | Multi-format export (Markdown, JSON, PowerPoint, Jira, Notion, etc.) |
| GET, POST | `/api/share`        | No                       | Create shareable investigation links                                 |
| GET, POST | `/api/share/[slug]` | No                       | Retrieve or fork a shared investigation by slug                      |
| GET       | `/api/widget`       | No                       | Serve innovator-widget web component                                 |

## Learning & Curriculum

| Method    | Path              | Auth | Description                               |
| --------- | ----------------- | ---- | ----------------------------------------- |
| GET, POST | `/api/curriculum` | No   | Learning paths, modules, and certificates |

## Mobile & Capture

| Method    | Path                        | Auth | Description                                          |
| --------- | --------------------------- | ---- | ---------------------------------------------------- |
| GET, POST | `/api/mobile`               | No   | Voice, camera, and text capture for mobile companion |
| GET, POST | `/api/meeting-intelligence` | No   | Extract innovation signals from transcripts          |

## Platform & Infrastructure

| Method    | Path                 | Auth | Description                                           |
| --------- | -------------------- | ---- | ----------------------------------------------------- |
| GET       | `/api/health`        | No   | Health check endpoint                                 |
| GET, POST | `/api/github-health` | No   | Analyze repository innovation health                  |
| GET, POST | `/api/distillation`  | No   | Cost-optimized routing (premium vs. distilled models) |
| GET, POST | `/api/marketplace`   | No   | Plugin marketplace search and install                 |
| GET       | `/api/observatory`   | No   | API call monitoring and statistics                    |
| GET, POST | `/api/portal`        | No   | Developer portal (tenants, keys, billing)             |
| POST      | `/api/webhooks`      | No   | Register and list webhooks with event delivery        |

## Programmatic API (v1)

All `/api/v1/*` routes require API key authentication via `X-API-Key` header and enforce rate limiting.

| Method            | Path                  | Auth    | Rate Limit | Description                              |
| ----------------- | --------------------- | ------- | ---------- | ---------------------------------------- |
| POST              | `/api/v1/auto`        | API Key | 10/min     | Streaming or non-streaming full pipeline |
| POST              | `/api/v1/innovate`    | API Key | 20/min     | Generate ideas for angles                |
| POST              | `/api/v1/investigate` | API Key | 30/min     | Investigation endpoint                   |
| GET, POST, DELETE | `/api/v1/keys`        | API Key | —          | Manage API keys                          |
| GET               | `/api/v1/openapi`     | No      | —          | OpenAPI specification                    |
| GET               | `/api/v1/plugins`     | API Key | —          | List registered plugins                  |

---

## Conventions

- **SSE streaming routes:** `auto`, `autonomous-agent`, `embed`, `pipeline`, `v1/auto` return `ReadableStream` with `text/event-stream` content type.
- **Error responses:** All routes return `{ error: string }` with appropriate HTTP status codes (400, 404, 500).
- **Content-Type:** POST routes expect `application/json` unless otherwise noted.
- **CORS:** Only `/api/embed` returns CORS headers; other routes are same-origin.
