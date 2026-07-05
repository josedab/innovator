---
id: custom-models
title: Custom Models
sidebar_position: 4
---

# Custom Models

Innovator supports any model available through your GitHub Copilot subscription, plus direct access to OpenAI, Anthropic, and local Ollama models. You can switch models at runtime without changing any configuration.

:::caution Production provider
The first production profile requires the GitHub Copilot provider and a non-empty `GH_TOKEN`. Direct OpenAI, Anthropic, and Ollama providers are development/experimental options.
:::

## Default Model

The default model is configured via the `INNOVATOR_DEFAULT_MODEL` environment variable:

```bash
# .env.local
INNOVATOR_DEFAULT_MODEL=gpt-4.1
```

If not set, it defaults to `gpt-4.1`.

## Available Models

### Via Copilot (default provider)

Models available depend on your Copilot subscription tier:

| Model             | ID                  | Strengths                                   |
| ----------------- | ------------------- | ------------------------------------------- |
| GPT-4.1           | `gpt-4.1`           | Default — good balance of speed and quality |
| GPT-4.1 Mini      | `gpt-4.1-mini`      | Fast and cost-effective for iteration       |
| GPT-5             | `gpt-5`             | Highest quality, best for synthesis         |
| GPT-5 Mini        | `gpt-5-mini`        | Good quality at lower cost                  |
| Claude Sonnet 4.5 | `claude-sonnet-4.5` | Anthropic model via Copilot                 |

### Via Direct Providers

When using alternative providers, each has its own model ecosystem:

| Provider  | Example Models                   | Env Variable        |
| --------- | -------------------------------- | ------------------- |
| OpenAI    | `gpt-4.1`, `gpt-5`               | `OPENAI_API_KEY`    |
| Anthropic | `claude-sonnet-4-20250514`       | `ANTHROPIC_API_KEY` |
| Ollama    | `llama3`, `codellama`, `mistral` | `OLLAMA_BASE_URL`   |

See the [Provider Setup guide](/docs/guides/provider-setup) for configuration details.

## Specifying Models at Runtime

### CLI

Use the `--model` flag on any command:

```bash
npx tsx apps/cli/src/index.ts auto "quantum computing" --model gpt-5
npx tsx apps/cli/src/index.ts investigate "home automation" --model gpt-4.1-mini
```

### API

Pass the `model` field in your request body:

```bash
curl -X POST http://localhost:3000/api/investigate \
  -H "Content-Type: application/json" \
  -d '{"subject": "quantum computing", "model": "claude-sonnet-4.5"}'
```

### Programmatic

When using the core package directly:

```typescript
import { investigate, generateForAngle } from "@innovator/core";

const result = await investigate("quantum computing", "gpt-5");
```

## Model Routing

For advanced use, assign different models to different pipeline stages. This lets you optimize for cost and quality simultaneously:

```typescript
import { runAutoPipeline } from "@innovator/core";

const result = await runAutoPipeline(
  "renewable energy",
  (progress) => console.log(progress.stage),
  undefined, // no default model
  undefined, // all angles
  undefined, // no abort signal
  {
    investigation: "gpt-5", // premium for thorough investigation
    generation: "gpt-4.1-mini", // cost-effective for bulk idea generation
    synthesis: "gpt-5", // premium for final synthesis
  }
);
```

This strategy can reduce costs by 40–60% while maintaining synthesis quality.

## Extra Models

To use models not in the built-in allowlist, add them via the `INNOVATOR_EXTRA_MODELS` environment variable:

```bash
INNOVATOR_EXTRA_MODELS=o1-preview,o1-mini,custom-fine-tuned-model
```

Unknown models produce a warning in logs but are not blocked — this is intentional to support new models as they become available.

## Model Selection Tips

| Scenario               | Recommended Model   | Why                                              |
| ---------------------- | ------------------- | ------------------------------------------------ |
| Quick exploration      | `gpt-4.1-mini`      | Fast iteration, low cost                         |
| Standard analysis      | `gpt-4.1`           | Good balance of quality and speed                |
| Deep investigation     | `gpt-5`             | Highest quality for complex subjects             |
| Different perspectives | Try multiple models | Each model has different creative tendencies     |
| Cost-sensitive         | Model routing       | Use premium only for investigation and synthesis |
| Offline / air-gapped   | Ollama (`llama3`)   | No internet required                             |

## Related

- [Provider Setup](/docs/guides/provider-setup) — configure OpenAI, Anthropic, and Ollama
- [Cost Tracking](/docs/guides/cost-tracking) — monitor and control model costs
- [Configuration Reference](/docs/configuration) — all environment variables
