# ADR-0018: Differential Privacy for Federated Pattern Sharing

## Status

Accepted

## Context

The federation module (`packages/core/src/federation/`) enables multiple Innovator instances to share anonymized innovation patterns (which angles work well for which topic categories) without exposing proprietary subjects or ideas. However, even with anonymization, aggregate statistics can leak information about individual organizations through membership inference or frequency analysis.

The system needed a formal privacy guarantee that bounds the information any single organization contributes to shared aggregates, while keeping the aggregates useful enough to generate meaningful recommendations.

Options considered:

1. **K-anonymity** — Ensures each record is indistinguishable from k-1 others. Doesn't protect against background knowledge attacks.
2. **Differential privacy (ε-DP)** — Adds calibrated noise so that the presence or absence of any single record changes the output by at most a bounded amount. Gold-standard formal guarantee.
3. **Secure multi-party computation** — Strongest guarantee but requires synchronized participation and is computationally expensive.

## Decision

We implement **ε-differential privacy** via the **Laplace mechanism** in `packages/core/src/federation-dp/`. For each numeric aggregate shared with the federation (e.g., angle success rate for a topic category):

1. Compute the true value locally.
2. Add Laplace noise calibrated to `sensitivity / epsilon`.
3. Clamp the result to valid range [0, 1].
4. Compute a 95% confidence interval for the noised value.

A **privacy budget** tracks cumulative ε spent across all queries. When the budget is exhausted (`totalSpent >= maxBudget`), the system refuses to share further aggregates until the budget is reset. The default budget is ε = 10 total, which supports approximately 10 queries at ε = 1 each.

## Consequences

**Positive:**

- **Formal guarantee** — ε-differential privacy is the gold standard for statistical disclosure control, accepted by regulators (GDPR recital 26, EU AI Act).
- **Composable** — Budget tracking ensures that repeated queries don't erode privacy guarantees (sequential composition theorem).
- **Transparent** — Noised values include confidence intervals, so consumers know the uncertainty range.
- **Anti-pattern detection** — Even with noise, consistently underperforming patterns (< 0.15 success rate across 3+ organizations) are reliably detectable.

**Negative:**

- **Noise degrades utility** — At low ε (high privacy), recommendations may be too noisy to be actionable. Adaptive ε based on network size would help.
- **Budget exhaustion** — Organizations that query frequently will exhaust their budget. Budget replenishment policy is not yet defined.
- **No secure aggregation** — The current implementation trusts each node to add noise correctly. A malicious node could share unnoised data. Secure aggregation would mitigate this at the cost of complexity.
- **Small-network bias** — With few participants, even noised patterns may be traceable. Minimum network size thresholds should be enforced before sharing.
