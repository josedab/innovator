# ADR-0019: Temporal Knowledge Graph for Innovation Memory

## Status

Accepted

## Context

Innovation is a compounding process — concepts explored in one session may recur months later, ideas evolve across teams, and outcomes from past innovations should inform future methodology choices. However, the existing knowledge graph (`packages/core/src/knowledge-graph/`) stored entities and relationships without temporal dimensions: there was no record of _when_ a concept was first seen, how it evolved, or whether it had been obsoleted.

The team needed a persistent memory system that could answer questions like:

- "How has our thinking about sustainability evolved over the last 6 months?"
- "Which concepts keep recurring across sessions?"
- "What's our innovation velocity — ideas per month, concept evolution rate?"
- "Which methodology led to successful outcomes?"

## Decision

We implement a **temporal knowledge graph** in `packages/core/src/temporal-memory/` where:

- **Nodes** carry creation, modification, and optional obsolescence timestamps, plus occurrence counts and session ID lists.
- **Edges** carry timestamps and encode temporal relationships: `evolved_into`, `caused`, `recurs_as`, `contradicts`, `enables`, `derived_from`, etc.
- **Ingestion** (`ingestSession()`) automatically extracts entities (concepts, ideas, challenges, opportunities, themes, outcomes) from completed innovation sessions and upserts them into the graph, incrementing occurrence counts and linking to sessions.
- **Recurrence detection** (`detectRecurrences()`) identifies concepts appearing across multiple sessions — surfacing patterns the organization rediscovers repeatedly.
- **NL querying** (`queryTemporalMemory()`) uses LLM-powered natural language question answering over graph context.

The graph persists as JSON in `~/.innovator/temporal-memory/` using the atomic-write pattern (ADR-0015).

## Consequences

**Positive:**

- **Organizational memory** — Innovation sessions are no longer ephemeral; concepts accumulate and connect over time.
- **Recurrence detection** — Automatically flags concepts that keep being re-discovered, suggesting they deserve dedicated initiatives.
- **Causal tracking** — Outcome nodes linked via `caused` edges enable methodology-to-outcome attribution.
- **Innovation velocity metrics** — Ideas/month, concept evolution rate, and outcome lead time provide quantitative innovation KPIs.
- **GDPR-compatible** — `deleteSessionData()` removes all graph data associated with a specific session.

**Negative:**

- **Entity extraction quality** — Entities are currently extracted by label matching rather than LLM-powered NER. Similar concepts with different phrasing ("AI ethics" vs. "ethical AI") may create duplicate nodes.
- **Graph growth** — No automatic pruning; long-running instances may accumulate large graphs. Configurable retention policies would help.
- **NL query accuracy** — Depends on LLM quality and graph context fitting within the prompt window.
