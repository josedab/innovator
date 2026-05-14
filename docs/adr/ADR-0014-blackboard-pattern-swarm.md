# ADR-0014: Blackboard Pattern for Multi-Agent Swarm Intelligence

## Status

Accepted

## Context

The swarm innovation module (`packages/core/src/swarm/`) needed a coordination mechanism for multiple AI agents with distinct personalities (risk-taker, pragmatist, contrarian, domain-expert, etc.) to collaboratively generate ideas. Three coordination patterns were considered:

1. **Direct agent-to-agent messaging** — Each agent sends messages to specific other agents. Complex to orchestrate, hard to audit, and agent count changes require topology updates.
2. **Centralized orchestrator** — A single controller dispatches tasks and collects results. Simple but eliminates emergent behavior.
3. **Shared blackboard** — All agents read from and write to a common data structure. Agents post ideas, react to others' ideas, and a convergence function synthesizes the result.

## Decision

We adopt the **blackboard pattern** where agents share a `Blackboard` data structure containing all posted ideas (as `BlackboardEntry` objects) and a `convergenceScore` metric. Each agent:

1. **Explores** — Generates 1–2 ideas informed by its personality and existing blackboard entries.
2. **Reacts** — Reviews other agents' ideas and posts endorsements, challenges, extensions, or merge proposals.
3. **Converges** — A synthesis step evaluates all entries and reactions, computing a convergence score.

The blackboard is append-only during a round; agents see the same snapshot. Personality descriptions are injected into prompts to differentiate agent behavior without fine-tuning.

## Consequences

**Positive:**

- **Emergent diversity** — Agent personalities naturally produce varied ideas; reactions create cross-pollination.
- **Full auditability** — Every idea and reaction is recorded with agent attribution, enabling replay and analysis.
- **Scalable agent count** — Adding or removing personalities requires no topology changes; they all read the same blackboard.
- **Convergence tracking** — The convergence score provides a natural stopping criterion for multi-round swarms.

**Negative:**

- **Single-round limitation** — Currently agents run one explore + one react cycle. Multi-round deliberation (where agents respond to reactions) is architecturally supported but not yet implemented.
- **No inter-swarm communication** — Multiple swarms running on different subjects cannot share discoveries.
- **Prompt length growth** — The blackboard is serialized into each agent's prompt; large swarms with many entries may exceed context windows.
