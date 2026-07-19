import type { PipelineProgress, PipelineStage } from "@innovator/core/types";

const VALID_STAGES: readonly PipelineStage[] = [
  "investigating",
  "generating",
  "synthesizing",
  "complete",
  "error",
];

export function isValidPipelineProgress(data: unknown): data is PipelineProgress {
  if (typeof data !== "object" || data === null) return false;
  const progress = data as Record<string, unknown>;
  return (
    typeof progress.stage === "string" &&
    (VALID_STAGES as readonly string[]).includes(progress.stage) &&
    Array.isArray(progress.completedAngles) &&
    typeof progress.totalAngles === "number" &&
    Array.isArray(progress.angleResults)
  );
}

export interface PipelineProgressParser {
  push(chunk: Uint8Array): PipelineProgress[];
}

export function createPipelineProgressParser(): PipelineProgressParser {
  const decoder = new TextDecoder();
  let buffer = "";

  return {
    push(chunk) {
      buffer += decoder.decode(chunk, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";

      const events: PipelineProgress[] = [];
      for (const frame of frames) {
        if (!frame.startsWith("data: ")) continue;

        try {
          const parsed: unknown = JSON.parse(frame.slice(6));
          if (isValidPipelineProgress(parsed)) {
            events.push(parsed);
          }
        } catch {
          // Ignore malformed stream frames.
        }
      }
      return events;
    },
  };
}
