# Examples

Standalone integration samples showing how to use `@innovator/core` programmatically from Node.js.

## Prerequisites

These examples assume you have the monorepo set up and the core package built:

```bash
# From the repository root
npm install
npm run build --workspace=packages/core
```

## Running Examples

```bash
# Run with tsx (TypeScript execution)
npx tsx examples/basic-usage.ts
npx tsx examples/custom-angles.ts
npx tsx examples/with-budget.ts
npx tsx examples/debate-and-redteam.ts
npx tsx examples/portfolio-lifecycle.ts

# Pass a custom subject to any example
npx tsx examples/basic-usage.ts "quantum computing"
```

## Files

### `basic-usage.ts` — Investigation + Auto Pipeline

Runs the full Innovator workflow: investigates a subject, then executes the auto pipeline across all 8 built-in angles with synthesis. This is the best starting point for understanding the core API.

**What you'll learn:** `investigate()`, `runAutoPipeline()`, progress callbacks, reading synthesis results.

```bash
npx tsx examples/basic-usage.ts "quantum computing"
```

<details>
<summary>Expected output</summary>

```
🔍 Investigating: "sustainable packaging"

📋 Summary: Sustainable packaging encompasses materials, design, and supply chain...
📌 Key Aspects: Materials Innovation, Circular Design, Supply Chain, ...
⚡ Challenges: Cost premiums; Consumer confusion; Infrastructure gaps; ...
💡 Opportunities: Bio-based materials; Reusable models; Smart packaging; ...

🚀 Running auto pipeline with 8 angles...

  ▶ Starting angle: scamper
  ✅ Completed: scamper (4 ideas)
  ▶ Starting angle: first-principles
  ✅ Completed: first-principles (3 ideas)
  ...

📊 Results:

--- scamper ---
  • Modular Refill Stations: ...
  • Edible Packaging Film: ...

🏆 Top Ideas:
  ⭐ Modular Refill Stations
  ⭐ Bio-composite Smart Labels

📝 Recommendation: Focus on modular refill infrastructure...
```

</details>

**Runtime:** ~30–90 seconds depending on model speed.

---

### `custom-angles.ts` — Plugin System & Custom Angles

Demonstrates creating custom innovation angles (Ethics Lens, Circular Economy), bundling them into a plugin, and registering the plugin at runtime.

**What you'll learn:** `AnglePlugin` interface, `CustomAngle` definition with prompt templates, `registerPlugin()`, `generateForAngle()` with custom angle IDs.

```bash
npx tsx examples/custom-angles.ts "food delivery services"
```

<details>
<summary>Expected output</summary>

```
📦 Registered plugins: Example Custom Angles

🔍 Investigating: "food delivery services"
📋 Summary: Food delivery services have transformed...

⚖️ Running custom angle: Ethics Lens
   Evaluate ideas through ethical frameworks...

  • Transparent Pricing Model: ...
  • Equitable Driver Compensation: ...

♻️ Running custom angle: Circular Economy
   Reimagine through reduce, reuse, recycle...

  • Reusable Container Network: ...
  • Food Waste Marketplace: ...
```

</details>

**Runtime:** ~20–60 seconds (2 angles only).

---

### `with-budget.ts` — Cost Tracking & Budget Caps

Shows how to set a USD budget cap, monitor per-call costs, and automatically abort the pipeline when the budget is exceeded. Also demonstrates cost estimation and per-model/per-stage cost breakdowns.

**What you'll learn:** `getCostTracker()`, `setBudget()`, `estimateCost()`, `listModelPricing()`, `AbortController` integration for budget enforcement.

```bash
npx tsx examples/with-budget.ts "telemedicine" 0.50
```

<details>
<summary>Expected output</summary>

```
💰 Model Pricing:

  gpt-4.1: $0.002/1K input, $0.008/1K output
  ...

📊 Estimated auto pipeline cost (gpt-4.1): $0.2840
💳 Budget cap: $0.50

🔍 Investigating: "telemedicine"
📋 Summary: ...

💰 Cost after investigation: $0.0320

🚀 Running auto pipeline...

  ✅ scamper — running total: $0.0680 / $0.50
  ✅ first-principles — running total: $0.1040 / $0.50
  ...

============================================================
📊 COST SUMMARY
============================================================
  Total calls:    10
  Input tokens:   18,432
  Output tokens:  7,891
  Total cost:     $0.3214
  Budget remaining: $0.1786 of $0.50
============================================================
```

</details>

**Runtime:** ~30–90 seconds. Pass a lower budget (e.g., `0.10`) to see early abort behavior.

---

### `debate-and-redteam.ts` — Multi-Perspective Debate & Adversarial Testing

Generates ideas with First Principles, then runs a structured pro/con debate followed by adversarial red-teaming to stress-test the top idea. Useful for building conviction before investing in an idea.

**What you'll learn:** `runDebate()` for multi-perspective analysis, `runRedTeamSession()` for adversarial testing, round-by-round callbacks.

```bash
npx tsx examples/debate-and-redteam.ts "AI-powered code review tools"
```

<details>
<summary>Expected output</summary>

```
🔍 Investigating: "AI-powered code review tools"
📋 Summary: ...

⚡ Generating ideas with First Principles...

  💡 Semantic Code Understanding Engine
  💡 Contextual Review Agent
  💡 Review Knowledge Graph

🏆 Focusing on: "Semantic Code Understanding Engine"

🎭 Running structured debate...

  Round 1:
    🟢 Pro: Reduces review time by 60%; Catches semantic bugs...
    🔴 Con: May miss domain-specific patterns; Training data bias...
  Round 2:
    🟢 Pro: Continuous learning from team patterns...
    🔴 Con: Privacy concerns with code analysis...

  📝 Verdict: [pro] The benefits outweigh risks with proper guardrails...

🔴 Red teaming the top idea...

  Round 1:
    ⚠️  [high] Data Privacy Exposure
    ⚠️  [medium] False Positive Fatigue
    Survival score: 7/10
  Round 2:
    ⚠️  [medium] Adversarial Code Injection
    Survival score: 6/10

  🏁 Final verdict: Viable with mitigation strategies...
```

</details>

**Runtime:** ~60–120 seconds (multiple LLM rounds).

---

### `portfolio-lifecycle.ts` — Idea Lifecycle & Scaffolding

Demonstrates the full idea lifecycle: generate → score → portfolio tracking → stage transitions → implementation scaffolding. Shows how to move ideas from inception to prototyping with generated project structures.

**What you'll learn:** `scoreIdeas()`, `addPortfolioItem()`, `transitionItem()`, `getPortfolioMetrics()`, `generateScaffold()` for idea-to-code generation.

```bash
npx tsx examples/portfolio-lifecycle.ts "developer productivity tools"
```

<details>
<summary>Expected output</summary>

```
🔍 Investigating: "developer productivity tools"

⚡ Generating ideas with SCAMPER...

📊 Scoring ideas...

Scored Ideas:
  🟢 Context-Aware CLI Assistant — feasibility: 8, impact: 9
  🟡 Smart Merge Conflict Resolver — feasibility: 6, impact: 7
  🟢 Dev Environment Snapshots — feasibility: 8, impact: 8

📁 Adding to portfolio...

  ✅ Added: Context-Aware CLI Assistant (stage: idea)
  ✅ Added: Smart Merge Conflict Resolver (stage: idea)
  ✅ Added: Dev Environment Snapshots (stage: idea)

🚀 Advancing "Context-Aware CLI Assistant" through lifecycle...

  → Evaluation
  → Prototyping

🏗️  Generating implementation scaffolding...

  📂 Generated structure:
     src/index.ts — Entry point
     src/cli.ts — CLI argument parser
     src/context.ts — Context detection engine
     src/suggest.ts — Suggestion generator
     tests/cli.test.ts — CLI tests
     ... and 3 more files

  📋 Issues to create: 5
  🏗️  Tech stack: TypeScript, Node.js, Commander.js

📈 Portfolio Metrics:

  Total ideas: 3
  Ship rate: 0.0%
  Velocity: 3.0 ideas/week
  By stage: idea: 2, prototyping: 1
```

</details>

**Runtime:** ~30–90 seconds.

## Using in Your Own Project

To use `@innovator/core` in a standalone project:

```bash
npx create-innovator my-project
```

Or install directly:

```bash
npm install @innovator/core
```

Then import and use:

```typescript
import { investigate, runAutoPipeline } from "@innovator/core";
```
