# ADR-0020: Genetic Algorithm Metaphor for Idea Evolution

## Status

Accepted

## Context

Initial idea generation produces a first-generation population, but many valuable innovations emerge through iterative refinement — combining traits from multiple ideas, mutating successful concepts, and selecting the fittest for further development. The team needed a systematic approach to idea refinement beyond manual editing.

Options considered:

1. **Manual curation** — Users hand-pick and edit ideas. Doesn't scale and introduces bias.
2. **LLM re-generation** — Re-run the generation with modified prompts. Loses lineage and doesn't accumulate improvements.
3. **Genetic algorithm metaphor** — Treat ideas as organisms with crossover, mutation, selection, and ancestry tracking across generations.

## Decision

We model idea refinement as a **genetic algorithm** in `packages/core/src/evolution/`. Ideas are evolved artifacts with:

- **Fitness scoring** (0–100) via LLM evaluation
- **Crossover** — Combining traits from two parent ideas into a child
- **Mutation** — Applying a transformation (pivot, scale, simplify, combine, invert, analogize, constrain) to a single idea
- **Selection** — Fitness-proportional selection for the next generation
- **Ancestry tracking** — Each evolved idea records its parents, generation number, and operation type via `AncestryNode`

The `EvolvedIdea` schema extends `InnovationIdea` with `fitness`, `generation`, and `ancestry` fields. `GenerationResult` captures per-generation statistics (best/average fitness, population).

## Consequences

**Positive:**

- **Systematic exploration** — Mutation operators (7 types) ensure the idea space is explored beyond what a single generation discovers.
- **Full lineage** — Every evolved idea traces back to its seed ancestors, enabling "idea genealogy" visualization.
- **Fitness convergence** — Tracking best/average fitness across generations shows whether evolution is finding better ideas or stagnating.
- **Composable** — Evolution output feeds naturally into the gauntlet (stress-test evolved ideas) and genome sequencer (decompose evolved traits).

**Negative:**

- **No outcome feedback loop** — Fitness is LLM-assessed, not grounded in real-world outcomes. Connecting evolution fitness to outcome tracking would close this loop.
- **Computational cost** — Multi-generation evolution with crossover requires many LLM calls (population × generations × operations).
- **Convergence risk** — Without sufficient mutation pressure, populations can converge to local optima.
