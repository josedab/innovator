"use client";

import { useMemo } from "react";

interface IdeaScoreDisplay {
  ideaTitle: string;
  angleId: string;
  feasibility: number;
  impact: number;
  novelty: number;
  timeToImplement: "days" | "weeks" | "months" | "quarters" | "years";
  confidence: number;
  rationale: string;
}

interface PriorityMatrixProps {
  scores: IdeaScoreDisplay[];
}

const QUADRANT_LABELS = {
  "top-left": { label: "Strategic Bets", color: "text-yellow-600 dark:text-yellow-400" },
  "top-right": { label: "Quick Wins ⭐", color: "text-green-600 dark:text-green-400" },
  "bottom-left": { label: "Reconsider", color: "text-neutral-500" },
  "bottom-right": { label: "Low-Hanging Fruit", color: "text-cyan-600 dark:text-cyan-400" },
};

const ANGLE_COLORS: Record<string, string> = {
  scamper: "#3b82f6",
  "first-principles": "#ef4444",
  "cross-domain": "#22c55e",
  constraints: "#f59e0b",
  inversion: "#8b5cf6",
  perspectives: "#ec4899",
  "what-if": "#06b6d4",
  "trend-collision": "#f97316",
};

/**
 * 2x2 priority matrix plotting ideas by feasibility (x) vs impact (y).
 * Dot size reflects novelty score.
 */
export function PriorityMatrix({ scores }: PriorityMatrixProps) {
  const positionedScores = useMemo(
    () =>
      scores.map((s) => ({
        ...s,
        x: ((s.feasibility - 1) / 9) * 100,
        y: ((10 - s.impact) / 9) * 100,
        size: 8 + (s.novelty / 10) * 16,
      })),
    [scores]
  );

  if (scores.length === 0) {
    return <p className="text-sm text-neutral-500">No scores available.</p>;
  }

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-lg">📊 Priority Matrix</h4>
      <p className="text-xs text-neutral-500">
        X: Feasibility → | Y: Impact ↑ | Dot size: Novelty
      </p>

      <div className="relative w-full aspect-square max-w-[500px] border border-neutral-300 dark:border-neutral-600 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
        {/* Quadrant backgrounds */}
        <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
          <div className="bg-yellow-50/50 dark:bg-yellow-950/20 flex items-start justify-start p-2">
            <span className={`text-[10px] font-medium ${QUADRANT_LABELS["top-left"].color}`}>
              {QUADRANT_LABELS["top-left"].label}
            </span>
          </div>
          <div className="bg-green-50/50 dark:bg-green-950/20 flex items-start justify-end p-2">
            <span className={`text-[10px] font-medium ${QUADRANT_LABELS["top-right"].color}`}>
              {QUADRANT_LABELS["top-right"].label}
            </span>
          </div>
          <div className="bg-neutral-50/50 dark:bg-neutral-950/20 flex items-end justify-start p-2">
            <span className={`text-[10px] font-medium ${QUADRANT_LABELS["bottom-left"].color}`}>
              {QUADRANT_LABELS["bottom-left"].label}
            </span>
          </div>
          <div className="bg-cyan-50/50 dark:bg-cyan-950/20 flex items-end justify-end p-2">
            <span className={`text-[10px] font-medium ${QUADRANT_LABELS["bottom-right"].color}`}>
              {QUADRANT_LABELS["bottom-right"].label}
            </span>
          </div>
        </div>

        {/* Crosshairs */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-300 dark:bg-neutral-600" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-neutral-300 dark:bg-neutral-600" />

        {/* Dots */}
        {positionedScores.map((s, i) => (
          <div
            key={i}
            className="absolute group"
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              className="rounded-full opacity-80 hover:opacity-100 transition cursor-pointer border border-white dark:border-neutral-800"
              style={{
                width: `${s.size}px`,
                height: `${s.size}px`,
                backgroundColor: ANGLE_COLORS[s.angleId] ?? "#6b7280",
              }}
            />
            {/* Tooltip */}
            <div className="hidden group-hover:block absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2 bg-neutral-800 text-white text-xs rounded-lg shadow-lg">
              <p className="font-semibold">{s.ideaTitle}</p>
              <p className="mt-1 text-neutral-300">
                F:{s.feasibility} I:{s.impact} N:{s.novelty} T:{s.timeToImplement}
              </p>
              <p className="mt-1 text-neutral-400">{s.rationale}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(ANGLE_COLORS).map(([id, color]) => {
          if (!scores.some((s) => s.angleId === id)) return null;
          return (
            <div key={id} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-neutral-600 dark:text-neutral-400">{id}</span>
            </div>
          );
        })}
      </div>

      {/* Ranked list */}
      <div className="mt-4">
        <h5 className="font-semibold text-sm mb-2">Ranked Ideas</h5>
        <div className="space-y-1">
          {scores
            .sort(
              (a, b) =>
                b.impact * 0.35 +
                b.feasibility * 0.3 +
                b.novelty * 0.2 -
                (a.impact * 0.35 + a.feasibility * 0.3 + a.novelty * 0.2)
            )
            .slice(0, 10)
            .map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <span className="font-mono text-neutral-400 w-5">{i + 1}.</span>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ANGLE_COLORS[s.angleId] ?? "#6b7280" }}
                />
                <span className="flex-1 truncate">{s.ideaTitle}</span>
                <span className="text-xs text-neutral-500">
                  F:{s.feasibility} I:{s.impact} N:{s.novelty}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
