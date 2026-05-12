# @innovator/bot

Chat platform bot that brings Innovator's AI-powered innovation pipeline to Slack, Discord, and Microsoft Teams.

## Overview

The bot exposes a `/innovate` command that runs the full auto pipeline (investigate → generate → synthesize) and streams progress updates directly into your chat channel.

## Installation

```bash
npm install @innovator/bot
```

## Quick Start

```typescript
import { InnovatorBot, SlackAdapter } from "@innovator/bot";

const adapter = new SlackAdapter();
adapter.setSendFunction(/* your Slack Bolt send function */);

const bot = new InnovatorBot({
  platform: adapter,
  defaultModel: "gpt-4.1",
});

await bot.start();
```

## Adapters

Three platform adapters are included, all implementing the `BotPlatform` interface:

| Adapter          | Platform        | Handler Method           |
| ---------------- | --------------- | ------------------------ |
| `SlackAdapter`   | Slack           | `handleSlackCommand()`   |
| `DiscordAdapter` | Discord         | `handleDiscordCommand()` |
| `TeamsAdapter`   | Microsoft Teams | `handleTeamsCommand()`   |

### Slack

```typescript
import { InnovatorBot, SlackAdapter } from "@innovator/bot";
import { App } from "@slack/bolt";

const slackApp = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const adapter = new SlackAdapter();
adapter.setSendFunction(async (channel, text, threadTs) => {
  await slackApp.client.chat.postMessage({ channel, text, thread_ts: threadTs });
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
await slackApp.start(3000);
```

### Discord

```typescript
import { InnovatorBot, DiscordAdapter } from "@innovator/bot";
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const adapter = new DiscordAdapter();
adapter.setSendFunction(async (channelId, text, threadId) => {
  const channel = await client.channels.fetch(channelId);
  if (channel?.isTextBased()) await channel.send({ content: text });
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
await client.login(process.env.DISCORD_BOT_TOKEN);
```

### Microsoft Teams

```typescript
import { InnovatorBot, TeamsAdapter } from "@innovator/bot";

const adapter = new TeamsAdapter();
adapter.setSendFunction(async (conversationId, text, replyToId) => {
  // Use Bot Framework SDK to send activity
});

const bot = new InnovatorBot({ platform: adapter });
await bot.start();
```

## Configuration

The `InnovatorBot` constructor accepts a `BotConfig` object:

```typescript
interface BotConfig {
  platform: BotPlatform; // Required — adapter instance
  defaultModel?: string; // LLM model ID (default: provider default)
}
```

## Environment Variables

The bot package itself does not require environment variables — platform credentials are injected via the adapter's `setSendFunction()`. However, your platform SDK will need:

| Platform | Variable                 | Description            |
| -------- | ------------------------ | ---------------------- |
| Slack    | `SLACK_BOT_TOKEN`        | Bot OAuth token        |
| Slack    | `SLACK_SIGNING_SECRET`   | Request signing secret |
| Discord  | `DISCORD_BOT_TOKEN`      | Bot token              |
| Teams    | `MICROSOFT_APP_ID`       | Bot Framework app ID   |
| Teams    | `MICROSOFT_APP_PASSWORD` | Bot Framework password |

The underlying `@innovator/core` package uses its own provider env vars (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`).

## Types

```typescript
import type { BotPlatform, BotMessage, BotResponse, BotConfig } from "@innovator/bot";
```

| Type          | Description                                                                    |
| ------------- | ------------------------------------------------------------------------------ |
| `BotMessage`  | Incoming command with `text`, `channel`, `user`, `threadId`                    |
| `BotResponse` | Outgoing message with `text`, `threadId`, `isFinal`                            |
| `BotPlatform` | Interface: `start()`, `stop()`, `onCommand()`, `sendMessage()`, `sendUpdate()` |
| `BotConfig`   | Constructor config with `platform` and optional `defaultModel`                 |

## How It Works

1. User sends `/innovate <subject>` in chat
2. Bot calls `runAutoPipeline()` from `@innovator/core`
3. Progress updates are streamed to the channel:
   - 🔬 Investigating…
   - 💡 Generating ideas…
   - 🧬 Synthesizing…
   - ✅ Complete
4. Final message shows top 5 ideas, themes, and a strategic recommendation

## Message Format Examples

### Progress Update Messages

During pipeline execution, the bot sends incremental progress updates:

```
🔬 Investigating "sustainable packaging"...
```

```
💡 Generating ideas (3/8 angles complete)...
```

```
🧬 Synthesizing results across 8 angles...
```

### Final Result Message

The final message includes a structured summary:

```
✅ Innovation Complete: sustainable packaging

🏆 Top Ideas:
1. Mycelium-Based Packaging Composites
   Impact: Could replace 40% of polystyrene packaging
2. AI-Optimized Packaging Geometry
   Impact: Reduce material usage by 25% via generative design
3. Edible Protein-Based Wrapping
   Impact: Zero-waste food packaging for produce and snacks

🎯 Themes: Material science, Biomimicry, Waste reduction
📋 Recommendation: Focus on mycelium composites as the
   highest-feasibility near-term project.
```

### Error Messages

When errors occur, the bot sends a user-friendly message:

```
❌ Innovation failed: LLM request timed out.
   Try again or simplify your subject.
```

## Error Patterns

| Error                   | Cause                                  | Bot Behavior                                       |
| ----------------------- | -------------------------------------- | -------------------------------------------------- |
| LLM timeout             | Subject too complex or slow model      | Sends error message, suggests retrying             |
| Invalid subject (empty) | User sent `/innovate` with no text     | Replies with usage instructions                    |
| Copilot auth failure    | Missing GitHub auth or no subscription | Sends error with setup instructions                |
| Pipeline abort          | Internal error during generation       | Sends partial results if available, else error msg |
| Adapter send failure    | Platform API error (rate limit, etc.)  | Logs error, retries once, then fails silently      |

## Writing a Custom Adapter

To support a new chat platform, implement the `BotPlatform` interface:

```typescript
import type { BotPlatform, BotMessage, BotResponse } from "@innovator/bot";

class MyAdapter implements BotPlatform {
  private commandHandler?: (msg: BotMessage) => void;
  private sendFn?: (channel: string, text: string, threadId?: string) => Promise<void>;

  setSendFunction(fn: (channel: string, text: string, threadId?: string) => Promise<void>): void {
    this.sendFn = fn;
  }

  onCommand(handler: (msg: BotMessage) => void): void {
    this.commandHandler = handler;
  }

  async sendMessage(channel: string, text: string, threadId?: string): Promise<void> {
    await this.sendFn?.(channel, text, threadId);
  }

  async sendUpdate(channel: string, text: string, threadId?: string): Promise<void> {
    await this.sendMessage(channel, text, threadId);
  }

  async start(): Promise<void> {
    // Set up your platform's event listener and call
    // this.commandHandler?.({ text, channel, user, threadId })
    // when a /innovate command arrives.
  }

  async stop(): Promise<void> {
    // Clean up platform connections
  }
}
```

Key requirements:

- `setSendFunction()` is called before `start()` — store the function reference
- `onCommand()` registers a callback — invoke it when your platform receives a `/innovate` command
- `sendUpdate()` is called multiple times during pipeline execution for progress updates
- `sendMessage()` is called once with the final result
