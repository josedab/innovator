"use client";

import { useState } from "react";

interface InnovationIdea {
  title: string;
  description: string;
  potentialImpact: string;
  implementationHint: string;
}

interface AngleResult {
  angleId: string;
  angleName: string;
  ideas: InnovationIdea[];
  reasoning: string;
}

interface Synthesis {
  topIdeas: {
    title: string;
    description: string;
    sourceAngle: string;
    potentialImpact: string;
    feasibility: "low" | "medium" | "high";
  }[];
  themes: string[];
  recommendation: string;
}

interface InnovationResultsProps {
  angleResults: AngleResult[];
  synthesis: Synthesis | null;
}

const FEASIBILITY_COLORS = {
  low: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  medium:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  high: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export function InnovationResults({
  angleResults,
  synthesis,
}: InnovationResultsProps) {
  const [expandedAngle, setExpandedAngle] = useState<string | null>(null);
  const [showSynthesis, setShowSynthesis] = useState(!!synthesis);

  return (
    <div className="space-y-8">
      {synthesis && (
        <div>
          <button
            onClick={() => setShowSynthesis(!showSynthesis)}
            className="w-full text-left"
          >
            <div className="p-5 rounded-xl bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-800">
              <h3 className="text-xl font-bold flex items-center gap-2">
                🏆 Synthesis & Top Ideas
                <span className="text-sm font-normal text-neutral-500">
                  {showSynthesis ? "▼" : "▶"}
                </span>
              </h3>
            </div>
          </button>

          {showSynthesis && (
            <div className="mt-4 space-y-4">
              <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <h4 className="font-semibold mb-3">💡 Top Ideas</h4>
                <div className="space-y-4">
                  {synthesis.topIdeas.map((idea, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h5 className="font-semibold">{idea.title}</h5>
                        <span
                          className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${FEASIBILITY_COLORS[idea.feasibility]}`}
                        >
                          {idea.feasibility} feasibility
                        </span>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-2">
                        {idea.description}
                      </p>
                      <div className="flex gap-4 mt-2 text-xs text-neutral-500">
                        <span>📐 From: {idea.sourceAngle}</span>
                        <span>💥 {idea.potentialImpact}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <h4 className="font-semibold mb-3">🔗 Cross-Cutting Themes</h4>
                  <ul className="space-y-2">
                    {synthesis.themes.map((theme, i) => (
                      <li
                        key={i}
                        className="text-sm text-neutral-700 dark:text-neutral-300 flex gap-2"
                      >
                        <span className="text-purple-500">•</span>
                        {theme}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="p-5 rounded-xl border border-neutral-200 dark:border-neutral-700">
                  <h4 className="font-semibold mb-3">📌 Recommendation</h4>
                  <p className="text-sm text-neutral-700 dark:text-neutral-300">
                    {synthesis.recommendation}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <h3 className="text-xl font-bold mb-4">
          📊 Results by Angle ({angleResults.length})
        </h3>
        <div className="space-y-3">
          {angleResults.map((result) => {
            const isExpanded = expandedAngle === result.angleId;
            return (
              <div
                key={result.angleId}
                className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden"
              >
                <button
                  onClick={() =>
                    setExpandedAngle(isExpanded ? null : result.angleId)
                  }
                  className="w-full p-4 text-left flex items-center justify-between hover:bg-neutral-50 dark:hover:bg-neutral-900 transition"
                >
                  <div>
                    <h4 className="font-semibold">{result.angleName}</h4>
                    <p className="text-sm text-neutral-500">
                      {result.ideas.length} ideas generated
                    </p>
                  </div>
                  <span className="text-neutral-400">
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-neutral-200 dark:border-neutral-700 p-4 space-y-4">
                    <div className="p-3 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
                      <p className="text-sm text-neutral-600 dark:text-neutral-400 italic">
                        {result.reasoning}
                      </p>
                    </div>

                    {result.ideas.map((idea, i) => (
                      <div key={i} className="p-4 rounded-lg border border-neutral-100 dark:border-neutral-800">
                        <h5 className="font-semibold">{idea.title}</h5>
                        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
                          {idea.description}
                        </p>
                        <div className="grid sm:grid-cols-2 gap-2 mt-3">
                          <div className="text-xs">
                            <span className="font-medium text-neutral-500">
                              Impact:{" "}
                            </span>
                            <span className="text-neutral-700 dark:text-neutral-300">
                              {idea.potentialImpact}
                            </span>
                          </div>
                          <div className="text-xs">
                            <span className="font-medium text-neutral-500">
                              How to start:{" "}
                            </span>
                            <span className="text-neutral-700 dark:text-neutral-300">
                              {idea.implementationHint}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
