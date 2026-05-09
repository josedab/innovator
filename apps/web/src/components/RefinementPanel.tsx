"use client";

import { useState } from "react";

interface RefinableIdea {
  id: string;
  title: string;
  description: string;
  selected: boolean;
  currentTier: "concept" | "plan" | "specification";
}

interface RefinementIteration {
  id: string;
  tier: string;
  ideaId: string;
  feedback?: string;
  output: {
    tier: string;
    content: string;
    implementationSteps?: string[];
    techStack?: string[];
    timeline?: string;
    teamSize?: string;
    acceptanceCriteria?: string[];
    risks?: string[];
    milestones?: Array<{ name: string; description: string }>;
  };
  createdAt: string;
  qualityDelta?: number;
}

interface RefinementSession {
  id: string;
  ideas: RefinableIdea[];
  iterations: RefinementIteration[];
  convergenceScore: number;
  suggestStop: boolean;
}

const TIER_CONFIG = {
  concept: {
    label: "Concept",
    icon: "💡",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  plan: {
    label: "Plan",
    icon: "📋",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  specification: {
    label: "Specification",
    icon: "📝",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
};

export default function RefinementPanel({
  ideas,
  onComplete,
}: {
  ideas: Array<{ id: string; title: string; description: string }>;
  onComplete?: (session: RefinementSession) => void;
}) {
  const [session, setSession] = useState<RefinementSession | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedIteration, setExpandedIteration] = useState<string | null>(null);

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/refinement-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", ideas }),
      });
      const data = await res.json();
      setSession(data.session);
      if (data.session.ideas.length > 0) {
        setSelectedIdea(data.session.ideas[0].id);
      }
    } catch {
      // Start failed
    } finally {
      setLoading(false);
    }
  };

  const handleRefine = async (ideaId: string, targetTier: "plan" | "specification") => {
    if (!session) return;
    setLoading(true);
    try {
      const res = await fetch("/api/refinement-loop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refine",
          sessionId: session.id,
          ideaId,
          targetTier,
          feedback: feedback || undefined,
        }),
      });
      const data = await res.json();
      setSession(data.session);
      setFeedback("");
    } catch {
      // Refine failed
    } finally {
      setLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="p-6 rounded-xl border border-neutral-200 dark:border-neutral-700">
        <h3 className="text-lg font-semibold mb-3">🔄 Progressive Refinement</h3>
        <p className="text-sm text-neutral-500 mb-4">
          Select ideas to refine through three tiers: Concept → Plan → Specification
        </p>
        <div className="space-y-2 mb-4">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
            >
              <p className="text-sm font-medium">{idea.title}</p>
              <p className="text-xs text-neutral-500 line-clamp-2">{idea.description}</p>
            </div>
          ))}
        </div>
        <button
          onClick={handleStart}
          disabled={loading || ideas.length === 0}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? "Starting..." : `Refine ${ideas.length} Ideas`}
        </button>
      </div>
    );
  }

  const currentIdea = session.ideas.find((i) => i.id === selectedIdea);
  const ideaIterations = session.iterations.filter((i) => i.ideaId === selectedIdea);

  return (
    <div className="space-y-4">
      {/* Convergence Warning */}
      {session.suggestStop && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            ⚡ Marginal gains are plateauing. Consider finalizing your ideas.
          </p>
          <div className="mt-2 w-full h-2 bg-amber-100 dark:bg-amber-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full"
              style={{ width: `${session.convergenceScore * 100}%` }}
            />
          </div>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            Convergence: {Math.round(session.convergenceScore * 100)}%
          </p>
        </div>
      )}

      {/* Idea Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {session.ideas.map((idea) => {
          const cfg = TIER_CONFIG[idea.currentTier];
          return (
            <button
              key={idea.id}
              onClick={() => setSelectedIdea(idea.id)}
              className={`flex-shrink-0 p-3 rounded-lg border text-left transition ${
                selectedIdea === idea.id
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                  : "border-neutral-200 dark:border-neutral-700"
              }`}
            >
              <p className="text-sm font-medium truncate max-w-48">{idea.title}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>
                {cfg.icon} {cfg.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected Idea Details */}
      {currentIdea && (
        <div className="space-y-4">
          {/* Tier Progress */}
          <div className="flex items-center gap-2">
            {(["concept", "plan", "specification"] as const).map((tier, i) => {
              const cfg = TIER_CONFIG[tier];
              const isCompleted =
                tier === "concept" ||
                (tier === "plan" && ["plan", "specification"].includes(currentIdea.currentTier)) ||
                (tier === "specification" && currentIdea.currentTier === "specification");
              return (
                <div key={tier} className="flex items-center gap-2">
                  {i > 0 && (
                    <div
                      className={`w-8 h-0.5 ${isCompleted ? "bg-green-400" : "bg-neutral-200 dark:bg-neutral-700"}`}
                    />
                  )}
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      isCompleted
                        ? cfg.color
                        : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800"
                    }`}
                  >
                    {cfg.icon} {cfg.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Iteration Timeline */}
          {ideaIterations.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">📜 Refinement History</h4>
              {ideaIterations.map((iteration) => {
                const isExpanded = expandedIteration === iteration.id;
                return (
                  <div
                    key={iteration.id}
                    className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${TIER_CONFIG[iteration.tier as keyof typeof TIER_CONFIG]?.color ?? ""}`}
                        >
                          {iteration.tier}
                        </span>
                        {iteration.qualityDelta !== undefined && (
                          <span className="text-xs text-neutral-500">
                            Δ {iteration.qualityDelta > 0 ? "+" : ""}
                            {Math.round(iteration.qualityDelta * 100)}%
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setExpandedIteration(isExpanded ? null : iteration.id)}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        {isExpanded ? "Collapse" : "Expand"}
                      </button>
                    </div>
                    <p className="text-sm line-clamp-2">{iteration.output.content}</p>
                    {isExpanded && (
                      <div className="mt-3 space-y-2 text-sm">
                        {iteration.output.implementationSteps && (
                          <div>
                            <p className="font-medium text-xs text-neutral-500 mb-1">
                              Implementation Steps
                            </p>
                            <ol className="list-decimal list-inside space-y-1">
                              {iteration.output.implementationSteps.map((step, i) => (
                                <li key={i} className="text-xs">
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                        {iteration.output.acceptanceCriteria && (
                          <div>
                            <p className="font-medium text-xs text-neutral-500 mb-1">
                              Acceptance Criteria
                            </p>
                            <ul className="list-disc list-inside space-y-1">
                              {iteration.output.acceptanceCriteria.map((ac, i) => (
                                <li key={i} className="text-xs">
                                  {ac}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {iteration.output.risks && (
                          <div>
                            <p className="font-medium text-xs text-neutral-500 mb-1">Risks</p>
                            <ul className="space-y-1">
                              {iteration.output.risks.map((risk, i) => (
                                <li key={i} className="text-xs">
                                  ⚠️ {risk}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {iteration.feedback && (
                          <div className="p-2 bg-neutral-50 dark:bg-neutral-800 rounded text-xs">
                            <p className="text-neutral-500">User feedback:</p>
                            <p className="italic">{iteration.feedback}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Feedback + Refine */}
          {currentIdea.currentTier !== "specification" && (
            <div className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <h4 className="text-sm font-medium mb-2">💬 Provide Feedback (Optional)</h4>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Add context, constraints, or direction..."
                rows={2}
                className="w-full px-3 py-2 border rounded text-sm dark:bg-neutral-800 dark:border-neutral-600 resize-none mb-3"
              />
              <div className="flex gap-2">
                {currentIdea.currentTier === "concept" && (
                  <button
                    onClick={() => handleRefine(currentIdea.id, "plan")}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded text-sm font-medium hover:bg-yellow-700 disabled:opacity-50 transition"
                  >
                    {loading ? "Refining..." : "📋 Refine to Plan"}
                  </button>
                )}
                {currentIdea.currentTier === "plan" && (
                  <button
                    onClick={() => handleRefine(currentIdea.id, "specification")}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition"
                  >
                    {loading ? "Refining..." : "📝 Refine to Specification"}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
