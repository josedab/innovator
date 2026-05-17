/**
 * @description Stakeholder simulation panel showing how different roles would evaluate proposed innovations.
 */
"use client";

import { useState } from "react";
import type {
  StakeholderSimulation,
  ConflictMatrix,
  StakeholderPersona,
} from "@innovator/core/types";

interface StakeholderPanelProps {
  ideas: Array<{
    title: string;
    description: string;
    potentialImpact: string;
    implementationHint: string;
  }>;
  model?: string;
}

interface SimulationResponse {
  simulations: StakeholderSimulation[];
  conflictMatrices: ConflictMatrix[];
  personas: StakeholderPersona[];
}

function enthusiasmColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-green-300";
  if (score >= 4) return "bg-yellow-300";
  if (score >= 2) return "bg-orange-400";
  return "bg-red-500";
}

function readinessColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

export default function StakeholderPanel({ ideas, model }: StakeholderPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationResponse | null>(null);

  async function runSimulation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stakeholders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas, model }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data: SimulationResponse = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  if (!result) {
    return (
      <div className="border rounded-lg p-4 my-4">
        <h3 className="text-lg font-semibold mb-2">👥 Stakeholder Simulation</h3>
        <p className="text-sm text-gray-600 mb-3">
          Simulate how 10 stakeholder archetypes would react to your top ideas.
        </p>
        <button
          onClick={runSimulation}
          disabled={loading || ideas.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Simulating..." : "Run Stakeholder Simulation"}
        </button>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 my-4">
      <h3 className="text-lg font-semibold mb-4">👥 Stakeholder Simulation</h3>

      {/* Heat Map */}
      <div className="overflow-x-auto mb-6">
        <h4 className="font-medium mb-2">Enthusiasm Heat Map</h4>
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="p-2 text-left border">Idea</th>
              {result.personas.map((p) => (
                <th key={p.id} className="p-2 text-center border" title={p.description}>
                  {p.name}
                </th>
              ))}
              <th className="p-2 text-center border">Consensus</th>
            </tr>
          </thead>
          <tbody>
            {result.simulations.map((sim, idx) => (
              <tr key={idx}>
                <td className="p-2 border font-medium max-w-[200px] truncate">{sim.ideaTitle}</td>
                {result.personas.map((persona) => {
                  const reaction = sim.reactions.find((r) => r.personaId === persona.id);
                  const score = reaction?.enthusiasm ?? 0;
                  return (
                    <td
                      key={persona.id}
                      className={`p-2 border text-center text-white font-bold ${enthusiasmColor(score)}`}
                      title={reaction?.likelyAction ?? "N/A"}
                    >
                      {score}
                    </td>
                  );
                })}
                <td className="p-2 border text-center font-bold">{sim.consensusScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Readiness Scores */}
      <div className="mb-6">
        <h4 className="font-medium mb-2">Readiness Scores</h4>
        <div className="space-y-2">
          {result.conflictMatrices.map((matrix, idx) => (
            <div key={idx} className="flex items-center gap-3 p-2 border rounded">
              <span className="flex-1 font-medium text-sm truncate">{matrix.ideaTitle}</span>
              <span className={`font-bold ${readinessColor(matrix.readinessScore)}`}>
                {matrix.readinessScore}%
              </span>
              <div className="flex gap-1 text-xs">
                <span className="text-green-600">✓{matrix.supportCount}</span>
                <span className="text-red-600">✗{matrix.oppositionCount}</span>
                <span className="text-gray-500">~{matrix.neutralCount}</span>
              </div>
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 rounded-full h-2"
                  style={{ width: `${matrix.readinessScore}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Conflicts */}
      {result.conflictMatrices.some((m) => m.conflicts.length > 0) && (
        <div>
          <h4 className="font-medium mb-2">Key Conflicts</h4>
          {result.conflictMatrices
            .filter((m) => m.conflicts.length > 0)
            .map((matrix, idx) => (
              <div key={idx} className="mb-3">
                <p className="text-sm font-medium">{matrix.ideaTitle}</p>
                {matrix.conflicts.slice(0, 3).map((c, ci) => (
                  <p key={ci} className="text-xs text-gray-600 ml-2">
                    ⚡ {c.personaA} vs {c.personaB} (Δ{c.enthusiasmDelta}): {c.topic}
                  </p>
                ))}
              </div>
            ))}
        </div>
      )}

      <button
        onClick={() => setResult(null)}
        className="mt-4 px-3 py-1 text-sm border rounded hover:bg-gray-100"
      >
        Reset
      </button>
    </div>
  );
}
