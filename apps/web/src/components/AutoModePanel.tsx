"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  AngleResult,
  Synthesis,
  PipelineProgress,
  PipelineStage,
} from "@innovator/core/types";

interface AutoModePanelProps {
  subject: string;
  onComplete: (results: AngleResult[], synthesis: Synthesis | null) => void;
  onReset: () => void;
}

const VALID_STAGES: readonly PipelineStage[] = [
  "investigating",
  "generating",
  "synthesizing",
  "complete",
  "error",
];

function isValidPipelineProgress(data: unknown): data is PipelineProgress {
  if (typeof data !== "object" || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.stage === "string" &&
    (VALID_STAGES as readonly string[]).includes(d.stage) &&
    Array.isArray(d.completedAngles) &&
    typeof d.totalAngles === "number" &&
    Array.isArray(d.angleResults)
  );
}

const SSE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Auto mode panel that streams the full innovation pipeline via SSE.
 *
 * Connects to `/api/auto`, displays a progress bar with stage labels,
 * and lists completed angles in real time. Calls `onComplete` when the
 * pipeline finishes successfully.
 *
 * @param props.subject - The subject to run the pipeline on
 * @param props.onComplete - Called with angle results and optional synthesis on success
 * @param props.onReset - Called when the user clicks "Start over" after an error
 */
export function AutoModePanel({ subject, onComplete, onReset }: AutoModePanelProps) {
  const [progress, setProgress] = useState<PipelineProgress>({
    stage: "investigating",
    completedAngles: [],
    totalAngles: 8,
    angleResults: [],
  });
  const [started, setStarted] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);

  const runPipeline = useCallback(
    async (signal: AbortSignal) => {
      try {
        const res = await fetch("/api/auto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject }),
          signal,
        });

        if (!res.ok) {
          const text = await res.text().then((t) => t.slice(0, 1000));
          setProgress((prev) => ({
            ...prev,
            stage: "error",
            error: text || "Auto mode failed",
          }));
          return;
        }

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          setProgress((prev) => ({
            ...prev,
            stage: "error",
            error: "No response stream",
          }));
          return;
        }

        let buffer = "";
        let receivedComplete = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const parsed = JSON.parse(line.slice(6));
                if (!isValidPipelineProgress(parsed)) {
                  continue; // skip invalid SSE data
                }
                const data: PipelineProgress = parsed;
                setProgress(data);

                if (data.stage === "complete") {
                  receivedComplete = true;
                  onComplete(data.angleResults, data.synthesis ?? null);
                  return;
                }
                if (data.stage === "error") {
                  return;
                }
              } catch {
                // ignore parse errors in SSE stream
              }
            }
          }
        }

        // Stream ended without a complete/error event
        if (!receivedComplete) {
          setProgress((prev) => ({
            ...prev,
            stage: "error",
            error: "Connection lost before pipeline completed. Please try again.",
          }));
        }
      } catch (err) {
        if (signal.aborted) return;
        setProgress((prev) => ({
          ...prev,
          stage: "error",
          error: err instanceof Error ? err.message : "Auto mode failed",
        }));
      }
    },
    [subject, onComplete]
  );

  useEffect(() => {
    if (!started) {
      setStarted(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timeout = setTimeout(() => controller.abort(), SSE_TIMEOUT_MS);
      runPipeline(controller.signal).finally(() => clearTimeout(timeout));

      return () => {
        clearTimeout(timeout);
        controller.abort();
      };
    }
  }, [started, runPipeline]);

  const stageLabels: Record<string, string> = {
    investigating: "🔍 Investigating subject...",
    generating: "⚡ Generating innovations...",
    synthesizing: "🧪 Synthesizing results...",
    complete: "✅ Complete!",
    error: "❌ Error",
  };

  const percent =
    progress.stage === "investigating"
      ? 10
      : progress.stage === "generating"
        ? 10 + (progress.completedAngles.length / progress.totalAngles) * 75
        : progress.stage === "synthesizing"
          ? 90
          : 100;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">🚀 Auto Mode</h2>
        {progress.stage === "error" && (
          <button
            onClick={onReset}
            className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
          >
            Start over
          </button>
        )}
      </div>

      <p className="text-neutral-600 dark:text-neutral-400 mb-6">
        Running full innovation pipeline for &quot;{subject}&quot;
      </p>

      <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-4">
        <div className="text-lg font-semibold">{stageLabels[progress.stage] || progress.stage}</div>

        <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className="text-sm text-neutral-500">
          {progress.stage === "generating" && progress.currentAngle && (
            <p>
              Current angle: <strong>{progress.currentAngle}</strong> •{" "}
              {progress.completedAngles.length}/{progress.totalAngles} complete
            </p>
          )}
          {progress.completedAngles.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                aria-expanded={showCompleted}
                className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition"
              >
                Completed angles {showCompleted ? "▼" : "▶"}
              </button>
              {showCompleted && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {progress.completedAngles.map((angle) => (
                    <span
                      key={angle}
                      className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-full"
                    >
                      ✓ {angle}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {progress.error && (
          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg text-red-800 dark:text-red-200 text-sm">
            {progress.error}
          </div>
        )}
      </div>
    </div>
  );
}
