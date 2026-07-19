/**
 * @description Auto mode panel that streams full pipeline progress (investigate → generate → synthesize) via SSE.
 */
"use client";

import { useState } from "react";
import type { AngleResult, Synthesis } from "@innovator/core/types";
import { useAutoModePipeline } from "@/lib/hooks/useAutoModePipeline";

/** Props for the {@link AutoModePanel} component. */
interface AutoModePanelProps {
  subject: string;
  onComplete: (results: AngleResult[], synthesis: Synthesis | null) => void;
  onReset: () => void;
}

/**
 * Auto mode panel that streams the full innovation pipeline via SSE.
 *
 * Connects to `/api/auto`, displays a progress bar with stage labels,
 * and lists completed angles in real time. Calls `onComplete` when the
 * pipeline finishes successfully. Supports "stop and keep" to abort
 * the pipeline and retain partial results.
 *
 * @param props.subject - The subject to run the pipeline on
 * @param props.onComplete - Called with angle results and optional synthesis on success
 * @param props.onReset - Called when the user clicks "Start over" after an error
 */
export function AutoModePanel({ subject, onComplete, onReset }: AutoModePanelProps) {
  const [showCompleted, setShowCompleted] = useState(true);
  const { progress, partialContent, handleStopAndKeep } = useAutoModePipeline({
    subject,
    onComplete,
  });

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
        <div className="flex gap-3">
          {progress.stage !== "complete" &&
            progress.stage !== "error" &&
            progress.angleResults.length > 0 && (
              <button
                onClick={handleStopAndKeep}
                className="text-sm px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 rounded-lg hover:bg-amber-200 dark:hover:bg-amber-900/50 transition"
              >
                ⏹ Stop & Keep Results
              </button>
            )}
          {progress.stage === "error" && (
            <button
              onClick={onReset}
              className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
            >
              Start over
            </button>
          )}
        </div>
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

        {partialContent && progress.stage === "generating" && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
            <p className="text-xs text-blue-500 mb-1 font-medium">
              {progress.partialIdea ? `💭 ${progress.partialIdea.angleName}` : "Generating..."}
            </p>
            <p className="text-neutral-700 dark:text-neutral-300 animate-pulse">{partialContent}</p>
          </div>
        )}

        {progress.stoppedEarly && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-amber-800 dark:text-amber-300 text-sm">
            Pipeline stopped early. Showing {progress.angleResults.length} completed angle(s).
          </div>
        )}
      </div>
    </div>
  );
}
