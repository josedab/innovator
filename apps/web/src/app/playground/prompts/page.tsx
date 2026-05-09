"use client";

import { useState, useEffect } from "react";

interface PromptVariant {
  id: string;
  name: string;
  template: string;
  createdAt: string;
}

interface Experiment {
  id: string;
  name: string;
  description?: string;
  angleId: string;
  variants: PromptVariant[];
  allocation: string;
  successMetric: string;
  status: string;
  minSampleSize: number;
  winnerId?: string;
}

interface PromptVersion {
  id: string;
  angleId: string;
  version: number;
  template: string;
  message: string;
  author: string;
  isActive: boolean;
  createdAt: string;
}

interface AnalysisResult {
  results: Record<string, { sampleSize: number; mean: number; stdDev: number }>;
  tests?: Array<{
    controlId: string;
    treatmentId: string;
    pValue: number;
    isSignificant: boolean;
    winner?: string;
    effectSize: number;
  }>;
}

const ANGLES = [
  "scamper",
  "first-principles",
  "cross-domain",
  "constraints",
  "inversion",
  "perspectives",
  "what-if",
  "trend-collision",
];

export default function PromptPlaygroundPage() {
  const [activeTab, setActiveTab] = useState<"editor" | "experiments" | "versions">("editor");
  const [selectedAngle, setSelectedAngle] = useState(ANGLES[0]);
  const [promptA, setPromptA] = useState("");
  const [promptB, setPromptB] = useState("");
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");

  useEffect(() => {
    loadExperiments();
    loadVersionHistory();
  }, [selectedAngle]);

  const loadExperiments = async () => {
    try {
      const res = await fetch("/api/prompt-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const data = await res.json();
      setExperiments(data.experiments ?? []);
    } catch {
      // Load failed — non-critical
    }
  };

  const loadVersionHistory = async () => {
    try {
      const res = await fetch("/api/prompt-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "version-history", angleId: selectedAngle }),
      });
      const data = await res.json();
      setVersions(data.history ?? []);
    } catch {
      // Load failed — non-critical
    }
  };

  const handleCreateExperiment = async () => {
    if (!promptA || !promptB) return;
    setLoading(true);
    try {
      const now = new Date().toISOString();
      const res = await fetch("/api/prompt-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: `A/B Test: ${selectedAngle}`,
          angleId: selectedAngle,
          variants: [
            { id: "variant-a", name: "Variant A (Control)", template: promptA, createdAt: now },
            { id: "variant-b", name: "Variant B (Treatment)", template: promptB, createdAt: now },
          ],
        }),
      });
      const data = await res.json();
      if (data.experiment) {
        // Auto-start the experiment
        await fetch("/api/prompt-lab", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start", experimentId: data.experiment.id }),
        });
        loadExperiments();
      }
    } catch {
      // Create failed
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyze = async (experimentId: string) => {
    try {
      const res = await fetch("/api/prompt-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", experimentId }),
      });
      const data = await res.json();
      setAnalysis(data);
    } catch {
      // Analysis failed
    }
  };

  const handleCommitVersion = async () => {
    if (!promptA) return;
    setLoading(true);
    try {
      await fetch("/api/prompt-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "commit-version",
          angleId: selectedAngle,
          template: promptA,
          message: commitMessage || "Update prompt template",
        }),
      });
      setCommitMessage("");
      loadVersionHistory();
    } catch {
      // Commit failed
    } finally {
      setLoading(false);
    }
  };

  const handleRollback = async (version: number) => {
    try {
      await fetch("/api/prompt-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rollback", angleId: selectedAngle, version }),
      });
      loadVersionHistory();
    } catch {
      // Rollback failed
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">🧪 Prompt Playground</h1>
      <p className="text-neutral-500 mb-6">
        Edit prompts, run A/B tests, and manage prompt versions.
      </p>

      {/* Angle Selector */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {ANGLES.map((angle) => (
          <button
            key={angle}
            onClick={() => setSelectedAngle(angle)}
            className={`px-3 py-1 rounded-full text-sm whitespace-nowrap transition ${
              selectedAngle === angle
                ? "bg-blue-600 text-white"
                : "bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            {angle}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {(["editor", "experiments", "versions"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              activeTab === tab
                ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900"
                : "bg-neutral-100 dark:bg-neutral-800"
            }`}
          >
            {tab === "editor"
              ? "✏️ Editor"
              : tab === "experiments"
                ? "🧪 A/B Tests"
                : "📜 Versions"}
          </button>
        ))}
      </div>

      {/* Editor Tab */}
      {activeTab === "editor" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Prompt A */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Variant A (Control)</label>
                <span className="text-xs text-neutral-500">{promptA.length} chars</span>
              </div>
              <textarea
                value={promptA}
                onChange={(e) => setPromptA(e.target.value)}
                placeholder="Enter your prompt template... Use {{subject}} and {{investigation}} as variables."
                rows={12}
                className="w-full px-4 py-3 border rounded-lg font-mono text-sm dark:bg-neutral-800 dark:border-neutral-600 resize-none"
                spellCheck={false}
              />
            </div>

            {/* Prompt B */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium">Variant B (Treatment)</label>
                <span className="text-xs text-neutral-500">{promptB.length} chars</span>
              </div>
              <textarea
                value={promptB}
                onChange={(e) => setPromptB(e.target.value)}
                placeholder="Enter the alternative prompt to compare..."
                rows={12}
                className="w-full px-4 py-3 border rounded-lg font-mono text-sm dark:bg-neutral-800 dark:border-neutral-600 resize-none"
                spellCheck={false}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleCreateExperiment}
              disabled={loading || !promptA || !promptB}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
            >
              {loading ? "Creating..." : "🧪 Start A/B Test"}
            </button>
            <div className="flex-1 flex gap-2">
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message..."
                className="flex-1 px-3 py-2 border rounded-lg text-sm dark:bg-neutral-800 dark:border-neutral-600"
              />
              <button
                onClick={handleCommitVersion}
                disabled={loading || !promptA}
                className="px-4 py-2 bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                💾 Commit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Experiments Tab */}
      {activeTab === "experiments" && (
        <div className="space-y-4">
          {experiments.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              <p className="text-4xl mb-4">🧪</p>
              <p>No experiments yet. Create one from the Editor tab.</p>
            </div>
          ) : (
            experiments.map((exp) => (
              <div
                key={exp.id}
                className="p-4 rounded-xl border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="font-medium">{exp.name}</h3>
                    <p className="text-xs text-neutral-500">
                      {exp.angleId} • {exp.variants.length} variants • {exp.status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        exp.status === "running"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                          : exp.status === "completed"
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800"
                      }`}
                    >
                      {exp.status}
                    </span>
                    <button
                      onClick={() => handleAnalyze(exp.id)}
                      className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Analyze
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {exp.variants.map((v) => (
                    <div
                      key={v.id}
                      className={`p-2 rounded border text-xs font-mono ${
                        v.id === exp.winnerId
                          ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                          : "border-neutral-200 dark:border-neutral-700"
                      }`}
                    >
                      <p className="font-sans font-medium mb-1">{v.name}</p>
                      <p className="line-clamp-3 text-neutral-500">{v.template}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}

          {/* Analysis Results */}
          {analysis && (
            <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
              <h3 className="font-semibold mb-3">📊 Analysis Results</h3>
              {analysis.tests?.map((test, i) => (
                <div key={i} className="mb-2 text-sm">
                  <p>
                    <span className="font-medium">{test.controlId}</span> vs{" "}
                    <span className="font-medium">{test.treatmentId}</span>
                  </p>
                  <p className="text-neutral-500">
                    p-value: {test.pValue.toFixed(4)} • Effect size: {test.effectSize.toFixed(3)} •
                    {test.isSignificant ? (
                      <span className="text-green-600 font-medium">
                        {" "}
                        Significant ✓ Winner: {test.winner}
                      </span>
                    ) : (
                      <span className="text-neutral-400"> Not significant</span>
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Versions Tab */}
      {activeTab === "versions" && (
        <div className="space-y-3">
          {versions.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              <p className="text-4xl mb-4">📜</p>
              <p>No versions yet. Commit a prompt from the Editor tab.</p>
            </div>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className={`p-4 rounded-xl border ${
                  v.isActive
                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                    : "border-neutral-200 dark:border-neutral-700"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono font-bold">v{v.version}</span>
                    {v.isActive && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 rounded-full">
                        Active
                      </span>
                    )}
                    <span className="text-xs text-neutral-500">{v.message}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-400">
                      {new Date(v.createdAt).toLocaleDateString()}
                    </span>
                    {!v.isActive && (
                      <button
                        onClick={() => handleRollback(v.version)}
                        className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      >
                        Rollback
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs font-mono text-neutral-500 line-clamp-2">{v.template}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
