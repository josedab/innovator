---
id: api-reference
title: API Reference
sidebar_position: 5
---

# API Reference

Complete reference for the `@innovator/core` package and web API routes.

:::tip Auto-Generated API Docs
For detailed, auto-generated documentation of every exported symbol (including full type signatures and source links), see the [TypeDoc API reference](/docs/api/). This page provides a curated overview with usage examples; the TypeDoc reference covers the complete API surface.
:::

## Client vs Server Imports

The `@innovator/core` package exposes two subpath exports. Using the wrong one can break client-side components because the main entry pulls in Node.js-only dependencies (the Copilot SDK).

| Import path             | Resolves to      | Use when                                                        |
| ----------------------- | ---------------- | --------------------------------------------------------------- |
| `@innovator/core`       | `dist/index.js`  | Server components, API routes, CLI — full API with Node.js deps |
| `@innovator/core/types` | `dist/client.js` | Client components (`"use client"`) — types and constants only   |

### `exports` field in `packages/core/package.json`

```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  },
  "./types": {
    "import": "./dist/client.js",
    "types": "./dist/client.d.ts"
  }
}
```

### Examples

```typescript
// ✅ Server component or API route — full access
import { investigate, generateForAngle } from "@innovator/core";

// ✅ Client component — types and constants only (no Node.js deps)
import { ANGLES, ANGLE_IDS, type AngleId } from "@innovator/core/types";

// ❌ DON'T do this in client components — will fail at build time
import { investigate } from "@innovator/core";
```

---

## Core Package (`@innovator/core`)

### `investigate(subject, model?, signal?)`

Analyze a subject and return structured findings.

```typescript
import { investigate } from "@innovator/core";

const result = await investigate("remote work tools");
```

**Parameters:**

| Param     | Type          | Required | Description                        |
| --------- | ------------- | -------- | ---------------------------------- |
| `subject` | `string`      | Yes      | The topic to investigate           |
| `model`   | `string`      | No       | LLM model ID (default: `gpt-4.1`)  |
| `signal`  | `AbortSignal` | No       | Signal to cancel the request early |

**Returns:** `Promise<Investigation>`

```typescript
interface Investigation {
  summary: string;
  keyAspects: { title: string; description: string }[];
  currentState: string;
  challenges: string[];
  opportunities: string[];
}
```

---

### `generateForAngle(subject, investigation, angleId, model?, signal?)`

Generate innovations for a single angle.

```typescript
import { generateForAngle } from "@innovator/core";

const result = await generateForAngle("remote work tools", investigation, "scamper");
```

**Parameters:**

| Param           | Type            | Required | Description                        |
| --------------- | --------------- | -------- | ---------------------------------- |
| `subject`       | `string`        | Yes      | The original subject               |
| `investigation` | `Investigation` | Yes      | Result from `investigate()`        |
| `angleId`       | `AngleId`       | Yes      | One of the 8 angle IDs             |
| `model`         | `string`        | No       | LLM model ID                       |
| `signal`        | `AbortSignal`   | No       | Signal to cancel the request early |

**Returns:** `Promise<AngleResult>`

```typescript
interface AngleResult {
  angleId: string;
  angleName: string;
  ideas: InnovationIdea[];
  reasoning: string;
}

interface InnovationIdea {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}
```

---

### `runAutoPipeline(subject, onProgress, model?, angles?, signal?, modelRouting?)`

Run the full automatic pipeline with progress callbacks.

```typescript
import { runAutoPipeline } from "@innovator/core";

const result = await runAutoPipeline("remote work tools", (progress) =>
  console.log(progress.stage, progress.completedAngles.length)
);
```

**Parameters:**

| Param          | Type                                   | Required | Description                                          |
| -------------- | -------------------------------------- | -------- | ---------------------------------------------------- |
| `subject`      | `string`                               | Yes      | The topic to innovate on                             |
| `onProgress`   | `(progress: PipelineProgress) => void` | Yes      | Called on each stage transition                      |
| `model`        | `string`                               | No       | LLM model ID                                         |
| `angles`       | `AngleId[]`                            | No       | Subset of angles (default: all 8)                    |
| `signal`       | `AbortSignal`                          | No       | Signal to cancel the request early                   |
| `modelRouting` | `ModelRouting`                         | No       | Per-stage model overrides (see `ModelRouting` below) |

**Returns:** `Promise<PipelineProgress>`

```typescript
interface PipelineProgress {
  stage: "investigating" | "generating" | "synthesizing" | "complete" | "error";
  currentAngle?: string;
  completedAngles: string[];
  totalAngles: number;
  investigation?: Investigation;
  angleResults: AngleResult[];
  failedAngles?: { angleId: string; error: string }[];
  synthesis?: Synthesis;
  error?: string;
}
```

#### `ModelRouting` type

Route different pipeline stages to different LLM models. For example, use a cheaper model for investigation and a more capable model for synthesis.

```typescript
interface ModelRouting {
  /** Model ID to use for the investigation stage. */
  investigation?: string;
  /** Model ID to use for the generation stage. */
  generation?: string;
  /** Model ID to use for the synthesis stage. */
  synthesis?: string;
}
```

---

### `Synthesis` type

```typescript
interface Synthesis {
  topIdeas: {
    title: string;
    description: string;
    sourceAngle: string;
    potentialImpact: string;
    feasibility: "low" | "medium" | "high";
  }[];
  themes: string[];
  recommendation: string;
}
```

---

### `AngleId` type

```typescript
type AngleId =
  | "scamper"
  | "first-principles"
  | "cross-domain"
  | "constraints"
  | "inversion"
  | "perspectives"
  | "what-if"
  | "trend-collision";
```

---

### `ANGLE_IDS` constant

Readonly tuple of all valid angle identifier strings. Used to iterate over angles or validate user input.

```typescript
import { ANGLE_IDS } from "@innovator/core";

ANGLE_IDS.forEach((id) => console.log(id));
// "scamper", "first-principles", "cross-domain", ...
```

**Type:** `readonly ["scamper", "first-principles", "cross-domain", "constraints", "inversion", "perspectives", "what-if", "trend-collision"]`

---

### `ANGLES` constant

Array of all angle definitions with metadata:

```typescript
import { ANGLES } from "@innovator/core";

ANGLES.forEach((angle) => {
  console.log(`${angle.icon} ${angle.name}: ${angle.shortDescription}`);
});
```

Each entry has: `id`, `name`, `shortDescription`, `icon`.

---

### `withRetry(fn, options?)`

Retry an async function with exponential backoff on transient failures.

```typescript
import { withRetry } from "@innovator/core";

const result = await withRetry(() => fetchData(), {
  maxAttempts: 3,
  initialDelayMs: 1000,
});
```

**Parameters:**

| Param     | Type               | Required | Description                     |
| --------- | ------------------ | -------- | ------------------------------- |
| `fn`      | `() => Promise<T>` | Yes      | The async function to retry     |
| `options` | `RetryOptions`     | No       | Retry configuration (see below) |

**Returns:** `Promise<T>`

```typescript
interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in ms before first retry. Default: 1000 */
  initialDelayMs?: number;
  /** Multiplier applied to delay after each retry. Default: 2 */
  backoffMultiplier?: number;
  /** Maximum delay cap in ms. Default: 30000 */
  maxDelayMs?: number;
  /** Predicate to decide if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** AbortSignal to cancel retries early */
  signal?: AbortSignal;
}
```

---

### Prompt Sanitization Utilities

```typescript
import { sanitizeUserInput, wrapUserInput, sanitizeLlmOutput } from "@innovator/core";
```

| Function                      | Description                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `sanitizeUserInput(input)`    | Strip prompt-injection patterns from user text before LLM prompts   |
| `wrapUserInput(label, value)` | Sanitize and wrap user text in delimiters for safe prompt inclusion |
| `sanitizeLlmOutput(output)`   | Sanitize LLM output before re-inclusion in subsequent prompts       |

---

### `getAngleById(id)`

Look up an angle definition by its ID.

```typescript
import { getAngleById } from "@innovator/core";

const angle = getAngleById("scamper");
console.log(angle?.name); // "SCAMPER"
```

**Parameters:**

| Param | Type     | Required | Description                             |
| ----- | -------- | -------- | --------------------------------------- |
| `id`  | `string` | Yes      | The angle identifier (e.g. `"scamper"`) |

**Returns:** `AngleDefinition | undefined`

---

### Copilot Client Utilities

```typescript
import {
  generateText,
  generateTextStream,
  extractJson,
  getCopilotClient,
  stopCopilotClient,
} from "@innovator/core";
```

| Function                               | Description                                     |
| -------------------------------------- | ----------------------------------------------- |
| `generateText(options)`                | Send a prompt, wait for complete response       |
| `generateTextStream(options, onChunk)` | Stream response chunks                          |
| `extractJson(raw)`                     | Extract JSON from LLM response (brace-balanced) |
| `getCopilotClient()`                   | Get or create the singleton CopilotClient       |
| `stopCopilotClient()`                  | Shut down the CopilotClient gracefully          |

```typescript
interface GenerateOptions {
  prompt: string;
  model?: string;
  /** Use restricted permissions (for server/API routes) */
  serverMode?: boolean;
  /** Timeout in milliseconds for the LLM call (default: 90000) */
  timeoutMs?: number;
  /** AbortSignal to cancel the request early */
  signal?: AbortSignal;
}
```

---

### Request / Response Types

```typescript
interface InvestigateRequest {
  subject: string;
  model?: string;
}

interface InnovateRequest {
  subject: string;
  investigation: Investigation;
  angles: AngleId[];
  model?: string;
  synthesize?: boolean;
}

interface AutoRequest {
  subject: string;
  model?: string;
}
```

### Constants

| Constant          | Value | Description                                                              |
| ----------------- | ----- | ------------------------------------------------------------------------ |
| `MAX_CONCURRENCY` | `2`   | Maximum parallel LLM requests when generating ideas for multiple angles. |

`MAX_CONCURRENCY` is exported from `@innovator/core/types` and used by the innovate route to limit how many angles are processed simultaneously.

---

## Storage API

The storage abstraction (`packages/core/src/storage/`) provides a pluggable backend for all persistent data — sessions, workspaces, API keys, collaboration, analytics, and knowledge graph. See [ADR-0008](../docs/../docs/adr/) for design rationale.

Two built-in backends are available: **InMemoryStorageProvider** (default, no persistence) and **SQLiteStorageProvider** (file-based persistence).

### `getStorage()`

Return the current global storage provider.

```typescript
import { getStorage } from "@innovator/core";

const storage = getStorage();
const sessions = await storage.sessions.listSessions();
```

**Returns:** `StorageProvider`

### `setStorage(provider)`

Replace the global storage provider. Call `initializeStorage()` after setting a new provider.

```typescript
import { setStorage } from "@innovator/core";
import { SQLiteStorageProvider } from "@innovator/core";

setStorage(new SQLiteStorageProvider("./data/innovator.db"));
await initializeStorage();
```

**Parameters:**

| Param      | Type              | Required | Description                 |
| ---------- | ----------------- | -------- | --------------------------- |
| `provider` | `StorageProvider` | Yes      | The storage provider to use |

**Returns:** `void`

### `initializeStorage()`

Initialize the current global storage provider (creates tables, runs migrations, etc.). Must be called after `setStorage()`.

```typescript
import { initializeStorage } from "@innovator/core";

await initializeStorage();
```

**Returns:** `Promise<void>`

### `closeStorage()`

Gracefully shut down the current storage provider (close database connections, flush buffers). Call during application shutdown.

```typescript
import { closeStorage } from "@innovator/core";

await closeStorage();
```

**Returns:** `Promise<void>`

### `StorageProvider` interface

All storage providers must implement this interface:

```typescript
interface StorageProvider {
  readonly name: string;
  sessions: SessionStorage;
  workspaces: WorkspaceStorage;
  apiGateway: ApiGatewayStorage;
  collaboration: CollaborationStorage;
  analytics: AnalyticsStorage;
  knowledgeGraph: KnowledgeGraphStorage;

  initialize(): Promise<void>;
  close(): Promise<void>;
}
```

Each sub-interface (`SessionStorage`, `WorkspaceStorage`, etc.) defines CRUD operations for its domain. Import the types from `@innovator/core`:

```typescript
import type {
  StorageProvider,
  SessionStorage,
  WorkspaceStorage,
  ApiGatewayStorage,
  CollaborationStorage,
  AnalyticsStorage,
  KnowledgeGraphStorage,
} from "@innovator/core";
```

### Custom Backend Example

```typescript
import { setStorage, initializeStorage, closeStorage } from "@innovator/core";
import type { StorageProvider } from "@innovator/core";

class MyRedisStorageProvider implements StorageProvider {
  readonly name = "redis";
  // ... implement all sub-interfaces
  async initialize() {
    /* connect to Redis */
  }
  async close() {
    /* disconnect */
  }
}

// At application startup
setStorage(new MyRedisStorageProvider());
await initializeStorage();

// At shutdown
await closeStorage();
```

---

## Workspace & Collaboration APIs

### `createCollaborativeSession(subject, participants)`

Create a new collaborative innovation session.

```typescript
import { createCollaborativeSession } from "@innovator/core";

const session = createCollaborativeSession("remote work tools", [
  { userId: "user-1", displayName: "Alice" },
]);
```

**Parameters:**

| Param          | Type                                        | Required | Description              |
| -------------- | ------------------------------------------- | -------- | ------------------------ |
| `subject`      | `string`                                    | Yes      | The topic to innovate on |
| `participants` | `{ userId: string; displayName: string }[]` | Yes      | Initial participants     |

**Returns:** `CollaborativeSession`

---

### `joinSession(code, userId)`

Join an existing collaborative session via its share code.

**Parameters:**

| Param    | Type     | Required | Description            |
| -------- | -------- | -------- | ---------------------- |
| `code`   | `string` | Yes      | Session share code     |
| `userId` | `string` | Yes      | ID of the user joining |

**Returns:** `CollaborativeSession | undefined`

---

### `submitIdea(sessionId, userId, idea)`

Submit an idea to a collaborative session.

**Parameters:**

| Param       | Type             | Required | Description        |
| ----------- | ---------------- | -------- | ------------------ |
| `sessionId` | `string`         | Yes      | Session ID         |
| `userId`    | `string`         | Yes      | Submitting user ID |
| `idea`      | `InnovationIdea` | Yes      | The idea to submit |

**Returns:** `void`

---

### `voteForIdea(sessionId, ideaId, userId)`

Cast a vote for an idea in a collaborative session.

**Returns:** `void`

---

### `mergeIdeas(sessionId, ideaIds)`

Merge two or more ideas within a session into a single combined idea.

**Parameters:**

| Param       | Type       | Required | Description           |
| ----------- | ---------- | -------- | --------------------- |
| `sessionId` | `string`   | Yes      | Session ID            |
| `ideaIds`   | `string[]` | Yes      | IDs of ideas to merge |

**Returns:** `InnovationIdea`

---

### `completeSession(sessionId)`

Mark a collaborative session as complete.

**Returns:** `CollaborativeSession | undefined`

---

## Memory & Learning APIs

### `recordSignal(signal)`

Record a user behaviour signal for preference learning.

```typescript
import { recordSignal } from "@innovator/core";

recordSignal({
  userId: "user-1",
  type: "angle_selected",
  data: { angleId: "scamper" },
});
```

**Parameters:**

| Param    | Type         | Required | Description                                            |
| -------- | ------------ | -------- | ------------------------------------------------------ |
| `signal` | `UserSignal` | Yes      | Signal object with `userId`, `type`, and `data` fields |

**Returns:** `UserSignal`

---

### `getUserSignals(userId)`

Retrieve all recorded signals for a user.

**Returns:** `UserSignal[]`

---

### `buildPreferenceProfile(userId)`

Build or rebuild a user's preference profile from their recorded signals.

**Returns:** `UserPreferenceProfile`

---

### `getPreferenceProfile(userId)`

Retrieve an existing preference profile without rebuilding.

**Returns:** `UserPreferenceProfile | undefined`

---

### `buildPreferenceContext(userId)`

Generate a natural-language context string from a user's preferences for inclusion in LLM prompts.

**Returns:** `string | undefined`

---

### `assignABTest(testId, userId)`

Assign a user to an A/B test variant (`"adapted"` or `"default"`).

**Returns:** `ABTestAssignment`

---

### `getABTestVariant(testId, userId)`

Get the A/B test variant a user is assigned to.

**Returns:** `"adapted" | "default" | undefined`

---

### `clearMemory()`

Clear all stored memory data (signals, profiles, A/B assignments).

**Returns:** `void`

---

## Portfolio APIs

### `addPortfolioItem(params)`

Add an idea to the innovation portfolio. See [Core Concepts — Portfolio Tracking](/docs/core-concepts#portfolio-tracking).

```typescript
import { addPortfolioItem } from "@innovator/core";

const item = addPortfolioItem({
  title: "AI-powered code review",
  description: "Use LLMs to provide contextual review suggestions",
  sourceAngle: "trend-collision",
  tags: ["developer-tools", "ai"],
});
```

**Returns:** `PortfolioItem`

---

### `getPortfolioItem(id)`

Retrieve a portfolio item by UUID.

**Returns:** `PortfolioItem | undefined`

---

### `transitionItem(id, toStage, reason?, userId?)`

Transition a portfolio item to a new lifecycle stage.

**Parameters:**

| Param     | Type                 | Required | Description               |
| --------- | -------------------- | -------- | ------------------------- |
| `id`      | `string`             | Yes      | Portfolio item UUID       |
| `toStage` | `IdeaLifecycleStage` | Yes      | Target stage              |
| `reason`  | `string`             | No       | Reason for the transition |
| `userId`  | `string`             | No       | User who initiated it     |

**Returns:** `PortfolioItem | undefined`

---

### `updatePortfolioItem(id, updates)`

Update metadata (outcome, impact score, tags, assignee) on a portfolio item.

**Returns:** `boolean`

---

### `deletePortfolioItem(id)`

Permanently delete a portfolio item.

**Returns:** `boolean`

---

### `listPortfolioItems()`

List all portfolio items, sorted by most recently updated.

**Returns:** `PortfolioItem[]`

---

### `getPortfolioMetrics()`

Compute aggregated metrics across the portfolio (totals by stage/angle, conversion rates, velocity).

**Returns:** `PortfolioMetrics`

---

### `generatePortfolioInsights()`

Generate actionable insights from portfolio metrics.

**Returns:** `PortfolioInsight[]`

---

## Compliance APIs

### `screenIdea(idea, domain, industry?, model?, signal?)`

Screen a single idea for IP and regulatory risks.

```typescript
import { screenIdea } from "@innovator/core";

const result = await screenIdea(
  { title: "...", description: "..." },
  "healthcare",
  "medical-devices"
);
```

**Returns:** `Promise<IPScreeningResult>`

---

### `screenIdeas(ideas, domain, industry?, model?, signal?)`

Batch-screen multiple ideas and produce a compliance report.

**Returns:** `Promise<IPComplianceReport>`

---

### `getIndustryRegulations(industry)`

Look up regulatory constraints for a specific industry.

**Returns:** `RegulatoryConstraint[]`

---

### `listRegulatedIndustries()`

List all industries with known regulatory constraints.

**Returns:** `string[]`

---

### `complianceReportToMarkdown(report)`

Convert a compliance report to a readable Markdown string.

**Returns:** `string`

---

## Sprint APIs

### `createSprint(subject)`

Create a new innovation sprint for a subject.

```typescript
import { createSprint } from "@innovator/core";

const sprint = createSprint("sustainable packaging");
```

**Returns:** `Sprint`

---

### `getSprint(id)` · `listSprints()` · `deleteSprint(id)` · `clearSprints()`

CRUD operations for sprints. `getSprint` returns `Sprint | undefined`, `listSprints` returns `Sprint[]`, `deleteSprint` and `clearSprints` return `boolean` / `void`.

---

### `startSprint(id)` · `pauseSprint(id)`

Change sprint status to `active` or `paused`.

**Returns:** `Sprint | undefined`

---

### `canAdvancePhase(sprint)`

Check whether a sprint can advance to the next phase (diverge → converge → refine).

**Returns:** `{ canAdvance: boolean; reason?: string }`

---

### `advancePhase(id, model?, signal?)`

Advance a sprint to the next phase, running the appropriate LLM prompts.

**Returns:** `Promise<Sprint | undefined>`

---

### `updateSprintData(id, data)`

Update phase-specific data on a sprint (e.g. shortlisted ideas in the converge phase).

**Returns:** `Sprint | undefined`

---

### `generateRetrospective(id, model?, signal?)`

Generate a sprint retrospective summarising outcomes and learnings.

**Returns:** `Promise<SprintRetrospective | undefined>`

---

### `getProgressionSuggestions(sprint)`

Get suggestions for what to do next in the current sprint phase.

**Returns:** `string[]`

---

## Chaining APIs

### `runChain(chain, subject, investigation, onProgress?, model?, signal?)`

Execute an angle chain — a sequence of angles where each output feeds into the next.

```typescript
import { runChain, getChainById } from "@innovator/core";

const chain = getChainById("deep-disruption");
const results = await runChain(chain, "remote work", investigation);
```

**Returns:** `Promise<AngleResult[]>`

---

### `getChainById(id)`

Look up a built-in chain by ID.

**Returns:** `AngleChain | undefined`

---

### `listChains()`

List all available angle chains.

**Returns:** `AngleChain[]`

---

### `DEFAULT_CHAINS`

Array of built-in chain definitions: `deep-disruption`, `practical-innovation`, `market-entry`, `contrarian-path`, `full-spectrum`.

---

## Voice APIs

### `parseVoiceCommand(transcript)`

Parse a voice transcript into a structured command.

```typescript
import { parseVoiceCommand } from "@innovator/core";

const cmd = parseVoiceCommand("investigate machine learning");
// { command: "investigate", args: { subject: "machine learning" } }
```

**Returns:** `ParsedVoiceCommand | undefined`

---

### `buildNarrationSegments(data)`

Convert pipeline results into narration segments suitable for text-to-speech.

**Returns:** `NarrationSegment[]`

---

### `getVoiceCommandHelp()`

Get a human-readable help string listing all supported voice commands.

**Returns:** `string`

---

### `registerSTTProvider(provider)` · `registerTTSProvider(provider)`

Register a speech-to-text or text-to-speech provider.

**Returns:** `void`

---

### `getSTTProvider(id)` · `getTTSProvider(id)`

Retrieve a registered provider by ID.

**Returns:** `SpeechRecognitionProvider | undefined` / `TextToSpeechProvider | undefined`

---

### `listSTTProviders()` · `listTTSProviders()`

List all registered providers.

**Returns:** `SpeechRecognitionProvider[]` / `TextToSpeechProvider[]`

---

### `clearVoiceProviders()`

Remove all registered voice providers.

**Returns:** `void`

---

## Market Signals APIs

### `fetchMarketSignals(query, limit?, model?, signal?)`

Fetch market signals from all registered providers for a given query.

```typescript
import { fetchMarketSignals } from "@innovator/core";

const report = await fetchMarketSignals("AI developer tools", 10);
```

**Returns:** `Promise<MarketSignalReport>`

---

### `buildMarketSignalContext(report)`

Convert a market signal report into a context string for LLM prompts.

**Returns:** `string`

---

### `registerSignalProvider(provider)` · `unregisterSignalProvider(id)`

Register or remove a market signal provider.

---

### `listSignalProviders()` · `getAvailableProviders()`

List registered / available signal providers.

**Returns:** `MarketSignalProvider[]`

---

### `clearSignalProviders()`

Remove all registered signal providers.

**Returns:** `void`

---

### Built-in Signal Providers

| Provider               | Source                  |
| ---------------------- | ----------------------- |
| `ProductHuntProvider`  | Product Hunt trending   |
| `HackerNewsProvider`   | Hacker News top stories |
| `GoogleTrendsProvider` | Google Trends data      |
| `ArxivProvider`        | arXiv research papers   |
| `PatentFilingProvider` | Recent patent filings   |

---

## Dependency Graph APIs

### `buildIdeaDependencyGraph(angleResults, subject, model?, signal?)`

Analyse relationships between ideas across angles and produce a dependency graph.

```typescript
import { buildIdeaDependencyGraph } from "@innovator/core";

const graph = await buildIdeaDependencyGraph(angleResults, "remote work");
```

**Returns:** `Promise<IdeaDependencyGraph>`

---

### `dependencyGraphToMarkdown(graph)`

Convert a dependency graph to a readable Markdown representation.

**Returns:** `string`

---

## Plugin Registry APIs

### `registerPlugin(plugin)`

Register a plugin (angle, exporter, or visualizer).

```typescript
import { registerPlugin } from "@innovator/core";

registerPlugin({
  id: "my-angle",
  type: "angle",
  name: "My Custom Angle",
  version: "1.0.0",
  // ... angle-specific fields
});
```

**Returns:** `void`

---

### `unregisterPlugin(id)`

Remove a plugin by ID.

**Returns:** `boolean`

---

### `getPlugin(id)`

Retrieve a registered plugin by ID.

**Returns:** `InnovatorPlugin | undefined`

---

### `listPlugins()`

List all registered plugins.

**Returns:** `InnovatorPlugin[]`

---

### `getPluginsByType(type)`

List plugins filtered by type (`"angle"`, `"exporter"`, or `"visualizer"`).

**Returns:** `InnovatorPlugin[]`

---

### `clearPlugins()`

Remove all registered plugins.

**Returns:** `void`

---

### `loadPlugin(source)`

Load a plugin from an external source (URL or file path).

**Returns:** `Promise<InnovatorPlugin>`

---

---

## Scoring APIs

### `scoreIdeas(ideas, model?, signal?)`

Score ideas on novelty, feasibility, and impact dimensions using LLM analysis.

```typescript
import { scoreIdeas } from "@innovator/core";

const result = await scoreIdeas([{ title: "AI code review", description: "..." }]);
```

**Returns:** `Promise<ScoringResult>`

```typescript
interface IdeaScore {
  ideaTitle: string;
  novelty: number; // 1-10
  feasibility: number; // 1-10
  impact: number; // 1-10
  timeToImplement: string;
  reasoning: string;
}

interface ScoringResult {
  scores: IdeaScore[];
  topPick: string;
}
```

---

### `computePriorityScore(score)` · `getQuadrant(score)` · `rankIdeas(scores)`

| Function               | Description                                                              | Returns       |
| ---------------------- | ------------------------------------------------------------------------ | ------------- |
| `computePriorityScore` | Weighted priority score from novelty/feasibility/impact                  | `number`      |
| `getQuadrant`          | Classify into `"quick-win"`, `"strategic"`, `"fill-in"`, or `"moonshot"` | `string`      |
| `rankIdeas`            | Rank ideas by priority score descending                                  | `IdeaScore[]` |

---

## Workspace APIs

### `createWorkspace(params)`

Create a new workspace for organizing innovation sessions.

```typescript
import { createWorkspace } from "@innovator/core";

const ws = createWorkspace({
  name: "Q3 Innovation",
  description: "Q3 product innovation workspace",
  ownerId: "user-1",
});
```

**Returns:** `Workspace`

---

### `getWorkspace(id)` · `listWorkspaces()` · `listUserWorkspaces(userId)` · `deleteWorkspace(id)`

CRUD operations for workspaces. `listUserWorkspaces` returns workspaces where the user is a member.

---

### `addMember(workspaceId, member)` · `removeMember(workspaceId, userId)` · `updateMemberRole(workspaceId, userId, role)`

Manage workspace membership. Roles: `"owner"`, `"editor"`, `"viewer"`.

---

### `hasPermission(workspaceId, userId, action)`

Check if a user has permission for an action in a workspace.

**Returns:** `boolean`

---

### `addSessionToWorkspace(workspaceId, session)` · `searchWorkspaceSessions(workspaceId, query)`

Add sessions to a workspace and search across them.

---

### `getActivityFeed(workspaceId)` · `sharePreset(workspaceId, preset)` · `shareAngle(workspaceId, angle)`

Activity feed and content sharing within a workspace.

---

## Artifact APIs

### `generateArtifact(idea, type, context, model?, signal?)`

Generate a structured artifact from an innovation idea.

```typescript
import { generateArtifact } from "@innovator/core";

const prd = await generateArtifact(idea, "prd", {
  subject: "remote work tools",
  investigation,
});
```

**Parameters:**

| Param     | Type              | Required | Description                                                           |
| --------- | ----------------- | -------- | --------------------------------------------------------------------- |
| `idea`    | `InnovationIdea`  | Yes      | The idea to generate an artifact for                                  |
| `type`    | `ArtifactType`    | Yes      | `"prd"`, `"user-story"`, `"tech-spec"`, `"pitch-outline"`, or `"okr"` |
| `context` | `ArtifactContext` | Yes      | Subject and investigation context                                     |
| `model`   | `string`          | No       | LLM model ID                                                          |
| `signal`  | `AbortSignal`     | No       | Signal to cancel the request early                                    |

**Returns:** `Promise<Artifact>`

---

### `generateArtifactStream(idea, type, context, onChunk, model?, signal?)`

Stream artifact generation with chunk callbacks.

**Returns:** `Promise<Artifact>`

---

### `artifactToMarkdown(artifact)` · `artifactToGitHubIssue(artifact)`

Convert an artifact to Markdown or GitHub Issue body format.

**Returns:** `string`

---

## Knowledge Graph APIs

### `ingestInvestigation(investigation, subject)`

Add an investigation's findings to the persistent knowledge graph.

```typescript
import { ingestInvestigation, getKnowledgeGraph } from "@innovator/core";

ingestInvestigation(investigation, "remote work tools");
const graph = getKnowledgeGraph();
```

**Returns:** `void`

---

### `queryRelatedSubjects(subject, limit?)`

Find subjects related to a given topic in the knowledge graph.

**Returns:** `EntityNode[]`

---

### `getKnowledgeGraph()` · `getGraphStats()` · `clearKnowledgeGraph()`

Retrieve the full graph, statistics, or clear all data.

---

### `filterGraphNodes(predicate)`

Filter graph nodes by a predicate function.

**Returns:** `EntityNode[]`

---

## Provider APIs

### `registerProvider(provider)` · `getProvider(id)` · `setActiveProvider(id)` · `listProviders()` · `initializeProviders(config?)`

Manage the LLM provider registry. See the [Provider Classes](#provider-classes) section below for detailed parameter descriptions.

```typescript
import { initializeProviders, setActiveProvider, listProviders } from "@innovator/core";

initializeProviders();
setActiveProvider("openai");
console.log(listProviders().map((p) => p.name));
```

---

### `getActiveProvider()`

Get the currently active provider. Falls back to `CopilotProvider` if none is explicitly set.

**Returns:** `LLMProvider`

---

### `loadConfig()` · `saveConfig(config)`

Load/save provider configuration from/to `~/.innovator/config.json`.

---

### Provider Classes

| Class               | Provider       | Config                                 |
| ------------------- | -------------- | -------------------------------------- |
| `CopilotProvider`   | GitHub Copilot | Requires `gh auth login` or `GH_TOKEN` |
| `OpenAIProvider`    | OpenAI         | `OPENAI_API_KEY`                       |
| `AnthropicProvider` | Anthropic      | `ANTHROPIC_API_KEY`                    |
| `OllamaProvider`    | Ollama (local) | `OLLAMA_BASE_URL`                      |

---

## Cost Tracking APIs

### `CostTracker`

Class for tracking LLM token usage and costs across pipeline runs.

```typescript
import { getCostTracker } from "@innovator/core";

const tracker = getCostTracker();
const summary = tracker.getSummary();
console.log(`Total cost: $${summary.totalCost}`);
```

---

### `getCostTracker()` · `resetCostTracker()`

Get the singleton cost tracker instance or reset accumulated data.

---

### `estimateTokenCount(text)` · `estimateCost(model, inputTokens, outputTokens)`

Estimate token counts for text and cost for a given model.

**Returns:** `number`

---

### `setModelPricing(model, pricing)` · `getModelPricing(model)` · `listModelPricing()`

Manage per-model pricing configuration.

---

## Export APIs

### `exportToMarkdown(data)` · `exportToJson(data)` · `exportToClipboard(data)`

Export innovation results to common formats.

```typescript
import { exportToMarkdown } from "@innovator/core";

const md = exportToMarkdown({
  subject: "remote work",
  investigation,
  angleResults,
  synthesis,
});
```

**Returns:** `ExportResult`

---

### `exportToPowerPoint(data)` · `exportToJira(data)` · `exportToConfluence(data)` · `exportToNotion(data)` · `exportToGoogleSlides(data)`

Export to integration-specific formats. Each returns an `ExportResult` with format-specific content.

---

### `generateGitHubIssueBody(data)`

Generate a GitHub Issue body from innovation results.

**Returns:** `ExportResult`

---

### `getAvailableFormats()`

List all available export formats.

**Returns:** `string[]`

---

## Model Registry APIs

### `getModelRegistry()`

Get the full model registry with capabilities and pricing information.

**Returns:** `ModelRegistryEntry[]`

---

### `registerModel(model)` · `clearCustomModels()`

Register a custom model or clear all custom model registrations.

---

### `getModelCapability(modelId)`

Look up the capability tier of a model.

**Returns:** `ModelCapability | undefined`

---

### `getSmartRouting(task)`

Get the recommended model for a task type (investigation, generation, synthesis).

**Returns:** `string`

---

### `compareModels(modelIds)`

Compare capabilities of multiple models side by side.

**Returns:** `ModelComparison[]`

---

## Visualization APIs

### `buildIdeaGraph(angleResults)`

Build a graph of ideas with nodes and edges representing relationships.

```typescript
import { buildIdeaGraph } from "@innovator/core";

const graph = buildIdeaGraph(angleResults);
console.log(graph.nodes.length, "nodes", graph.edges.length, "edges");
```

**Returns:** `IdeaGraph`

```typescript
interface IdeaGraph {
  nodes: IdeaNode[];
  edges: IdeaEdge[];
}
```

---

### `getAngleColor(angleId)`

Get the display color for an angle.

**Returns:** `string`

---

## Conversation & Refinement APIs

### `createConversation(subject, selectedIdeas)` · `getConversation(id)` · `deleteConversation(id)` · `listConversations()` · `clearConversations()`

Manage refinement conversations for iterative idea deepening.

```typescript
import { createConversation, refineConversation } from "@innovator/core";

const conv = createConversation("remote work", [idea1, idea2]);
const refined = await refineConversation(conv.id, "Focus on enterprise");
```

---

### `refineConversation(id, message, model?, signal?)`

Send a follow-up message to refine ideas in a conversation.

**Returns:** `Promise<RefinementResponse>`

---

### `createExplorationTree(subject)` · `getExplorationTree(id)` · `drillDown(treeId, nodeId, question, model?, signal?)`

Create branching exploration trees for non-linear idea investigation.

---

### `getExplorationPath(treeId, nodeId)` · `getNodeBranches(treeId, nodeId)`

Navigate the exploration tree structure.

---

## Sharing APIs

### `shareInvestigation(data, options?)`

Create a shareable link for an investigation.

```typescript
import { shareInvestigation } from "@innovator/core";

const shared = shareInvestigation(
  {
    subject: "remote work",
    investigation,
    angleResults,
    synthesis,
  },
  { isPublic: true, expiresInDays: 30 }
);
```

**Returns:** `SharedInvestigation`

---

### `getSharedInvestigation(slug)` · `listSharedInvestigations()` · `deleteSharedInvestigation(slug)` · `clearSharedInvestigations()`

CRUD operations for shared investigations.

---

### `forkInvestigation(slug)`

Fork a shared investigation to create a new editable copy.

**Returns:** `ForkResult`

---

### `buildShareUrl(slug)`

Build the full URL for a shared investigation.

**Returns:** `string`

---

## Depth APIs

### `getDepthConfig(depth)`

Get the configuration for a depth tier.

```typescript
import { getDepthConfig, suggestDepth } from "@innovator/core";

const depth = suggestDepth("quantum computing");
const config = getDepthConfig(depth);
```

**Parameters:**

| Param   | Type    | Required | Description                            |
| ------- | ------- | -------- | -------------------------------------- |
| `depth` | `Depth` | Yes      | `"shallow"`, `"standard"`, or `"deep"` |

**Returns:** `DepthConfig`

---

### `suggestDepth(subject)`

Suggest the optimal investigation depth for a subject.

**Returns:** `Depth`

---

### `buildShallowInvestigationPrompt(subject)` · `buildSubTopicPrompt(subject, topic)` · `buildDeepDivePrompt(subject, topic)` · `buildDeepSynthesisPrompt(subject, topics)`

Build depth-specific prompts for investigation stages.

---

## Feedback APIs

### `submitFeedback(feedback)`

Submit quality feedback on generated ideas.

```typescript
import { submitFeedback } from "@innovator/core";

submitFeedback({
  sessionId: "session-1",
  ideaTitle: "AI Code Review",
  rating: "helpful",
  angleId: "scamper",
});
```

**Returns:** `IdeaFeedback`

---

### `loadAllFeedback()` · `getSessionFeedback(sessionId)`

Retrieve feedback records.

---

### `computeAngleScores()` · `getFeedbackSummary()` · `buildFeedbackHint(angleId)`

Compute aggregate quality scores and build prompt hints from feedback data.

---

## i18n APIs

### `detectLanguage(text)` · `localizePrompt(prompt, language)` · `listLanguages()` · `getLanguageConfig(language)`

Multi-language support for prompts and outputs.

```typescript
import { detectLanguage, localizePrompt } from "@innovator/core";

const lang = detectLanguage("Investigar herramientas de trabajo remoto");
const localized = localizePrompt(prompt, lang);
```

---

## Offline APIs

### `detectOllama()` · `checkNetworkStatus()` · `getOfflineStatus()`

Check availability of local Ollama instance and network connectivity.

```typescript
import { getOfflineStatus, getRecommendedModel } from "@innovator/core";

const status = await getOfflineStatus();
if (status.isOffline) {
  const model = getRecommendedModel("investigation");
}
```

---

### `getRecommendedModel(task)`

Get the recommended local model for a task when offline.

**Returns:** `RecommendedModel`

---

## Hypothesis APIs

### `parseHypothesis(text, model?, signal?)`

Parse a natural-language hypothesis into structured components.

```typescript
import { parseHypothesis, analyzeHypothesis } from "@innovator/core";

const parsed = await parseHypothesis(
  "If we add AI code review, then developer productivity increases by 20%"
);
const analysis = await analyzeHypothesis(parsed);
```

**Returns:** `Promise<ParsedHypothesis>`

---

### `analyzeHypothesis(hypothesis, model?, signal?)`

Analyze a parsed hypothesis — generates experiment cards, counter-evidence, alternatives, and pivot suggestions.

**Returns:** `Promise<HypothesisAnalysis>`

---

### `createHypothesisSession(hypothesis)` · `getHypothesisSession(id)` · `listHypothesisSessions()` · `clearHypothesisSessions()`

Session management for hypothesis-driven innovation.

---

### `updateHypothesisStatus(id, status)` · `attachAnalysis(id, analysis)`

Update hypothesis session state.

---

## Debate APIs

### `runDebate(idea, config?, model?, signal?)`

Run a structured debate on an innovation idea between pro and con personas.

```typescript
import { runDebate } from "@innovator/core";

const result = await runDebate({ title: "AI code review", description: "..." }, { rounds: 3 });
console.log(result.verdict.recommendation);
```

**Returns:** `Promise<DebateResult>`

---

### `debateIdeas(ideas, config?, model?, signal?)`

Run debates on multiple ideas in batch.

**Returns:** `Promise<DebateResult[]>`

---

### `debateToMarkdown(result)`

Convert a debate result to readable Markdown.

**Returns:** `string`

---

## Evolution APIs

### `runEvolution(ideas, config?, model?, signal?)`

Evolve ideas through genetic-algorithm-inspired selection, crossover, and mutation.

```typescript
import { runEvolution } from "@innovator/core";

const result = await runEvolution(ideas, {
  generations: 5,
  populationSize: 10,
  mutationRate: 0.3,
});
```

**Returns:** `Promise<EvolutionResult>`

---

### `crossover(ideaA, ideaB, model?, signal?)` · `mutate(idea, type, model?, signal?)` · `select(ideas, count)`

Low-level evolution primitives for custom workflows.

---

### `evolutionToMarkdown(result)`

Convert evolution results to readable Markdown.

**Returns:** `string`

---

## Stress Testing APIs

### `stressTestIdeas(ideas, config?, model?, signal?)`

Stress-test ideas against adversarial scenarios (market crash, competitor response, regulatory change, etc.).

```typescript
import { stressTestIdeas } from "@innovator/core";

const result = await stressTestIdeas(ideas, {
  scenarioCount: 5,
});
```

**Returns:** `Promise<StressTestResult>`

---

### `generateStressScenarios(ideas, count?, model?, signal?)`

Generate stress scenarios without running the full test.

**Returns:** `Promise<StressScenario[]>`

---

### `stressTestToMarkdown(result)`

Convert stress test results to readable Markdown.

**Returns:** `string`

---

## Validation APIs

### `validateIdea(idea, domain, model?, signal?)`

Validate a single idea against built-in and custom validators.

```typescript
import { validateIdea, validateComprehensive } from "@innovator/core";

const result = await validateIdea(idea, "enterprise SaaS");
```

**Returns:** `Promise<ValidationResult>`

---

### `validateIdeas(ideas, domain, model?, signal?)`

Batch-validate multiple ideas and produce a scorecard.

**Returns:** `Promise<ValidationScorecard>`

---

### `validateComprehensive(idea, domain, model?, signal?)`

Run comprehensive validation including all registered validators.

**Returns:** `Promise<ComprehensiveValidation>`

---

### `registerValidator(validator)` · `unregisterValidator(id)` · `listValidators()` · `clearValidators()`

Manage custom validators.

---

### Built-in Validators

| Validator               | Checks                        |
| ----------------------- | ----------------------------- |
| `PatentValidator`       | Patent landscape conflicts    |
| `MarketValidator`       | Market fit and demand signals |
| `FeasibilityValidator`  | Technical feasibility         |
| `MarketSizingValidator` | TAM/SAM/SOM estimates         |
| `RegulatoryValidator`   | Regulatory compliance risks   |

---

## Benchmark APIs

### `runBenchmark(subject, modelIds, angles?, signal?)`

Benchmark multiple LLM models against the same subject and angles.

```typescript
import { runBenchmark } from "@innovator/core";

const report = await runBenchmark("remote work", ["gpt-4.1", "claude-sonnet-4-20250514"]);
```

**Returns:** `Promise<BenchmarkReport>`

---

### `evaluateAngleResult(result, model?, signal?)`

Evaluate a single angle result for quality.

**Returns:** `Promise<IdeaEvaluation>`

---

### `benchmarkToMarkdown(report)`

Convert a benchmark report to readable Markdown.

**Returns:** `string`

---

## Event Bus & Webhook APIs

### `EventBus`

Event bus for publishing and subscribing to pipeline events.

```typescript
import { getEventBus } from "@innovator/core";

const bus = getEventBus();
bus.on("idea.scored", (event) => console.log(event));
bus.emit({ type: "idea.scored", data: { ... } });
```

---

### `getEventBus()` · `resetEventBus()`

Get the singleton event bus or reset it.

---

### `WebhookManager`

Manage webhook endpoints for event delivery.

---

### `createAutomationRule(rule)` · `listAutomationRules()` · `toggleAutomationRule(id)` · `deleteAutomationRule(id)`

Create and manage automation rules that trigger actions on events.

---

### Webhook Templates

| Template                 | Target        |
| ------------------------ | ------------- |
| `SLACK_TEMPLATE`         | Slack channel |
| `GITHUB_ISSUES_TEMPLATE` | GitHub Issues |
| `JIRA_TEMPLATE`          | Jira          |
| `EMAIL_TEMPLATE`         | Email         |

---

## RAG APIs

### `KnowledgeBase`

Class for building and querying a retrieval-augmented generation knowledge base.

```typescript
import { KnowledgeBase, loadDocument } from "@innovator/core";

const kb = new KnowledgeBase({ chunkSize: 500 });
const doc = await loadDocument("./research.pdf");
kb.addDocument(doc);
const results = await kb.search("remote work trends", 5);
```

---

### `loadDocument(source)` · `chunkText(text, options?)` · `generateEmbedding(text)`

Document loading, chunking, and embedding utilities.

---

### `cosineSimilarity(a, b)`

Compute cosine similarity between two embedding vectors.

**Returns:** `number`

---

### Connectors

| Connector             | Source      |
| --------------------- | ----------- |
| `GitHubConnector`     | GitHub      |
| `ConfluenceConnector` | Confluence  |
| `NotionConnector`     | Notion      |
| `LocalFileConnector`  | Local files |

### `registerConnector(connector)` · `listConnectors()` · `syncConnector(id)` · `removeConnector(id)` · `clearConnectors()`

Manage knowledge source connectors.

---

### `buildContextInjection(query, kb)`

Build a context injection string from RAG results for LLM prompts.

**Returns:** `string`

---

## Competitive Intelligence APIs

### `analyzeCompetitors(subject, competitors, model?, signal?)`

Analyze the competitive landscape for a subject.

```typescript
import { analyzeCompetitors } from "@innovator/core";

const analysis = await analyzeCompetitors("AI code review", ["CodeRabbit", "Qodo"]);
```

**Returns:** `Promise<CompetitiveAnalysis>`

---

### `getCompetitiveAnalysis(id)` · `listCompetitiveAnalyses()` · `clearCompetitiveAnalyses()`

CRUD for competitive analyses.

---

### `rankGaps(analysis)` · `rankStrategies(analysis)` · `generatePositioningMatrix(analysis)`

Derive insights from competitive analysis results.

---

### `createMonitor(config)` · `listMonitors()` · `getMonitor(id)` · `deleteMonitor(id)`

Set up ongoing competitive monitoring.

---

### `recordCompetitiveSignal(signal)` · `getSignals(monitorId)` · `detectTrends(monitorId)` · `generateInvestigationSuggestions(monitorId)`

Signal tracking and trend detection.

---

## Research APIs

### `deepInvestigate(subject, depth?, config?, signal?)`

Run a multi-step deep research investigation with configurable depth.

```typescript
import { deepInvestigate } from "@innovator/core";

const brief = await deepInvestigate("quantum computing", "comprehensive");
```

**Returns:** `Promise<ResearchBrief>`

---

### `ResearchAgent`

Agent class for customized research workflows.

---

## Replay & Observatory APIs

### `startRunRecord(subject)` · `recordPrompt(record)` · `completeRunRecord(id)`

Record LLM calls during pipeline runs for later replay.

---

### `replayRun(id, overrides?)` · `previewReplay(id, overrides?)`

Replay a recorded run with optional parameter overrides.

---

### `compareRuns(idA, idB)` · `comparisonToMarkdown(comparison)`

Compare two recorded runs side by side.

---

### `setObservatoryEnabled(enabled)` · `isObservatoryEnabled()`

Enable/disable the prompt observatory.

---

### `recordPromptCall(call)` · `observeCall(fn)`

Record individual prompt calls or wrap a function for automatic recording.

---

### `getCallTimeline(options?)` · `getObservatoryStats()` · `diffPromptCalls(idA, idB)` · `clearObservatory()`

Query and analyze recorded prompt calls.

---

## Provenance APIs

### `buildProvenanceRecords(angleResults, subject)`

Build provenance records tracking the lineage of generated ideas.

```typescript
import { buildProvenanceRecords, verifyChainIntegrity } from "@innovator/core";

const records = buildProvenanceRecords(angleResults, "remote work");
const chain = createProvenanceChain(records);
const isValid = verifyChainIntegrity(chain);
```

---

### `createProvenanceChain(records)` · `buildProvenanceTree(records)` · `buildLineageGraph(records)`

Build different provenance visualizations.

---

### `verifyChainIntegrity(chain)` · `computeRecordHash(record)` · `computeChainHash(chain)`

Tamper-detection via hash-based chain integrity verification.

---

### `formatProvenance(records)` · `provenanceToMarkdown(records)` · `provenanceToJsonLd(records)`

Format provenance data for display or export.

---

## Serendipity APIs

### `findSerendipitousConnections(sessions, limit?)`

Discover unexpected connections across multiple investigation sessions.

```typescript
import { findSerendipitousConnections } from "@innovator/core";

const connections = findSerendipitousConnections(sessions, 5);
```

**Returns:** `SerendipityResult`

---

### `embedSession(session)`

Generate an embedding for a session for similarity matching.

---

## Diff APIs

### `runInnovationDiff(before, after, model?, signal?)`

Compare two investigation snapshots and produce a structured diff.

```typescript
import { runInnovationDiff } from "@innovator/core";

const diff = await runInnovationDiff(oldInvestigation, newInvestigation);
```

**Returns:** `Promise<DiffResult>`

---

### `buildDiffPrompt(before, after)`

Build the prompt for investigation diff comparison.

**Returns:** `string`

---

## Audience APIs

### `transformForAudience(data, audience)`

Transform innovation output for a specific audience (executive, technical, marketing, etc.).

```typescript
import { transformForAudience } from "@innovator/core";

const execSummary = await transformForAudience(results, "executive");
```

**Returns:** `Promise<AudienceOutput>`

---

### `transformForAllAudiences(data)`

Transform for all available audiences at once.

**Returns:** `Promise<AudienceOutput[]>`

---

### `OUTPUT_MODES` · `OUTPUT_MODE_DEFINITIONS` · `getOutputMode(id)`

Constants and lookup for available output modes/audiences.

---

## Gamification APIs

### `awardAchievement(userId, achievementId)` · `getUserAchievements(userId)` · `getUserPoints(userId)`

Award and query user achievements and points.

```typescript
import { awardAchievement, getUserAchievements } from "@innovator/core";

awardAchievement("user-1", "first-investigation");
const achievements = getUserAchievements("user-1");
```

---

### `createChallenge(challenge)` · `startChallenge(id)` · `completeChallenge(id, userId)` · `getUserChallenges(userId)`

Create and manage innovation challenges.

---

### `getLeaderboard(limit?)` · `addActivity(activity)` · `getActivityFeedItems(userId?, limit?)`

Leaderboards and activity feeds.

---

### `getGamificationConfig()` · `updateGamificationConfig(config)` · `clearGamification()`

Configure the gamification system.

---

## Tracker APIs

### `trackIdea(idea)` · `getTrackedIdea(id)` · `loadTrackedIdeas()` · `updateTrackedIdeaStatus(id, status)`

Track idea fitness over time with external platform status.

```typescript
import { trackIdea, buildDashboard } from "@innovator/core";

trackIdea({ title: "AI Code Review", status: "exploring", platform: "jira" });
const dashboard = buildDashboard();
```

---

### `buildDashboard()`

Build a tracker dashboard with aggregated metrics.

**Returns:** `TrackerDashboard`

---

## Custom Angles APIs

### `addCustomAngle(angle)` · `getCustomAngle(id)` · `updateCustomAngle(id, updates)` · `removeCustomAngle(id)` · `loadCustomAngles()`

Create, manage, and persist custom innovation angles.

```typescript
import { addCustomAngle } from "@innovator/core";

addCustomAngle({
  id: "design-thinking",
  name: "Design Thinking",
  promptTemplate: "Apply design thinking to {{subject}}...",
  icon: "🎨",
});
```

---

### `exportAnglePack(angleIds)` · `importAnglePack(pack)`

Export and import collections of custom angles as packs.

---

### `buildCustomAnglePrompt(angle, subject, investigation)`

Build the LLM prompt for a custom angle.

**Returns:** `string`

---

## Comparative Pipeline APIs

### `runComparativePipeline(subjects, options?)`

Run investigations across multiple subjects in parallel for side-by-side comparison.

```typescript
import { runComparativePipeline } from "@innovator/core";

const result = await runComparativePipeline(["Slack", "Teams", "Discord"]);
```

**Returns:** `Promise<ComparativeProgress>`

---

### `runParallelInvestigation(subjects, model?, signal?)`

Run parallel investigations without synthesis.

**Returns:** `Promise<ParallelInvestigationResult>`

---

## Web API Routes

All API routes return JSON responses with consistent error shapes. See [Error Responses](#error-responses) below for details.

### Production Availability

The first production release is a headless, single-process, single-tenant API. Only these routes are available:

| Access    | Method | Route                 |
| --------- | ------ | --------------------- |
| Public    | GET    | `/healthz`            |
| Public    | GET    | `/readyz`             |
| Protected | GET    | `/api/health`         |
| Protected | GET    | `/api/angles`         |
| Protected | GET    | `/api/presets`        |
| Protected | POST   | `/api/investigate`    |
| Protected | POST   | `/api/innovate`       |
| Protected | POST   | `/api/auto`           |
| Protected | POST   | `/api/nl-innovate`    |
| Protected | POST   | `/api/v1/investigate` |
| Protected | POST   | `/api/v1/innovate`    |
| Protected | POST   | `/api/v1/auto`        |
| Protected | GET    | `/api/v1/openapi`     |

All protected routes require `X-API-Key` or `Authorization: Bearer`. Other route documentation on this page describes development/experimental handlers that return `404` in production. Using the wrong method on an allowlisted path returns `405`.

### `GET /healthz`

Public liveness probe. Returns `200` when the process can answer HTTP.

### `GET /readyz`

Public readiness probe. Validates production configuration, both writable state volumes, and Copilot provider model availability. Returns `503` when the instance is not ready.

### `POST /api/investigate`

```json
// Request
{ "subject": "remote work tools", "model": "gpt-4.1" }

// Response (200)
{
  "summary": "...",
  "keyAspects": [{ "title": "...", "description": "..." }],
  "currentState": "...",
  "challenges": ["..."],
  "opportunities": ["..."]
}

// Error (400)
{ "error": "Invalid request. Please check your input and try again." }
```

### `POST /api/innovate`

```json
// Request
{
  "subject": "remote work tools",
  "investigation": { ... },
  "angles": ["scamper", "first-principles"],
  "synthesize": true
}

// Response (200)
{
  "angleResults": [{ "angleId": "scamper", "angleName": "SCAMPER", "ideas": [...], "reasoning": "..." }],
  "synthesis": { "topIdeas": [...], "themes": [...], "recommendation": "..." }
}
```

:::note Partial Failures
The `/api/innovate` route uses `Promise.allSettled()` internally, so individual angle failures do not fail the entire request. The response includes only successful results in `angleResults`. If all angles fail, the endpoint returns a `500` error. Synthesis only runs when `results.length >= 2` — if fewer than 2 angles succeed, the response omits the `synthesis` field even when `synthesize: true` is requested.
:::

### `POST /api/auto`

Returns a **Server-Sent Events** stream. Each event is a JSON `PipelineProgress` object:

```
data: {"stage":"investigating","completedAngles":[],"totalAngles":8,"angleResults":[]}

data: {"stage":"generating","completedAngles":["scamper"],"totalAngles":8,...}

data: {"stage":"complete","completedAngles":[...],"synthesis":{...}}
```

#### Fields present at each stage

Not every `PipelineProgress` field is populated at every stage. The table below shows which fields carry meaningful values at each stage transition:

| Field             | `investigating` | `generating`                       | `synthesizing`    | `complete`        | `error`        |
| ----------------- | --------------- | ---------------------------------- | ----------------- | ----------------- | -------------- |
| `stage`           | ✅              | ✅                                 | ✅                | ✅                | ✅             |
| `totalAngles`     | ✅              | ✅                                 | ✅                | ✅                | ✅             |
| `completedAngles` | `[]`            | Grows as angles finish             | All angles listed | All angles listed | Partial        |
| `currentAngle`    | —               | ID of the angle in progress        | —                 | —                 | —              |
| `investigation`   | —               | ✅ (set after investigation)       | ✅                | ✅                | May be present |
| `angleResults`    | `[]`            | Grows with each completion         | All angle results | All angle results | Partial        |
| `failedAngles`    | —               | `{ angleId, error }[]` if any fail | May be present    | May be present    | May be present |
| `synthesis`       | —               | —                                  | —                 | ✅                | —              |
| `error`           | —               | —                                  | —                 | —                 | Error message  |

:::note
The server sends SSE keepalive comments (`: keepalive`) every 15 seconds to prevent proxy/load-balancer timeouts. These are lines starting with `:` and should be ignored by the client.
:::

#### Consuming the SSE stream

The `/api/auto` endpoint uses raw SSE (not compatible with `EventSource`). Use `fetch()` with a streaming reader:

```javascript
async function runAuto(subject) {
  const response = await fetch("/api/auto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject }),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE messages are separated by double newlines
    const parts = buffer.split("\n\n");
    buffer = parts.pop(); // keep incomplete chunk

    for (const part of parts) {
      if (part.startsWith("data: ")) {
        const progress = JSON.parse(part.slice(6));
        console.log(progress.stage, progress.completedAngles.length);
      }
      // Lines starting with ":" are keepalive comments — ignore them
    }
  }
}
```

### `GET /api/health`

Authenticated detailed component health report. Returns `503` when the report is unhealthy.

---

### `POST /api/artifacts`

Generate structured artifacts from an innovation idea.

```json
// Request
{
  "idea": { "title": "...", "description": "...", "potentialImpact": "...", "implementationHint": "..." },
  "artifactType": "prd",
  "subject": "remote work tools",
  "investigation": { ... },
  "model": "gpt-4.1"
}

// Response (200)
{
  "type": "prd",
  "title": "...",
  "content": "...",
  "sections": [{ "heading": "...", "body": "..." }],
  "metadata": { ... }
}
```

**Artifact types:** `prd`, `user-story`, `tech-spec`, `pitch-outline`, `okr`

---

### `GET /api/collaborate` · `POST /api/collaborate`

Manage collaborative innovation sessions with voting and commenting.

```json
// GET — Retrieve session by ID or share code
// Query: ?id=<session-id> or ?code=<share-code>
// Response (200)
{ "data": { "id": "...", "subject": "...", "participants": [...], "ideas": [...] } }

// POST — Create session
{
  "subject": "remote work tools",
  "hostUserId": "user-123",
  "hostDisplayName": "Alice"
}

// POST — Session actions
{
  "action": "join" | "submit_idea" | "vote" | "comment" | "start" | "complete" | "assign_angles" | "merge",
  ...
}
```

---

### `POST /api/refine`

Conversational refinement of innovation ideas.

```json
// Start a refinement session
{
  "action": "start",
  "subject": "remote work tools",
  "selectedIdeas": ["idea-1", "idea-2"],
  "model": "gpt-4.1"
}
// Response (200)
{ "sessionId": "uuid", "subject": "remote work tools" }

// Send follow-up refinement
{
  "action": "refine",
  "sessionId": "uuid",
  "message": "Focus on enterprise use cases"
}
```

---

### `POST /api/validate`

Validate innovation ideas with structured scoring.

```json
// Request
{
  "ideas": [{ "title": "...", "description": "..." }],
  "domain": "enterprise SaaS",
  "model": "gpt-4.1"
}

// Response (200) — ValidationScorecard
{ ... }
```

**Constraints:** 1–50 ideas, domain max 200 chars.

---

### `GET /api/share` · `POST /api/share` · `GET /api/share/[slug]` · `POST /api/share/[slug]`

Share and fork innovation sessions via shareable links.

```json
// POST /api/share — Create shareable link
{
  "subject": "remote work tools",
  "investigation": { ... },
  "angleResults": [...],
  "synthesis": { ... },
  "title": "My Session",
  "isPublic": true,
  "expiresInDays": 30
}
// Response (200)
{ "shareUrl": "https://...", ... }

// GET /api/share — List all shared investigations
// Response (200)
{ "investigations": [...] }

// GET /api/share/[slug] — Retrieve by slug
// Response (200)
{ "subject": "...", "investigation": { ... }, ... }

// POST /api/share/[slug] — Fork investigation
// Response (201)
{ "newSessionId": "..." }
```

---

### `GET /api/analytics` · `POST /api/analytics`

Innovation analytics and event tracking.

```json
// GET — Analytics summary
// Response (200)
{ "summary": { ... }, "insights": [...] }

// POST — Track event
{ "type": "idea_generated", "data": { "angleId": "scamper" } }
// Response (200)
{ "event": { ... } }
```

---

### `GET /api/angles` · `POST /api/angles` · `DELETE /api/angles`

Manage built-in and custom innovation angles.

Only `GET /api/angles` is available in production. `POST` and `DELETE` are development/experimental and return `404`.

```json
// GET — List all angles
// Response (200)
{ "angles": [{ "id": "scamper", "name": "SCAMPER", "type": "built-in", ... }] }

// POST — Create custom angle
{
  "id": "my-angle",
  "name": "My Angle",
  "description": "Custom framework",
  "promptTemplate": "Analyze {{subject}}...",
  "icon": "🔧",
  "author": "user",
  "tags": ["custom"]
}
// Response (201)
{ "success": true, "angle": { ... } }

// DELETE ?id=my-angle — Remove custom angle
// Response (200)
{ "success": true }
```

---

### `GET /api/presets`

Retrieve innovation presets (pre-configured angle sets and configurations).

```json
// GET — List all presets
// Query: ?category=<category> or ?id=<preset-id>
// Response (200)
{ "data": [...] }
```

---

### `POST /api/export`

Export innovation results in various formats.

```json
// Request
{
  "format": "markdown" | "json" | "clipboard" | "github-issue",
  "data": {
    "subject": "remote work tools",
    "investigation": { ... },
    "angleResults": [...],
    "synthesis": { ... },
    "metadata": { ... }
  }
}
// Response (200)
{ "data": "..." }
```

---

### `GET /api/observatory`

Query the prompt observatory for LLM call statistics, timeline, and diffs.

```json
// GET ?action=stats — Aggregated statistics
// Response (200)
{ "totalCalls": 42, "byModel": { ... }, "byStage": { ... }, "qualityDistribution": { ... } }

// GET ?action=timeline&limit=20&stage=investigate&model=gpt-4.1 — Call timeline
// Response (200)
{ "calls": [{ "id": "...", "prompt": "...", "tokens": { ... }, "latencyMs": 1200, ... }] }

// GET ?action=diff&a=<call-id>&b=<call-id> — Compare two LLM calls
// Response (200)
{ "added": [...], "removed": [...], "unchanged": [...], "tokenDelta": { ... } }
```

---

### `GET /api/history` · `POST /api/history` · `DELETE /api/history` · `PATCH /api/history`

Session history management with search, tags, and pagination.

```json
// GET — Query sessions
// Query: ?search=<text>&tags=<csv>&angle=<id>&from=<date>&to=<date>&page=1&limit=20
// Response (200)
{ "data": [...], "total": 42 }

// POST — Save session
{
  "subject": "remote work tools",
  "investigation": { ... },
  "angleResults": [...],
  "synthesis": { ... },
  "tags": ["enterprise"],
  "notes": "Initial exploration"
}
// Response (201)
{ "data": { "id": "..." } }

// DELETE ?id=<session-id> — Remove session
// PATCH — Update session tags/notes
{ "id": "...", "tags": ["updated"], "notes": "Refined" }
```

---

### `POST /api/pipeline`

Run a natural-language-described pipeline. Returns an SSE stream.

```json
// Request
{ "description": "Investigate AI in healthcare, focus on diagnostics", "model": "gpt-4.1" }

// Response — Server-Sent Events stream
data: {"type":"config","config":{...}}
data: {"stage":"investigating",...}
data: {"stage":"complete",...}
```

The server sends `: keepalive` comments every 15 seconds.

---

### `GET /api/tracker`

Get the innovation tracker dashboard.

```json
// Response (200)
{ "dashboard": { ... }, "recentIdeas": [...] }
```

Returns up to 20 recent ideas.

---

### `GET /api/widget`

Serves the `<innovator-widget>` embeddable web component as JavaScript.

- **Content-Type:** `application/javascript`
- **Cache-Control:** `public, max-age=3600`
- **CORS:** `Access-Control-Allow-Origin: *`

Usage:

```html
<script src="https://your-domain.com/api/widget"></script>
<innovator-widget></innovator-widget>
```

---

### `POST /api/embed`

Embeddable API for running innovation pipelines from external sites.

```json
// Request
{
  "subject": "remote work tools",
  "angles": ["scamper", "first-principles"],
  "model": "gpt-4.1"
}

// Response (200)
{
  "subject": "...",
  "investigation": { ... },
  "angleResults": [...],
  "synthesis": { ... }
}
```

**Authentication:** Optional `X-Embed-Key` header (validated against `INNOVATOR_EMBED_API_KEY` env var).
**CORS:** Configurable via `INNOVATOR_EMBED_ORIGINS` env var.

---

## V1 Authenticated API

The `/api/v1/*` endpoints provide programmatic access with API key authentication. All requests require an `X-API-Key` header.

See the [V1 API Guide](/docs/guides/v1-api) for setup and usage details.

### `POST /api/v1/investigate`

Authenticated investigation endpoint.

```json
// Request (X-API-Key required)
{ "subject": "remote work tools", "model": "gpt-4.1" }

// Response (200)
{ "data": { "summary": "...", "keyAspects": [...], ... } }
```

**Rate limit:** 30 req/min.

### `POST /api/v1/innovate`

Authenticated innovation generation.

```json
// Request (X-API-Key required)
{ "subject": "remote work tools", "angles": ["scamper", "first-principles"], "model": "gpt-4.1" }

// Response (200)
{ "data": { "investigation": { ... }, "angleResults": [...] } }
```

**Rate limit:** 20 req/min.

### `POST /api/v1/auto`

Authenticated full pipeline with optional streaming.

```json
// Request (X-API-Key required)
{ "subject": "remote work tools", "model": "gpt-4.1", "stream": true }

// Response (stream: true) — SSE stream of PipelineProgress events
// Response (stream: false)
{ "data": { ... } }
```

**Rate limit:** 10 req/min.

### Dynamic V1 Keys and Plugins

`/api/v1/keys` and `/api/v1/plugins` are development/experimental and return `404` in production. Production keys are configured statically through `INNOVATOR_API_KEYS`.

### `GET /api/v1/openapi`

Returns the OpenAPI specification for the V1 API as JSON. This route requires API-key authentication in production.

---

## Request Validation Schemas

All API routes validate request bodies with [Zod](https://zod.dev/). These schemas are the source of truth for what each endpoint accepts. Requests that fail validation return a `400` error (see [Error Responses](#error-responses)).

### `POST /api/investigate`

| Field     | Type     | Required | Constraints    |
| --------- | -------- | -------- | -------------- |
| `subject` | `string` | Yes      | 1–500 chars    |
| `model`   | `string` | No       | Valid model ID |

### `POST /api/innovate`

| Field           | Type       | Required | Constraints                        |
| --------------- | ---------- | -------- | ---------------------------------- |
| `subject`       | `string`   | Yes      | 1–500 chars                        |
| `investigation` | `object`   | Yes      | Must match `InvestigationSchema`   |
| `angles`        | `string[]` | Yes      | 1–8 values from built-in angle IDs |
| `model`         | `string`   | No       | Valid model ID                     |
| `synthesize`    | `boolean`  | No       | Whether to generate synthesis      |
| `score`         | `boolean`  | No       | Whether to score ideas             |

### `POST /api/auto`

| Field     | Type     | Required | Constraints    |
| --------- | -------- | -------- | -------------- |
| `subject` | `string` | Yes      | 1–500 chars    |
| `model`   | `string` | No       | Valid model ID |

### `POST /api/pipeline`

| Field         | Type     | Required | Constraints    |
| ------------- | -------- | -------- | -------------- |
| `description` | `string` | Yes      | 1–5,000 chars  |
| `model`       | `string` | No       | Valid model ID |

### `POST /api/artifacts`

| Field           | Type     | Required | Constraints                                                   |
| --------------- | -------- | -------- | ------------------------------------------------------------- |
| `idea`          | `object` | Yes      | `{ title, description, potentialImpact, implementationHint }` |
| `artifactType`  | `string` | Yes      | `prd`, `user-story`, `tech-spec`, `pitch-outline`, `okr`      |
| `subject`       | `string` | Yes      | 1–500 chars                                                   |
| `investigation` | `object` | No       | `InvestigationSchema`                                         |
| `model`         | `string` | No       | Valid model ID                                                |

### `POST /api/validate`

| Field    | Type       | Required | Constraints                                   |
| -------- | ---------- | -------- | --------------------------------------------- |
| `ideas`  | `object[]` | Yes      | 1–50 items, each with `title` + `description` |
| `domain` | `string`   | Yes      | 1–200 chars                                   |
| `model`  | `string`   | No       | Valid model ID                                |

### `POST /api/embed`

| Field     | Type       | Required | Constraints         |
| --------- | ---------- | -------- | ------------------- |
| `subject` | `string`   | Yes      | 1–500 chars         |
| `angles`  | `string[]` | No       | 1–4 valid angle IDs |
| `model`   | `string`   | No       | Valid model ID      |

### `POST /api/export`

| Field    | Type     | Required | Constraints                                                                                                    |
| -------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| `format` | `string` | Yes      | `markdown`, `json`, `clipboard`, `github-issue`, `powerpoint`, `jira`, `confluence`, `notion`, `google-slides` |
| `data`   | `object` | Yes      | `{ subject, investigation?, angleResults[], synthesis?, metadata? }`                                           |
| `config` | `object` | No       | Format-specific options                                                                                        |

### `POST /api/share`

| Field           | Type      | Required | Constraints        |
| --------------- | --------- | -------- | ------------------ |
| `subject`       | `string`  | Yes      | 1–500 chars        |
| `investigation` | `object`  | No       | Investigation data |
| `angleResults`  | `array`   | No       | Angle results      |
| `synthesis`     | `object`  | No       | Synthesis data     |
| `title`         | `string`  | No       | Max 500 chars      |
| `isPublic`      | `boolean` | No       | Default: `true`    |
| `expiresInDays` | `number`  | No       | 1–365              |

### `POST /api/angles`

Development/experimental only; returns `404` in production.

| Field            | Type       | Required | Constraints                                 |
| ---------------- | ---------- | -------- | ------------------------------------------- |
| `id`             | `string`   | Yes      | 1–100 chars, lowercase `[a-z0-9-]`          |
| `name`           | `string`   | Yes      | 1–200 chars                                 |
| `description`    | `string`   | Yes      | 1–2,000 chars                               |
| `promptTemplate` | `string`   | Yes      | 1–10,000 chars (must include `{{subject}}`) |
| `icon`           | `string`   | No       | Max 10 chars (emoji)                        |
| `author`         | `string`   | No       | Max 200 chars                               |
| `tags`           | `string[]` | No       | Max 20 items, each max 100 chars            |

---

## Error Responses

All API routes return structured JSON error responses. The response body always contains an `error` string field.

### Validation Error (400)

Returned when the request body fails Zod schema validation.

```json
{ "error": "Invalid request. Please check your input and try again." }
```

The server logs the full Zod validation details (via `parsed.error.flatten()`) but only returns the generic message to clients to avoid leaking internal schema details.

### Invalid JSON (400)

Returned when the request body is not valid JSON.

```json
{ "error": "Invalid JSON body" }
```

### Unknown Model (400)

Returned when the `model` field specifies an unrecognized model ID.

```json
{ "error": "Unknown model. Allowed models: gpt-4.1, gpt-4o-mini, claude-3-5-sonnet, ..." }
```

### Invalid Content-Type (415)

Returned when a `POST` request is missing the `Content-Type: application/json` header.

```json
{ "error": "Content-Type must be application/json" }
```

### Server Error (500)

Returned when an unexpected error occurs during processing. The message varies by route.

```json
{ "error": "Investigation failed. Please try again." }
```

Route-specific messages:

| Route              | Error message                                       |
| ------------------ | --------------------------------------------------- |
| `/api/investigate` | `"Investigation failed. Please try again."`         |
| `/api/innovate`    | `"Innovation generation failed. Please try again."` |
| `/api/auto`        | `"Auto mode failed. Please try again."`             |
| `/api/artifacts`   | `"Artifact generation failed. Please try again."`   |
| `/api/validate`    | `"Validation failed. Please try again."`            |

---

## Rate Limiting

Supported production API routes are protected by proxy-level rate limiting (see `apps/web/src/proxy.ts`). Limits are enforced per client IP using an in-memory store.

### Limits

| Constraint            | Value      | Scope         |
| --------------------- | ---------- | ------------- |
| Global rate limit     | 10 req/min | All `/api/*`  |
| `/api/innovate` limit | 5 req/min  | Per IP        |
| `/api/auto` limit     | 3 req/min  | Per IP        |
| Copilot concurrency   | 2 active   | Per process   |
| Copilot wait queue    | 16 calls   | Per process   |
| Max JSON body size    | 100 KB     | Streamed body |

### 429 Response

When a rate limit is exceeded, the API returns HTTP 429 with a JSON body and `Retry-After` header:

```json
{ "error": "Too many requests. Please try again later." }
```

Route-specific messages:

- **`/api/innovate`**: `"Too many innovate requests. Please try again later."`
- **`/api/auto`**: `"Too many auto requests. Please try again later."`

### Body Size Enforcement

Supported JSON endpoints measure the actual streamed request body and reject payloads over 100 KB:

```json
{ "error": "Request body too large" }
```

Chunked requests are supported. Copilot work is bounded separately by the process-wide concurrency and queue settings.

:::caution Production replica count
The rate limiter and related runtime state are process-local. The production profile supports exactly one replica; Vercel/serverless and horizontal scaling are unsupported.
:::
