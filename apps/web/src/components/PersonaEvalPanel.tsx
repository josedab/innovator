/**
 * @description Persona-based evaluation panel where AI personas score and critique innovation ideas.
 */
"use client";

import { useState, useCallback } from "react";

interface PersonaScorecard {
  personaId: string;
  ideaTitle: string;
  overallScore: number;
  dimensionScores: Record<string, number>;
  strengths: string[];
  concerns: string[];
  recommendation: string;
  riskFlags: string[];
}

interface PersonaEvalPanelProps {
  idea: { title: string; description: string };
  onAssessmentComplete?: (scorecards: PersonaScorecard[]) => void;
}

const PERSONAS = [
  { id: "cto", label: "CTO", emoji: "🛠️" },
  { id: "end-user", label: "End User", emoji: "👤" },
  { id: "investor", label: "Investor", emoji: "💰" },
  { id: "regulator", label: "Regulator", emoji: "⚖️" },
] as const;

const SCORE_COLOR = (score: number): string => {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-green-300 dark:bg-green-600";
  if (score >= 4) return "bg-yellow-400 dark:bg-yellow-500";
  if (score >= 2) return "bg-orange-400";
  return "bg-red-500";
};

export default function PersonaEvalPanel({ idea, onAssessmentComplete }: PersonaEvalPanelProps) {
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(
    new Set(PERSONAS.map((p) => p.id))
  );
  const [scorecards, setScorecards] = useState<PersonaScorecard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluated, setEvaluated] = useState(false);

  const togglePersona = useCallback((id: string) => {
    setSelectedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const evaluate = useCallback(async () => {
    if (selectedPersonas.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/persona-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, personaIds: Array.from(selectedPersonas) }),
      });
      if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
      const data = await res.json();
      const cards: PersonaScorecard[] = data.scorecards ?? [];
      setScorecards(cards);
      setEvaluated(true);
      onAssessmentComplete?.(cards);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setLoading(false);
    }
  }, [idea, selectedPersonas, onAssessmentComplete]);

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600" />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Evaluating with {selectedPersonas.size} persona{selectedPersonas.size !== 1 ? "s" : ""}…
        </p>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300 mb-3">{error}</p>
        <button
          onClick={evaluate}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  // Initial / persona selection
  if (!evaluated) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200 mb-1">
          🎭 Persona Evaluation
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
          Evaluate &ldquo;{idea.title}&rdquo; from multiple stakeholder perspectives.
        </p>

        {/* Persona checkboxes */}
        <div className="flex flex-wrap gap-3 mb-5">
          {PERSONAS.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm cursor-pointer transition ${
                selectedPersonas.has(p.id)
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300"
                  : "border-neutral-200 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              <input
                type="checkbox"
                checked={selectedPersonas.has(p.id)}
                onChange={() => togglePersona(p.id)}
                className="sr-only"
              />
              <span>{p.emoji}</span>
              <span className="font-medium">{p.label}</span>
            </label>
          ))}
        </div>

        <button
          onClick={evaluate}
          disabled={selectedPersonas.size === 0}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition"
        >
          Evaluate
        </button>
      </div>
    );
  }

  // Alignment summary
  const avgScore =
    scorecards.length > 0
      ? scorecards.reduce((sum, c) => sum + c.overallScore, 0) / scorecards.length
      : 0;
  const allScores = scorecards.map((c) => c.overallScore);
  const spread = allScores.length > 1 ? Math.max(...allScores) - Math.min(...allScores) : 0;
  const alignmentLabel =
    spread <= 2
      ? "Strong consensus"
      : spread <= 4
        ? "Moderate agreement"
        : "Significant disagreement";
  const alignmentColor =
    spread <= 2
      ? "text-green-600 dark:text-green-400"
      : spread <= 4
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">
          🎭 Persona Evaluation: {idea.title}
        </h3>
        <button
          onClick={() => {
            setEvaluated(false);
            setScorecards([]);
          }}
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition"
        >
          Reset
        </button>
      </div>

      {/* Alignment summary */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400">
              Alignment
            </p>
            <p className={`text-sm font-medium ${alignmentColor}`}>{alignmentLabel}</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {avgScore.toFixed(1)}
            </p>
            <p className="text-xs text-neutral-500">avg score</p>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-neutral-700 dark:text-neutral-300">
              {spread.toFixed(1)}
            </p>
            <p className="text-xs text-neutral-500">spread</p>
          </div>
        </div>
      </div>

      {/* Scorecard grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {scorecards.map((card) => {
          const persona = PERSONAS.find((p) => p.id === card.personaId);
          return (
            <div
              key={card.personaId}
              className="rounded-xl border border-neutral-200 bg-white p-4 space-y-3 dark:border-neutral-700 dark:bg-neutral-900"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{persona?.emoji ?? "🎭"}</span>
                  <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">
                    {persona?.label ?? card.personaId}
                  </h4>
                </div>
                <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                  {card.overallScore}/10
                </span>
              </div>

              {/* Dimension score bars */}
              <div className="space-y-1.5">
                {Object.entries(card.dimensionScores).map(([dim, score]) => (
                  <div key={dim} className="flex items-center gap-2">
                    <span className="text-xs text-neutral-600 dark:text-neutral-400 w-24 truncate">
                      {dim}
                    </span>
                    <div className="flex-1 h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${SCORE_COLOR(score)}`}
                        style={{ width: `${(score / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 w-6 text-right">
                      {score}
                    </span>
                  </div>
                ))}
              </div>

              {/* Strengths */}
              {card.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">
                    Strengths
                  </p>
                  <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5">
                    {card.strengths.map((s, i) => (
                      <li key={i}>✓ {s}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Concerns */}
              {card.concerns.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    Concerns
                  </p>
                  <ul className="text-xs text-neutral-600 dark:text-neutral-400 space-y-0.5">
                    {card.concerns.map((c, i) => (
                      <li key={i}>⚠ {c}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendation */}
              <p className="text-xs italic text-neutral-600 dark:text-neutral-400">
                {card.recommendation}
              </p>

              {/* Risk flags */}
              {card.riskFlags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {card.riskFlags.map((flag, i) => (
                    <span
                      key={i}
                      className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    >
                      🚩 {flag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
