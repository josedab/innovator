# API Reference — `@innovator/core`

Comprehensive API reference for the shared innovation engine. All consumers (`apps/web`, `apps/cli`, `packages/mcp-server`, `packages/bot`) depend on this package.

> **Client-safe imports:** For React/browser components that need only types and angle definitions (no Node.js dependencies), import from `@innovator/core/types` instead of `@innovator/core`.

---

## Table of Contents

- [Innovation Pipeline](#innovation-pipeline)
  - [`investigate()`](#investigate)
  - [`generateForAngle()`](#generateforangle)
  - [`runAutoPipeline()`](#runautopipeline)
- [Angles](#angles)
  - [`ANGLES`](#angles-constant)
  - [`getAngleById()`](#getanglebyid)
  - [Custom Angles](#custom-angles)
- [Copilot Client](#copilot-client)
  - [`generateText()`](#generatetext)
  - [`generateTextStream()`](#generatetextstream)
  - [`extractJson()`](#extractjson)
  - [`getCopilotClient()` / `stopCopilotClient()`](#getcopilotclient--stopcopilotclient)
- [LLM Providers](#llm-providers)
  - [`LLMProvider` Interface](#llmprovider-interface)
  - [Built-in Providers](#built-in-providers)
  - [Provider Registry](#provider-registry)
  - [Configuration](#provider-configuration)
- [Prompt Utilities](#prompt-utilities)
- [Plugin System](#plugin-system)
- [Presets](#presets)
- [Session History](#session-history)
- [Export](#export)
- [Scoring](#scoring)
- [Collaborative Sessions](#collaborative-sessions)
- [Artifacts](#artifacts)
- [Knowledge Graph](#knowledge-graph)
- [Benchmark](#benchmark)
- [Adversarial Gauntlet](#adversarial-gauntlet)
- [Provenance Ledger](#provenance-ledger)
- [Temporal Memory](#temporal-memory)
- [Sentinel](#sentinel)
- [Genome Sequencer](#genome-sequencer)
- [Federation DP](#federation-dp)
- [Core Types](#core-types)
- [Zod Schemas](#zod-schemas)

---

## Innovation Pipeline

The core pipeline follows a three-stage flow: **Investigate → Generate → Synthesize**.

### `investigate()`

Analyze a subject using AI to identify key aspects, challenges, and opportunities.

```typescript
function investigate(subject: string, model?: string, signal?: AbortSignal): Promise<Investigation>;
```

**Parameters:**

| Name      | Type           | Description                                                            |
| --------- | -------------- | ---------------------------------------------------------------------- |
| `subject` | `string`       | The topic or domain to investigate                                     |
| `model`   | `string?`      | LLM model override (default: `INNOVATOR_DEFAULT_MODEL` or `"gpt-4.1"`) |
| `signal`  | `AbortSignal?` | Cancel the request early                                               |

**Returns:** A validated `Investigation` object.

**Example:**

```typescript
import { investigate } from "@innovator/core";

const result = await investigate("sustainable packaging");
console.log(result.summary);
console.log(result.keyAspects.map((a) => a.title));
console.log(result.challenges);
console.log(result.opportunities);
```

**Error handling:** Retries automatically on JSON parse failures (up to 3 attempts with exponential backoff). Throws if the LLM call fails or the response cannot be parsed after retries.

---

### `generateForAngle()`

Generate innovation ideas for a subject using a specific creativity angle.

```typescript
function generateForAngle(
  subject: string,
  investigation: Investigation,
  angleId: AngleId | string,
  model?: string,
  signal?: AbortSignal
): Promise<AngleResult>;
```

**Parameters:**

| Name            | Type                | Description                                |
| --------------- | ------------------- | ------------------------------------------ |
| `subject`       | `string`            | The topic to innovate on                   |
| `investigation` | `Investigation`     | Previously generated investigation context |
| `angleId`       | `AngleId \| string` | Built-in or custom angle ID                |
| `model`         | `string?`           | LLM model override                         |
| `signal`        | `AbortSignal?`      | Cancel the request early                   |

**Returns:** A validated `AngleResult` with generated ideas and reasoning.

**Example:**

```typescript
import { investigate, generateForAngle } from "@innovator/core";

const investigation = await investigate("home automation");
const result = await generateForAngle("home automation", investigation, "scamper");

for (const idea of result.ideas) {
  console.log(`${idea.title}: ${idea.description}`);
  console.log(`  Impact: ${idea.potentialImpact}`);
  console.log(`  Hint: ${idea.implementationHint}`);
}
```

**Angle resolution:** Built-in angle IDs are matched first. If no match is found, the custom angle registry is consulted. Throws `Error` if the angle ID is unknown.

---

### `runAutoPipeline()`

Run the full innovation pipeline: investigate → generate for all angles → synthesize.

```typescript
function runAutoPipeline(
  subject: string,
  onProgress: (progress: PipelineProgress) => void,
  model?: string,
  angles?: AngleId[],
  signal?: AbortSignal,
  modelRouting?: ModelRouting
): Promise<PipelineProgress>;
```

**Parameters:**

| Name           | Type                                   | Description                          |
| -------------- | -------------------------------------- | ------------------------------------ |
| `subject`      | `string`                               | The topic to innovate on             |
| `onProgress`   | `(progress: PipelineProgress) => void` | Callback for each stage transition   |
| `model`        | `string?`                              | Default LLM model for all stages     |
| `angles`       | `AngleId[]?`                           | Subset of angles (defaults to all 8) |
| `signal`       | `AbortSignal?`                         | Cancel the pipeline early            |
| `modelRouting` | `ModelRouting?`                        | Per-stage model overrides            |

**Returns:** Final `PipelineProgress` including all angle results and synthesis.

**Concurrency:** Generates ideas for up to `MAX_CONCURRENCY` (2) angles in parallel. Individual angle failures are captured without aborting the pipeline.

**Example:**

```typescript
import { runAutoPipeline } from "@innovator/core";

const result = await runAutoPipeline(
  "code review processes",
  (progress) => {
    console.log(`Stage: ${progress.stage}`);
    console.log(`Completed: ${progress.completedAngles.length}/${progress.totalAngles}`);
  },
  "gpt-5",
  ["scamper", "first-principles", "inversion"]
);

if (result.synthesis) {
  console.log(
    "Top ideas:",
    result.synthesis.topIdeas.map((i) => i.title)
  );
  console.log("Recommendation:", result.synthesis.recommendation);
}
```

**Model routing example:**

```typescript
const result = await runAutoPipeline(
  "renewable energy",
  onProgress,
  undefined, // no default model
  undefined, // all angles
  undefined, // no abort signal
  {
    investigation: "gpt-5", // high-quality for investigation
    generation: "gpt-4.1-mini", // cost-effective for bulk generation
    synthesis: "gpt-5", // high-quality for synthesis
  }
);
```

---

## Angles

### `ANGLES` (constant)

The canonical array of all 8 built-in innovation angle definitions.

```typescript
const ANGLES: AngleDefinition[];
```

| ID                 | Name                    | Icon |
| ------------------ | ----------------------- | ---- |
| `scamper`          | SCAMPER                 | 🔄   |
| `first-principles` | First Principles        | 🧱   |
| `cross-domain`     | Cross-Domain Analogy    | 🌐   |
| `constraints`      | Constraint Injection    | 🔒   |
| `inversion`        | Problem Inversion       | 🔃   |
| `perspectives`     | Role-Based Perspectives | 👥   |
| `what-if`          | What-If Scenarios       | 💭   |
| `trend-collision`  | Trend Collision         | ⚡   |

### `getAngleById()`

```typescript
function getAngleById(id: string): AngleDefinition | undefined;
```

Look up an angle definition by its ID. Returns `undefined` if not found.

### Custom Angles

Register, manage, and use custom innovation angles beyond the built-in 8.

```typescript
// Manage custom angles
function loadCustomAngles(): CustomAngle[];
function addCustomAngle(angle: CustomAngle): void;
function removeCustomAngle(id: string): boolean;
function getCustomAngle(id: string): CustomAngle | undefined;
function updateCustomAngle(id: string, updates: Partial<CustomAngle>): void;

// Import/export angle packs
function exportAnglePack(angleIds: string[]): AnglePack;
function importAnglePack(pack: AnglePack): void;
function buildCustomAnglePrompt(angle: CustomAngle, subject: string, context: string): string;
```

Custom angle IDs must match `^[a-z0-9-]+$`. Prompt templates support `{{subject}}` and `{{investigation}}` placeholders.

**Example:**

```typescript
import { addCustomAngle, generateForAngle, investigate } from "@innovator/core";
import type { CustomAngle } from "@innovator/core/types";

const ethicsAngle: CustomAngle = {
  id: "ethics-lens",
  name: "Ethics Lens",
  description: "Evaluate through ethical frameworks",
  promptTemplate: `Analyze {{subject}} for ethical implications.
Context: {{investigation}}
Respond with JSON: { "angleId": "ethics-lens", "angleName": "Ethics Lens", "ideas": [...], "reasoning": "..." }`,
  icon: "⚖️",
};

addCustomAngle(ethicsAngle);

const investigation = await investigate("facial recognition");
const result = await generateForAngle("facial recognition", investigation, "ethics-lens");
```

---

## Copilot Client

Low-level interface to the GitHub Copilot SDK. Used internally by the pipeline but also available for direct use.

### `generateText()`

Send a prompt and wait for the complete response.

```typescript
function generateText(options: GenerateOptions): Promise<string>;
```

### `generateTextStream()`

Send a prompt and stream response chunks via a callback.

```typescript
function generateTextStream(
  options: GenerateOptions,
  onChunk: (chunk: string) => void
): Promise<string>;
```

### `GenerateOptions`

```typescript
interface GenerateOptions {
  prompt: string;
  model?: string; // Default: INNOVATOR_DEFAULT_MODEL or "gpt-4.1"
  serverMode?: boolean; // Restrict to read-only permissions (for API routes)
  timeoutMs?: number; // Default: INNOVATOR_LLM_TIMEOUT_MS or 90000
  signal?: AbortSignal;
}
```

### `extractJson()`

Extract a JSON object from an LLM response that may contain markdown or extra text. Uses brace-balanced extraction instead of greedy regex.

```typescript
function extractJson(raw: string): string;
```

Handles:

- Fenced JSON code blocks (` ```json ... ``` `)
- Embedded JSON in free-form text
- Throws `Error` if no JSON object is found or braces are unbalanced

### `getCopilotClient()` / `stopCopilotClient()`

```typescript
function getCopilotClient(): Promise<CopilotClient>; // Lazy singleton
function stopCopilotClient(): Promise<void>; // Release resources
```

The client is lazily initialized on first call. Always call `stopCopilotClient()` for graceful shutdown in CLI/script contexts.

---

## LLM Providers

### `LLMProvider` Interface

All LLM providers implement this interface:

```typescript
interface LLMProvider {
  readonly id: string;
  readonly name: string;
  generateText(options: LLMGenerateOptions): Promise<string>;
  generateStream(options: LLMGenerateOptions, onChunk: (chunk: string) => void): Promise<string>;
  listModels(): Promise<LLMModelInfo[]>;
}

interface LLMGenerateOptions {
  prompt: string;
  model?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}
```

### Built-in Providers

| Class               | ID          | Env Variable        | Default Model              |
| ------------------- | ----------- | ------------------- | -------------------------- |
| `CopilotProvider`   | `copilot`   | _(uses `gh` CLI)_   | `gpt-4.1`                  |
| `OpenAIProvider`    | `openai`    | `OPENAI_API_KEY`    | `gpt-4.1`                  |
| `AnthropicProvider` | `anthropic` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-20250514` |
| `OllamaProvider`    | `ollama`    | `OLLAMA_BASE_URL`   | `llama3`                   |

### Provider Registry

```typescript
function registerProvider(provider: LLMProvider): void;
function getProvider(id: string): LLMProvider | undefined;
function getActiveProvider(): LLMProvider; // Falls back to CopilotProvider
function setActiveProvider(id: string): void; // Throws if not registered
function listProviders(): LLMProvider[];
function initializeProviders(config?: InnovatorConfig): void;
function clearProviders(): void; // For testing
```

### Provider Configuration

Configuration is stored at `~/.innovator/config.json`:

```typescript
function loadConfig(): InnovatorConfig;
function saveConfig(config: InnovatorConfig): void;
```

```typescript
interface InnovatorConfig {
  defaultProvider: string; // Default: "copilot"
  providers?: Record<
    string,
    {
      enabled: boolean;
      apiKeyEnv?: string;
      baseUrl?: string;
      defaultModel?: string;
    }
  >;
  modelPreferences?: {
    investigation?: string;
    generation?: string;
    synthesis?: string;
  };
}
```

---

## Prompt Utilities

```typescript
// Build prompts for pipeline stages
function buildInvestigationPrompt(subject: string): string;
function buildSynthesisPrompt(
  subject: string,
  investigation: Investigation,
  angleResults: string
): string;

// Defense against prompt injection
function sanitizeUserInput(input: string): string; // Strip injection patterns
function wrapUserInput(label: string, input: string): string; // Wrap with delimiters
function sanitizeLlmOutput(output: string): string; // Clean LLM responses

// Retry with exponential backoff
function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
```

---

## Plugin System

Register custom angle, exporter, or visualizer plugins:

```typescript
function registerPlugin(plugin: InnovatorPlugin): void;
function unregisterPlugin(id: string): void;
function getPlugin(id: string): InnovatorPlugin | undefined;
function listPlugins(): InnovatorPlugin[];
function getPluginsByType(type: "angle" | "exporter" | "visualizer"): InnovatorPlugin[];
function loadPlugin(manifest: PluginManifest): Promise<InnovatorPlugin>;
function clearPlugins(): void;
```

**Plugin types:**

| Type         | Interface          | Purpose                      |
| ------------ | ------------------ | ---------------------------- |
| `angle`      | `AnglePlugin`      | Custom innovation angles     |
| `exporter`   | `ExporterPlugin`   | Output format converters     |
| `visualizer` | `VisualizerPlugin` | Data visualization renderers |

Plugin IDs must match `^[a-z0-9-]+$` (may include dots for namespacing, e.g. `myorg.custom-angles`).

---

## Presets

Pre-configured angle sets for common innovation domains:

```typescript
function getPresets(): Preset[];
function getPresetById(id: string): Preset | undefined;
function getPresetsByCategory(category: string): Preset[];
function getPresetsByTag(tag: string): Preset[];

const BUILT_IN_PRESETS: Preset[];
```

---

## Session History

Persist and query innovation sessions:

```typescript
function saveSession(session: SessionRecord): void;
function getSession(id: string): SessionRecord | undefined;
function updateSession(id: string, updates: Partial<SessionRecord>): void;
function deleteSession(id: string): boolean;
function listSessions(limit?: number, offset?: number): SessionRecord[];
function querySessions(query: HistoryQuery): SessionRecord[];
function compareSessions(ids: string[]): object;
```

---

## Export

Render sessions in multiple output formats:

```typescript
function exportToMarkdown(data: ExportData): string;
function exportToJson(data: ExportData): string;
function generateGitHubIssueBody(data: ExportData): string;
function exportToClipboard(data: ExportData): Promise<void>;
function exportToPowerPoint(data: ExportData): Promise<ExportResult>;
function exportToJira(data: ExportData): Promise<ExportResult>;
function exportToConfluence(data: ExportData): Promise<ExportResult>;
function exportToNotion(data: ExportData): Promise<ExportResult>;
function exportToGoogleSlides(data: ExportData): Promise<ExportResult>;
function getAvailableFormats(): ExportFormat[];
```

---

## Scoring

Score and rank innovation ideas:

```typescript
function scoreIdeas(ideas: InnovationIdea[]): Promise<ScoringResult>;
function computePriorityScore(score: IdeaScore): number;
function getQuadrant(score: IdeaScore): string;
function rankIdeas(results: ScoringResult): InnovationIdea[];
function scoreWithEngine(
  ideas: InnovationIdea[],
  config: ScoringEngineConfig
): Promise<MultiDimensionalScore[]>;
```

---

## Collaborative Sessions

Real-time multi-user brainstorming sessions:

```typescript
function createCollaborativeSession(subject: string, hostUserId: string): CollaborativeSession;
function joinSession(sessionId: string, userId: string, displayName: string): void;
function submitIdea(sessionId: string, idea: Partial<CollaborativeIdea>): void;
function voteForIdea(sessionId: string, ideaId: string, userId: string): void;
function mergeIdeas(sessionId: string, sourceIds: string[], mergedTitle: string): CollaborativeIdea;
function onSessionEvent(
  sessionId: string,
  handler: (event: CollaborativeEvent) => void
): () => void;
```

---

## Artifacts

Generate structured documents from innovation ideas:

```typescript
function generateArtifact(context: ArtifactContext): Promise<Artifact>;
function generateArtifactStream(
  context: ArtifactContext,
  onChunk: (chunk: string) => void
): Promise<Artifact>;
function artifactToMarkdown(artifact: Artifact): string;
function artifactToGitHubIssue(artifact: Artifact): string;
```

Artifact types: `prd`, `tech-spec`, `user-story`, `pitch-deck`, `design-brief`, `test-plan`.

---

## Knowledge Graph

Build a persistent graph of concepts and relationships across investigations:

```typescript
function ingestInvestigation(subject: string, investigation: Investigation): void;
function queryRelatedSubjects(subject: string, maxResults?: number): EntityNode[];
function getKnowledgeGraph(): KnowledgeGraph;
function getGraphStats(): { nodes: number; edges: number };
function clearKnowledgeGraph(): void;
```

---

## Benchmark

Evaluate and compare innovation quality across LLM models:

```typescript
function runBenchmark(models: string[], subject?: string): Promise<BenchmarkReport>;
function evaluateAngleResult(result: AngleResult): Promise<IdeaEvaluation>;
function benchmarkToMarkdown(report: BenchmarkReport): string;
function runBenchmarkSuite(models: string[]): Promise<BenchmarkSuiteResult>;
```

---

## Core Types

### `Investigation`

```typescript
interface Investigation {
  summary: string; // max 5000 chars
  keyAspects: { title: string; description: string }[]; // max 20 items
  currentState: string; // max 5000 chars
  challenges: string[]; // max 20 items
  opportunities: string[]; // max 20 items
}
```

### `AngleResult`

```typescript
interface AngleResult {
  angleId: string;
  angleName: string;
  ideas: InnovationIdea[]; // max 50
  reasoning: string; // how the angle was applied
}
```

### `InnovationIdea`

```typescript
interface InnovationIdea {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}
```

### `Synthesis`

```typescript
interface Synthesis {
  topIdeas: {
    title: string;
    description: string;
    sourceAngle: string;
    potentialImpact: string;
    feasibility: "low" | "medium" | "high";
  }[]; // max 50
  themes: string[]; // max 30
  recommendation: string; // max 5000 chars
}
```

### `PipelineProgress`

```typescript
interface PipelineProgress {
  stage: PipelineStage; // "investigating" | "generating" | "synthesizing" | "complete" | "error"
  currentAngle?: string;
  completedAngles: string[];
  totalAngles: number;
  investigation?: Investigation;
  angleResults: AngleResult[];
  failedAngles?: { angleId: string; error: string }[];
  synthesis?: Synthesis;
  error?: string;
  partialIdea?: {
    angleId: string;
    angleName: string;
    ideaIndex: number;
    content: string;
    complete: boolean;
  };
  stoppedEarly?: boolean;
}
```

### `ModelRouting`

```typescript
interface ModelRouting {
  investigation?: string;
  generation?: string;
  synthesis?: string;
}
```

### `CustomAngle`

```typescript
interface CustomAngle {
  id: string; // ^[a-z0-9-]+$
  name: string;
  description: string;
  promptTemplate: string; // supports {{subject}} and {{investigation}}
  icon?: string;
  author?: string;
  version?: string;
  tags?: string[];
}
```

---

## Zod Schemas

All core types have corresponding Zod schemas for runtime validation of LLM output:

| Schema                 | Validates        |
| ---------------------- | ---------------- |
| `InvestigationSchema`  | `Investigation`  |
| `InnovationIdeaSchema` | `InnovationIdea` |
| `AngleResultSchema`    | `AngleResult`    |
| `SynthesisSchema`      | `Synthesis`      |
| `CustomAngleSchema`    | `CustomAngle`    |
| `AnglePackSchema`      | `AnglePack`      |

Import schemas directly for custom validation:

```typescript
import { InvestigationSchema } from "@innovator/core";

const parsed = InvestigationSchema.safeParse(untrustedData);
if (!parsed.success) {
  console.error("Validation failed:", parsed.error.issues);
}
```

---

## Adversarial Gauntlet

Stress-test innovation ideas with specialized adversary agents. See [ADR-0016](adr/ADR-0016-llm-as-judge-evaluation.md).

### `runGauntlet()`

Run the full gauntlet against an idea.

```typescript
function runGauntlet(
  idea: InnovationIdea,
  config?: GauntletConfig,
  onProgress?: (progress: GauntletProgress) => void
): Promise<GauntletResult>;
```

**Parameters:**

| Name         | Type                 | Description                                   |
| ------------ | -------------------- | --------------------------------------------- |
| `idea`       | `InnovationIdea`     | The idea to stress-test                       |
| `config`     | `GauntletConfig`     | Optional: adversaries, model, strengthen mode |
| `onProgress` | `(progress) => void` | Optional SSE-style progress callback          |

**Config options:**

| Field               | Type              | Default | Description                                    |
| ------------------- | ----------------- | ------- | ---------------------------------------------- |
| `adversaries`       | `AdversaryRole[]` | All 5   | Which adversary personas to run                |
| `strengthen`        | `boolean`         | `false` | Generate a revised idea addressing top attacks |
| `model`             | `string`          | —       | LLM model override                             |
| `customAdversaries` | `object[]`        | —       | Add custom adversary personas                  |

**Built-in adversary roles:** `competitor`, `regulator`, `skeptic`, `economist`, `engineer`

**Example:**

```typescript
import { runGauntlet, gauntletToMarkdown } from "@innovator/core";

const result = await runGauntlet(
  {
    title: "AI Nutritionist",
    description: "Personalized meal plans via AI",
    potentialImpact: "Health outcomes",
    implementationHint: "Start with dietary guidelines API",
  },
  { strengthen: true }
);

console.log(`Survivability: ${result.survivabilityIndex}/100`);
console.log(`Attacks: ${result.attacks.length}`);
console.log(gauntletToMarkdown(result));
```

### `computeSurvivabilityIndex()`

Compute the weighted survivability score from a set of attacks.

```typescript
function computeSurvivabilityIndex(attacks: Attack[]): number; // 0–100
```

---

## Provenance Ledger

Tamper-evident audit trail for AI-assisted innovation decisions. See [ADR-0017](adr/ADR-0017-append-only-hash-chained-ledger.md).

### `appendEntry()`

Append a new entry to the hash-chained ledger.

```typescript
function appendEntry(
  params: {
    type: LedgerEntryType;
    sessionId: string;
    actor: string; // "system" for AI, user identifier for humans
    action: string;
    subject: string;
    model?: string;
    promptHash?: string;
    reasoning?: string;
    alternatives?: string[];
  },
  config?: LedgerConfig
): LedgerEntry;
```

### Convenience Recorders

```typescript
recordInvestigation(sessionId, subject, model, promptHash, config?)
recordGeneration(sessionId, subject, angleId, model, promptHash, ideaCount, config?)
recordGauntlet(sessionId, ideaTitle, survivabilityIndex, attackCount, config?)
recordHumanDecision(sessionId, actor, type, subject, reasoning, alternatives?, config?)
```

### `verifyLedger()`

Verify hash-chain integrity. Returns `{ valid: boolean, brokenChainAt?: number }`.

```typescript
function verifyLedger(config?: LedgerConfig): LedgerVerification;
```

### GDPR Functions

```typescript
exportForActor(actor: string, config?): GdprExport;  // Art. 15 right of access
redactActor(actor: string, config?): number;           // Art. 17 right to erasure
```

---

## Temporal Memory

Persistent temporal knowledge graph for innovation memory. See [ADR-0019](adr/ADR-0019-temporal-knowledge-graph.md).

### `ingestSession()`

Ingest a completed innovation session, extracting entities and relationships.

```typescript
function ingestSession(
  session: SessionIngestion,
  dir?: string
): { nodesCreated: number; edgesCreated: number; recurrences: ConceptRecurrence[] };
```

### `queryTemporalMemory()`

Answer a natural-language temporal query using LLM + graph context.

```typescript
function queryTemporalMemory(
  query: TemporalQuery,
  options?: { model?: string; signal?: AbortSignal; dir?: string }
): Promise<TemporalQueryResult>;
```

### `computeVelocity()`

Compute innovation velocity metrics for a time period.

```typescript
function computeVelocity(graph: TemporalGraph, periodMonths?: number): InnovationVelocity;
// Returns: { ideasPerMonth, conceptEvolutionRate, outcomeLeadTimeDays, activeConcepts, ... }
```

### Other Functions

```typescript
detectRecurrences(graph, minOccurrences?)     // Find concepts recurring across sessions
searchNodes(graph, query, options?)            // Text search with time/type filters
getConceptTimeline(graph, conceptLabel)        // Evolution timeline for a concept
getNeighbors(graph, nodeId, maxHops?)          // Graph traversal
deleteSessionData(sessionId, dir?)             // GDPR deletion
```

---

## Sentinel

Always-on innovation signal monitoring agent.

### `runSentinel()`

Execute a monitoring run: collect signals → filter → investigate → generate brief.

```typescript
function runSentinel(
  config: SentinelConfig,
  onProgress?: (progress: SentinelProgress) => void
): Promise<DailyBrief>;
```

**Config:**

| Field                | Type             | Default                           | Description                        |
| -------------------- | ---------------- | --------------------------------- | ---------------------------------- |
| `sources`            | `SignalSource[]` | —                                 | RSS/URL sources to monitor         |
| `topics`             | `string[]`       | —                                 | Topics for relevance filtering     |
| `relevanceThreshold` | `number`         | `0.5`                             | Minimum score to process a signal  |
| `maxSignalsPerRun`   | `number`         | `5`                               | Max signals to investigate per run |
| `dailyCostBudget`    | `number`         | —                                 | Max daily LLM cost in USD          |
| `model`              | `string`         | —                                 | LLM model override                 |
| `angles`             | `string[]`       | `["cross-domain", "constraints"]` | Angles for idea generation         |

---

## Genome Sequencer

Decomposes ideas into fundamental traits for similarity search and recombination.

### `sequenceIdea()`

Decompose an idea into 7 genome traits via LLM.

```typescript
function sequenceIdea(
  idea: InnovationIdea,
  options?: { sessionId?: string; angleId?: string; model?: string; signal?: AbortSignal }
): Promise<IdeaGenome>;
```

**Trait types:** `problem-space`, `solution-mechanism`, `value-proposition`, `target-audience`, `enabling-technology`, `risk-profile`, `competitive-differentiation`

### `findSimilar()`

Find the most similar genomes in the library.

```typescript
function findSimilar(
  genome: IdeaGenome,
  topN?: number,
  dir?: string
): Array<GenomeSimilarity & { ideaTitle: string }>;
```

### `recombine()`

Generate a novel idea by combining the best traits from two genomes.

```typescript
function recombine(
  genomeA: IdeaGenome,
  genomeB: IdeaGenome,
  options?: { model?: string; signal?: AbortSignal }
): Promise<RecombinantIdea>;
```

---

## Federation DP

Differential privacy layer for cross-organization pattern sharing. See [ADR-0018](adr/ADR-0018-differential-privacy-federation.md).

### `extractAnonymizedPatterns()`

Extract patterns from local data with Laplace noise.

```typescript
function extractAnonymizedPatterns(
  localData: LocalUsageRecord[],
  config: DPConfig,
  dir?: string
): AnonymizedPattern[];
```

### `generateRecommendations()`

Generate angle recommendations from federation patterns.

```typescript
function generateRecommendations(
  userTopics: string[],
  userAngles: string[],
  patterns: AnonymizedPattern[]
): PatternRecommendation[];
```

### Privacy Budget

```typescript
loadPrivacyBudget(dir?)           // Get current budget state
spendBudget(epsilon, queryType, dir?)  // Spend ε, returns false if exhausted
getRemainingBudget(dir?)          // Remaining ε before exhaustion
```
