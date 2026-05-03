---
id: custom-models
title: Custom Models
sidebar_position: 4
---

# Custom Models

Innovator supports any model available through your GitHub Copilot subscription. You can switch models at runtime without changing any configuration.

## Default model

The default model is configured via the `INNOVATOR_DEFAULT_MODEL` environment variable:

```bash
# .env.local
INNOVATOR_DEFAULT_MODEL=gpt-4.1
```

If not set, it defaults to `gpt-4.1`.

## Available models

Models available depend on your Copilot subscription tier:

| Model             | ID                  | Notes                                      |
| ----------------- | ------------------- | ------------------------------------------ |
| GPT-4.1           | `gpt-4.1`           | Default, good balance of speed and quality |
| GPT-5             | `gpt-5`             | Highest quality, slower                    |
| Claude Sonnet 4.5 | `claude-sonnet-4.5` | Anthropic model via Copilot                |

## Specifying models at runtime

### CLI

Use the `--model` flag on any command:

```bash
npx tsx apps/cli/src/index.ts auto "quantum computing" --model gpt-5
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

## Model selection tips

- **Quick exploration**: Use `gpt-4.1` for fast iteration
- **Final deep analysis**: Use `gpt-5` for the highest-quality synthesis
- **Different perspectives**: Try different models on the same subject — they have different creative tendencies

## Related

- [Configuration Reference](/docs/configuration) — full list of environment variables including `INNOVATOR_API_KEY` and `INNOVATOR_LLM_TIMEOUT_MS`
