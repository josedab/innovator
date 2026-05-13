/**
 * @description Swarm intelligence panel that runs multiple parallel idea generation agents.
 */
"use client";

import { useState } from "react";

interface SwarmIdea {
  title: string;
  description: string;
  potentialImpact: string;
  originPersonalities: string[];
  confidence: number;
  endorsements: number;
  challenges: string[];
}

interface AgentContribution {
  agentId: string;
  personality: string;
  discoveriesCount: number;
  endorsementsGiven: number;
  challengesMade: number;
}

interface SwarmResult {
  ideas: SwarmIdea[];
  totalIterations: number;
  convergenceScore: number;
  agentContributions: AgentContribution[];
  dominantThemes: string[];
  emergentInsights: string[];
}

const PERSONALITY_PRESETS = [
  { name: "Balanced Debate", personalities: ["researcher", "critic", "synthesizer", "visionary"] },
  { name: "Devil's Advocate", personalities: ["pragmatist", "contrarian", "critic", "optimizer"] },
  { name: "Moonshot Team", personalities: ["visionary", "risk-taker", "provocateur", "integrator"] },
  { name: "Technical Review", personalities: ["domain-expert", "researcher", "optimizer", "pragmatist"] },
];

const PERSONALITY_COLORS: Record<string, string> = {
  researcher: "bg-blue-500",
  critic: "bg-red-500",
  synthesizer: "bg-purple-500",
  visionary: "bg-indigo-500",
  "risk-taker": "bg-orange-500",
  pragmatist: "bg-green-500",
  contrarian: "bg-yellow-500",
  "domain-expert": "bg-teal-500",
  integrator: "bg-pink-500",
  optimizer: "bg-cyan-500",
  provocateur: "bg-amber-500",
};

export default function SwarmPanel() {
  const [subject, setSubject] = useState("");
  const [personalities, setPersonalities] = useState<string[]>(["researcher", "critic", "synthesizer", "visionary"]);
  const [maxIterations, setMaxIterations] = useState(3);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SwarmResult | null>(null);
  const [error, setError] = useState("");

  const handleRun = async () => {
    if (!subject.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/swarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          personalities,
          maxIterations,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Swarm failed");
        return;
      }
      if (!data.result || !Array.isArray(data.result.ideas)) {
        setError("Invalid swarm response format");
        return;
      }
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-950 text-white rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800">
        <h2 className="text-xl font-bold flex items-center gap-2">
          🐝 Multi-Agent Innovation Swarm
        </h2>
        <p className="text-sm text-gray-400 mt-1">
          Specialized agents debate and refine ideas through collective intelligence
        </p>
      </div>

      {/* Config */}
      <div className="p-6 border-b border-gray-800 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What should the swarm innovate on?"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-sm"
            maxLength={500}
          />
        </div>

        {/* Personality Presets */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Agent Presets</label>
          <div className="flex gap-2 flex-wrap">
            {PERSONALITY_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => setPersonalities(preset.personalities)}
                className={`px-3 py-1.5 rounded-lg text-xs transition ${
                  JSON.stringify(personalities) === JSON.stringify(preset.personalities)
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                }`}
              >
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Active Agents */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">Active Agents</label>
          <div className="flex gap-2 flex-wrap">
            {personalities.map((p) => (
              <span
                key={p}
                className={`px-2 py-1 rounded text-xs text-white ${PERSONALITY_COLORS[p] ?? "bg-gray-600"}`}
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Max Iterations</label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxIterations}
              onChange={(e) => setMaxIterations(Number(e.target.value))}
              className="w-20 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={loading || !subject.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg font-medium text-sm transition mt-4"
          >
            {loading ? "🔄 Swarm running..." : "🐝 Launch Swarm"}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-900/30 border-b border-red-800 text-red-300 text-sm">
          ❌ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="p-12 text-center">
          <div className="animate-pulse text-4xl mb-4">🐝🐝🐝</div>
          <p className="text-gray-400">Agents are exploring, debating, and converging...</p>
          <p className="text-xs text-gray-600 mt-2">This may take a minute or two</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="p-6 space-y-6">
          {/* Convergence Score */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-400">
                {(result.convergenceScore * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-gray-500">Convergence</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-400">{result.ideas.length}</div>
              <div className="text-xs text-gray-500">Ideas</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-400">{result.totalIterations}</div>
              <div className="text-xs text-gray-500">Iterations</div>
            </div>
          </div>

          {/* Top Ideas */}
          <div>
            <h3 className="font-semibold mb-3">🏆 Top Ideas</h3>
            <div className="space-y-3">
              {result.ideas.slice(0, 5).map((idea, i) => (
                <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 p-4">
                  <div className="flex items-start justify-between">
                    <h4 className="font-medium">{idea.title}</h4>
                    <span className="text-sm text-gray-500">
                      {(idea.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{idea.description}</p>
                  <div className="flex gap-2 mt-2">
                    {idea.originPersonalities.map((p) => (
                      <span
                        key={p}
                        className={`px-1.5 py-0.5 rounded text-xs text-white ${PERSONALITY_COLORS[p] ?? "bg-gray-600"}`}
                      >
                        {p}
                      </span>
                    ))}
                    <span className="text-xs text-gray-600">
                      👍 {idea.endorsements} endorsements
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Agent Contributions */}
          <div>
            <h3 className="font-semibold mb-3">🤖 Agent Contributions</h3>
            <div className="grid grid-cols-2 gap-3">
              {result.agentContributions.map((c) => (
                <div key={c.agentId} className="bg-gray-900 rounded-lg border border-gray-800 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${PERSONALITY_COLORS[c.personality] ?? "bg-gray-600"}`} />
                    <span className="text-sm font-medium capitalize">{c.personality}</span>
                  </div>
                  <div className="text-xs text-gray-500 space-x-3">
                    <span>💡 {c.discoveriesCount} ideas</span>
                    <span>👍 {c.endorsementsGiven} endorsed</span>
                    <span>⚡ {c.challengesMade} challenged</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Themes & Insights */}
          {result.dominantThemes.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">🎯 Dominant Themes</h3>
              <div className="flex gap-2 flex-wrap">
                {result.dominantThemes.map((theme, i) => (
                  <span key={i} className="px-3 py-1 bg-gray-800 rounded-lg text-sm text-gray-300">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {result.emergentInsights.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">✨ Emergent Insights</h3>
              <ul className="space-y-1 text-sm text-gray-400">
                {result.emergentInsights.map((insight, i) => (
                  <li key={i}>• {insight}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
