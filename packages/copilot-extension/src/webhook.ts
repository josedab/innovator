/**
 * @module copilot-extension/webhook
 *
 * Webhook handler for Copilot Extension chat events.
 * Parses incoming messages, routes to the appropriate core function,
 * and formats streaming responses for Copilot Chat rendering.
 */

import {
  parseSlashCommand,
  formatInvestigationForChat,
  formatAngleResultsForChat,
  formatSynthesisForChat,
  formatAnglesForChat,
  formatPresetsForChat,
  formatHelpForChat,
  investigate,
  generateForAngle,
  runAutoPipeline,
  type AngleId,
  ANGLE_IDS,
} from "@innovator/core";

// ---- Types ----

/** Incoming webhook payload from GitHub Copilot Chat. */
export interface WebhookPayload {
  /** Copilot chat message from the user. */
  messages: WebhookMessage[];
  /** GitHub user info. */
  copilot_user?: {
    login: string;
    id: number;
  };
  /** Thread/conversation context. */
  copilot_thread_id?: string;
  /** Reference context (selected code, file, etc.). */
  copilot_references?: CopilotReference[];
}

/** A single message in a Copilot Chat conversation. */
export interface WebhookMessage {
  /** Role of the message sender. */
  role: "user" | "assistant" | "system";
  /** Text content of the message. */
  content: string;
}

/** A reference attached to a Copilot Chat message (e.g. selected code, file). */
export interface CopilotReference {
  /** Reference type identifier (e.g. "file", "selection"). */
  type: string;
  /** Unique reference identifier. */
  id: string;
  /** Optional reference data payload. */
  data?: unknown;
}

/** Response produced by the webhook handler, containing SSE-formatted chunks. */
export interface WebhookResponse {
  /** SSE-formatted response stream chunks. */
  chunks: string[];
  /** Final status. */
  status: "success" | "error";
  /** Error message if status is "error". */
  error?: string;
}

// ---- Handler ----

/**
 * Handle an incoming Copilot Extension webhook request.
 * Parses the user message, routes to the appropriate command,
 * and returns formatted response chunks for SSE streaming.
 */
export async function handleWebhook(
  payload: WebhookPayload,
  options?: { model?: string; signal?: AbortSignal }
): Promise<WebhookResponse> {
  const chunks: string[] = [];
  const userMessage = payload.messages.filter((m) => m.role === "user").pop();

  if (!userMessage) {
    return { chunks: [formatSSEChunk(formatHelpForChat().markdown)], status: "success" };
  }

  const parsed = parseSlashCommand(userMessage.content);
  const command = parsed?.command ?? "help";
  const args = parsed?.args ?? userMessage.content;

  try {
    switch (command) {
      case "investigate": {
        if (!args.trim()) {
          chunks.push(
            formatSSEChunk(
              "Please provide a subject to investigate.\n\nExample: `@innovator investigate solar energy`"
            )
          );
          break;
        }
        chunks.push(formatSSEChunk("🔍 **Investigating…**\n\n"));
        const investigation = await investigate(args.trim(), options?.model, options?.signal);
        chunks.push(formatSSEChunk(formatInvestigationForChat(investigation).markdown));
        break;
      }

      case "innovate": {
        if (!args.trim()) {
          chunks.push(
            formatSSEChunk(
              "Please provide a subject.\n\nExample: `@innovator innovate solar energy --angles scamper,first-principles`"
            )
          );
          break;
        }
        const { subject, angleIds } = parseInnovateArgs(args);
        chunks.push(formatSSEChunk(`💡 **Generating innovations for:** ${subject}\n\n`));
        const investigation = await investigate(subject, options?.model, options?.signal);
        const results = [];
        for (const angleId of angleIds) {
          const result = await generateForAngle(
            subject,
            investigation,
            angleId,
            options?.model,
            options?.signal
          );
          results.push(result);
        }
        chunks.push(formatSSEChunk(formatAngleResultsForChat(results).markdown));
        break;
      }

      case "auto": {
        if (!args.trim()) {
          chunks.push(
            formatSSEChunk(
              "Please provide a subject.\n\nExample: `@innovator auto renewable energy storage`"
            )
          );
          break;
        }
        chunks.push(formatSSEChunk(`🚀 **Running full auto pipeline for:** ${args.trim()}\n\n`));
        let lastProgress = "";
        await runAutoPipeline(
          args.trim(),
          (progress) => {
            const update = `**Stage:** ${progress.stage} | **Completed:** ${progress.completedAngles.length}/${progress.totalAngles}\n`;
            if (update !== lastProgress) {
              chunks.push(formatSSEChunk(update));
              lastProgress = update;
            }
            if (progress.synthesis) {
              chunks.push(formatSSEChunk(formatSynthesisForChat(progress.synthesis).markdown));
            }
          },
          options?.model,
          undefined,
          options?.signal
        );
        break;
      }

      case "angles": {
        chunks.push(formatSSEChunk(formatAnglesForChat().markdown));
        break;
      }

      case "presets": {
        chunks.push(formatSSEChunk(formatPresetsForChat().markdown));
        break;
      }

      case "help":
      default: {
        chunks.push(formatSSEChunk(formatHelpForChat().markdown));
        break;
      }
    }

    return { chunks, status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    chunks.push(formatSSEChunk(`\n\n❌ **Error:** ${message}`));
    return { chunks, status: "error", error: message };
  }
}

// ---- Helpers ----

function formatSSEChunk(content: string): string {
  const data = JSON.stringify({
    choices: [{ delta: { content }, index: 0 }],
  });
  return `data: ${data}\n\n`;
}

function parseInnovateArgs(args: string): { subject: string; angleIds: AngleId[] } {
  const anglesMatch = args.match(/--angles?\s+([^\s]+)/i);
  const subject = args.replace(/--angles?\s+[^\s]+/i, "").trim();

  let angleIds: AngleId[];
  if (anglesMatch) {
    angleIds = anglesMatch[1]
      .split(",")
      .map((a) => a.trim() as AngleId)
      .filter((a) => ANGLE_IDS.includes(a));
  } else {
    angleIds = ["scamper", "first-principles"];
  }

  return { subject, angleIds };
}
