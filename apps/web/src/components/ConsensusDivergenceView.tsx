/**
 * @description Visualization of jury consensus and divergence from multi-perspective idea evaluations.
 */
"use client";

import { useMemo } from "react";
import type {
  JuryReport,
  JuryVerdict,
  DivergenceDetail,
  ConsensusResult,
  ConsensusIdea,
} from "@innovator/core/types";

interface ConsensusDivergenceViewProps {
  report?: JuryReport;
  divergences?: DivergenceDetail[];
  consensusResult?: ConsensusResult;
}

const DIM_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4"];

function alphaLabel(alpha: number): { text: string; color: string } {
  if (alpha > 0.8) return { text: "Strong", color: "#10B981" };
  if (alpha > 0.6) return { text: "Moderate", color: "#F59E0B" };
  return { text: "Weak", color: "#EF4444" };
}

function spreadColor(spread: number): string {
  if (spread >= 6) return "bg-red-100 border-red-400 dark:bg-red-900/30";
  if (spread >= 4) return "bg-amber-100 border-amber-400 dark:bg-amber-900/30";
  return "bg-yellow-50 border-yellow-300 dark:bg-yellow-900/20";
}

export default function ConsensusDivergenceView({
  report,
  divergences,
  consensusResult,
}: ConsensusDivergenceViewProps) {
  const sortedModels = useMemo(() => {
    if (!report) return [];
    return Object.entries(report.modelReliability).sort(([, a], [, b]) => b - a);
  }, [report]);

  if (!report && !divergences?.length && !consensusResult) {
    return <p className="text-sm text-gray-500 italic">No consensus data available.</p>;
  }

  return (
    <div className="space-y-6" aria-label="Consensus and divergence analysis">
      {/* Agreement Summary */}
      {report && (
        <section aria-label="Agreement summary">
          <h2 className="text-lg font-bold mb-3">Agreement Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500">Overall Agreement</div>
              <div className="text-xl font-bold">{Math.round(report.overallAgreement * 100)}%</div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500">Krippendorff&apos;s α</div>
              <div className="text-xl font-bold">{report.krippendorffAlpha.toFixed(3)}</div>
              <span
                className="text-xs font-medium"
                style={{ color: alphaLabel(report.krippendorffAlpha).color }}
              >
                {alphaLabel(report.krippendorffAlpha).text}
              </span>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 col-span-2 sm:col-span-1">
              <div className="text-xs text-gray-500 mb-1">Model Reliability</div>
              {sortedModels.map(([model, reliability]) => (
                <div key={model} className="flex items-center gap-2 mb-1">
                  <span className="text-xs truncate w-20" title={model}>
                    {model}
                  </span>
                  <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${reliability * 100}%` }}
                      aria-label={`${model} reliability ${Math.round(reliability * 100)}%`}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{Math.round(reliability * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Idea Verdicts */}
      {report && report.verdicts.length > 0 && (
        <section aria-label="Idea verdicts">
          <h2 className="text-lg font-bold mb-3">Idea Verdicts</h2>
          <div className="space-y-3">
            {report.verdicts.map((verdict) => (
              <VerdictCard key={verdict.ideaTitle} verdict={verdict} />
            ))}
          </div>
        </section>
      )}

      {/* Divergence Highlights */}
      {divergences && divergences.length > 0 && (
        <section aria-label="Divergence highlights">
          <h2 className="text-lg font-bold mb-3">Divergence Highlights</h2>
          <div className="space-y-3">
            {divergences.map((d, i) => {
              const entries = Object.entries(d.scores);
              const highest = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
              const lowest = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
              return (
                <div
                  key={`${d.ideaTitle}-${d.dimension}-${i}`}
                  className={`p-3 rounded-lg border ${spreadColor(d.spread)}`}
                  aria-label={`Divergence on ${d.dimension} for ${d.ideaTitle}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm">{d.dimension}</span>
                    <span className="text-xs text-gray-500">— {d.ideaTitle}</span>
                    <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700">
                      spread: {d.spread}
                    </span>
                  </div>
                  {/* Spread bar */}
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2 my-2">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-green-400 via-amber-400 to-red-500"
                      style={{ width: `${Math.min(100, (d.spread / 9) * 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-green-700 dark:text-green-400">
                      ▲ {highest[0]}: {highest[1]}
                    </span>
                    <span className="text-red-700 dark:text-red-400">
                      ▼ {lowest[0]}: {lowest[1]}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">{d.explanation}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Consensus Agreements / Divergences */}
      {consensusResult && (
        <section aria-label="Consensus results">
          <h2 className="text-lg font-bold mb-1">{consensusResult.angleName}</h2>
          <p className="text-sm text-gray-500 mb-3">
            Consensus Score: {Math.round(consensusResult.consensusScore * 100)}%
          </p>
          {consensusResult.agreements.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">
                🤝 Agreements ({consensusResult.agreements.length})
              </h3>
              <div className="space-y-2">
                {consensusResult.agreements.map((idea) => (
                  <ConsensusIdeaCard key={idea.title} idea={idea} />
                ))}
              </div>
            </div>
          )}
          {consensusResult.divergences.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-2">
                💡 Divergences ({consensusResult.divergences.length})
              </h3>
              <div className="space-y-2">
                {consensusResult.divergences.map((idea) => (
                  <ConsensusIdeaCard key={idea.title} idea={idea} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function VerdictCard({ verdict }: { verdict: JuryVerdict }) {
  const dims = Object.entries(verdict.finalScores);
  return (
    <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-sm">{verdict.ideaTitle}</h3>
        <span
          className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          aria-label={`Confidence ${Math.round(verdict.confidence * 100)}%`}
        >
          {Math.round(verdict.confidence * 100)}% conf
        </span>
      </div>
      {dims.map(([dim, score], idx) => (
        <div key={dim} className="flex items-center gap-2 mb-1">
          <span className="text-xs w-24 truncate" title={dim}>
            {dim}
          </span>
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="h-2 rounded-full transition-all"
              style={{
                width: `${(score / 10) * 100}%`,
                backgroundColor: DIM_COLORS[idx % DIM_COLORS.length],
              }}
            />
          </div>
          <span className="text-xs text-gray-500 w-6 text-right">{score}</span>
        </div>
      ))}
      {verdict.outlierModels.length > 0 && (
        <div className="flex gap-1 mt-2 flex-wrap">
          {verdict.outlierModels.map((m) => (
            <span
              key={m}
              className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
              aria-label={`Outlier model: ${m}`}
            >
              ⚠ {m}
            </span>
          ))}
        </div>
      )}
      {verdict.divergenceNotes && (
        <p className="text-xs text-gray-500 mt-1">{verdict.divergenceNotes}</p>
      )}
    </div>
  );
}

function ConsensusIdeaCard({ idea }: { idea: ConsensusIdea }) {
  return (
    <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-medium text-sm">{idea.title}</span>
        {idea.isNovel && (
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
            Novel
          </span>
        )}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">{idea.description}</p>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            className="h-1.5 rounded-full bg-green-500"
            style={{ width: `${idea.confidence * 100}%` }}
            aria-label={`Confidence ${Math.round(idea.confidence * 100)}%`}
          />
        </div>
        <span className="text-xs text-gray-500">{Math.round(idea.confidence * 100)}%</span>
        <span className="text-xs text-gray-400">{idea.sources.join(", ")}</span>
      </div>
    </div>
  );
}
