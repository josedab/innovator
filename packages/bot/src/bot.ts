import { runAutoPipeline } from "@innovator/core";
import type { PipelineProgress } from "@innovator/core";
import type { BotConfig, BotPlatform, BotResponse } from "./types.js";

/**
 * Innovation bot that handles /innovate commands on any supported platform.
 */
export class InnovatorBot {
  private platform: BotPlatform;
  private defaultModel?: string;

  constructor(config: BotConfig) {
    this.platform = config.platform;
    this.defaultModel = config.defaultModel;
  }

  /** Start the bot and register command handlers. */
  async start(): Promise<void> {
    this.platform.onCommand("innovate", async (message) => {
      const subject = message.text.trim();
      if (!subject) {
        await this.platform.sendMessage(message.channelId, {
          text: "Please provide a subject. Usage: `/innovate <subject>`",
          threadId: message.threadId,
        });
        return;
      }

      if (subject.length > 500) {
        await this.platform.sendMessage(message.channelId, {
          text: "Subject is too long (max 500 characters).",
          threadId: message.threadId,
        });
        return;
      }

      await this.platform.sendMessage(message.channelId, {
        text: `🔍 Starting innovation pipeline for: *${subject}*`,
        threadId: message.threadId,
      });

      try {
        let lastStage = "";

        const result = await runAutoPipeline(
          subject,
          (progress) => {
            if (progress.stage !== lastStage) {
              lastStage = progress.stage;
              const stageEmoji = getStageEmoji(progress.stage);
              this.platform
                .sendUpdate(message.channelId, {
                  text: `${stageEmoji} ${formatStage(progress)}`,
                  threadId: message.threadId,
                })
                .catch(() => {});
            }
          },
          this.defaultModel
        );

        if (result.stage === "error") {
          await this.platform.sendMessage(message.channelId, {
            text: `❌ Pipeline failed: ${result.error ?? "Unknown error"}`,
            threadId: message.threadId,
          });
          return;
        }

        const summary = formatResults(subject, result);
        await this.platform.sendMessage(message.channelId, {
          text: summary,
          threadId: message.threadId,
          isFinal: true,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        await this.platform.sendMessage(message.channelId, {
          text: `❌ Error: ${errorMsg}`,
          threadId: message.threadId,
        });
      }
    });

    await this.platform.start();
  }

  /** Stop the bot. */
  async stop(): Promise<void> {
    await this.platform.stop();
  }
}

/**
 * Map a pipeline stage name to its corresponding emoji for chat display.
 *
 * @param stage - The pipeline stage identifier (e.g., "investigating", "generating").
 * @returns A single emoji character representing the stage.
 */
function getStageEmoji(stage: string): string {
  switch (stage) {
    case "investigating":
      return "🔬";
    case "generating":
      return "💡";
    case "synthesizing":
      return "🧬";
    case "complete":
      return "✅";
    case "error":
      return "❌";
    default:
      return "⏳";
  }
}

/**
 * Format a pipeline progress update into a human-readable status message.
 *
 * @param progress - The current pipeline progress snapshot.
 * @returns A short status string describing the current stage.
 */
function formatStage(progress: PipelineProgress): string {
  switch (progress.stage) {
    case "investigating":
      return "Investigating subject...";
    case "generating":
      return `Generating ideas (${progress.completedAngles.length}/${progress.totalAngles} angles)...`;
    case "synthesizing":
      return "Synthesizing results...";
    case "complete":
      return "Pipeline complete!";
    default:
      return `Stage: ${progress.stage}`;
  }
}

// Platform message length limits (conservative to account for formatting overhead)
const MAX_MESSAGE_LENGTH = 3500; // Slack: 4000, Discord: 2000, Teams: 28KB — use conservative limit

/**
 * Format completed pipeline results into a summary message for chat platforms.
 *
 * Includes the top 5 ideas, cross-cutting themes, and a strategic recommendation.
 * Output is truncated to {@link MAX_MESSAGE_LENGTH} to respect platform limits.
 *
 * @param subject - The original innovation subject.
 * @param result  - The completed pipeline progress containing synthesis and angle results.
 * @returns A formatted markdown-style summary string.
 */
function formatResults(subject: string, result: PipelineProgress): string {
  const lines: string[] = [`✅ *Innovation Results for: ${subject}*`, ""];

  if (result.synthesis) {
    lines.push("*🏆 Top Ideas:*");
    for (const idea of result.synthesis.topIdeas.slice(0, 5)) {
      lines.push(`• *${idea.title}* (${idea.sourceAngle}) — ${idea.feasibility} feasibility`);
      lines.push(
        `  ${idea.description.slice(0, 200)}${idea.description.length > 200 ? "..." : ""}`
      );
    }

    if (result.synthesis.themes.length > 0) {
      lines.push("");
      lines.push(`*🎯 Themes:* ${result.synthesis.themes.join(", ")}`);
    }

    lines.push("");
    lines.push(`*💡 Recommendation:* ${result.synthesis.recommendation.slice(0, 500)}`);
  }

  lines.push("");
  lines.push(
    `_${result.angleResults.length} angles processed, ${result.angleResults.reduce((sum, r) => sum + r.ideas.length, 0)} total ideas generated_`
  );

  const text = lines.join("\n");
  if (text.length > MAX_MESSAGE_LENGTH) {
    return text.slice(0, MAX_MESSAGE_LENGTH - 20) + "\n\n_[truncated]_";
  }
  return text;
}
