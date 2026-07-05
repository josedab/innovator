---
id: auto-mode
title: Auto Mode
sidebar_position: 3
---

# Auto Mode

Auto Mode runs the complete innovation pipeline without manual intervention. It investigates your subject, applies all 8 angles, and synthesizes a strategic report.

## How it works

```mermaid
sequenceDiagram
    participant User
    participant Pipeline
    participant CopilotSDK

    User->>Pipeline: subject
    Pipeline->>CopilotSDK: investigate(subject)
    CopilotSDK-->>Pipeline: Investigation
    Note over Pipeline: Stage: generating

    loop 8 angles (2 concurrent)
        Pipeline->>CopilotSDK: generateForAngle(angle)
        CopilotSDK-->>Pipeline: AngleResult
        Pipeline-->>User: progress update (SSE)
    end

    Note over Pipeline: Stage: synthesizing
    Pipeline->>CopilotSDK: synthesize(allResults)
    CopilotSDK-->>Pipeline: Synthesis
    Pipeline-->>User: complete
```

## Concurrency

Auto Mode runs **2 angles in parallel** to balance speed against LLM rate limits. Results are collected in the original angle order regardless of completion order.

This parallelism is controlled by the `MAX_CONCURRENCY` constant (exported from `@innovator/core/types`, default: `2`). Both the web API and CLI use this value to limit how many angles are processed simultaneously.

## Progress tracking

### Web App

The Auto Mode panel shows:

- Current pipeline stage with descriptive labels
- A progress bar (10% → 85% across angles → 90% for synthesis → 100%)
- The name of the angle currently being generated (via `currentAngle`)
- Green badges for completed angles
- Error messages with retry guidance

### Progress Event Fields

Each progress callback receives a `PipelineProgress` object. During the `generating` stage, the `currentAngle` field (`string | undefined`) indicates which angle is actively being generated. The web UI displays this to show real-time progress (e.g., "Generating: SCAMPER…"). The `failedAngles` field (`{ angleId: string; error: string }[] | undefined`) lists any angles that failed during generation — check this to detect partial failures.

### CLI

The CLI shows a spinner with real-time stage and count:

```
⠋ ⚡ Generating innovations... (5/8)
```

## Synthesis output

The synthesis step produces three outputs:

### Top Ideas (5-7)

Each idea is ranked with:

- **Feasibility**: low / medium / high
- **Source angle**: which framework generated it
- **Potential impact**: what difference it makes

### Cross-Cutting Themes (3-5)

Patterns that appeared across multiple angles — these are often the most valuable insights because they were independently validated.

### Strategic Recommendation

A single actionable paragraph summarizing where to focus first.

## Error handling

- If investigation fails, the pipeline stops immediately with a clear error
- If one angle fails, all in-flight angles are allowed to complete before the error is reported
- If synthesis fails, you still get the individual angle results
- In the web app, premature stream disconnection is detected and shown as a retry prompt

## Pipeline DAG

:::caution Production availability
`POST /api/pipeline-dag` is development/experimental and returns `404` in the first production profile. Use supported `POST /api/auto` or `POST /api/v1/auto` for production auto pipelines.
:::

The `/api/pipeline-dag` endpoint extends Auto Mode by compiling **natural language descriptions** into executable pipeline DAGs (directed acyclic graphs). Instead of running the fixed 8-angle pipeline, you describe a custom pipeline in plain English and the system builds and optionally executes it.

### Compiling a Pipeline

Send a `compile` action to convert a description into a DAG without executing it:

```bash
curl -X POST http://localhost:3000/api/pipeline-dag \
  -H "Content-Type: application/json" \
  -d '{
    "action": "compile",
    "description": "Investigate market trends then generate 5 ideas focused on mobile apps using SCAMPER and First Principles"
  }'
```

The response contains the DAG structure and a text visualization:

```json
{
  "dag": {
    "id": "dag-abc123",
    "name": "market trends",
    "nodes": [
      {
        "id": "investigate-0",
        "type": "investigate",
        "label": "Investigation",
        "dependsOn": [],
        "status": "pending"
      },
      {
        "id": "generate-scamper",
        "type": "generate",
        "label": "Generate: scamper",
        "dependsOn": ["investigate-0"],
        "status": "pending"
      },
      {
        "id": "generate-first-principles",
        "type": "generate",
        "label": "Generate: first-principles",
        "dependsOn": ["investigate-0"],
        "status": "pending"
      },
      {
        "id": "synthesize-0",
        "type": "synthesize",
        "label": "Synthesis",
        "dependsOn": ["generate-scamper", "generate-first-principles"],
        "status": "pending"
      }
    ],
    "status": "pending"
  },
  "visualization": "investigate-0 → [generate-scamper, generate-first-principles] → synthesize-0"
}
```

### Executing a Pipeline

Send an `execute` action to compile and run the pipeline in one step:

```bash
curl -X POST http://localhost:3000/api/pipeline-dag \
  -H "Content-Type: application/json" \
  -d '{
    "action": "execute",
    "description": "Investigate renewable energy then generate ideas with all angles and synthesize",
    "model": "gpt-4.1"
  }'
```

Nodes execute in dependency order — parallel branches (e.g., multiple `generate` nodes) run concurrently when their dependencies are satisfied. Each node tracks its status: `pending` → `running` → `completed` or `failed`.

### DAG Node Types

| Type          | Description                                      |
| ------------- | ------------------------------------------------ |
| `investigate` | Run subject investigation                        |
| `generate`    | Generate innovations for a specific angle        |
| `synthesize`  | Cross-reference and rank results from all angles |
| `score`       | Score and evaluate generated ideas               |
| `validate`    | Validate ideas against feasibility checks        |

### Core Functions

The pipeline DAG is powered by three functions from `@innovator/core`:

- **`compilePipelineDAG(description, model?)`** — Parse natural language into a DAG structure
- **`executePipelineDAG(dag, model?)`** — Execute a compiled DAG, running nodes in dependency order
- **`dagToText(dag)`** — Generate a text visualization of the DAG
