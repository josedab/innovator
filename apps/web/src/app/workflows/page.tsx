"use client";

import { useState, useCallback } from "react";

interface TemplateInfo {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
}

interface StepProgress {
  type: "start" | "progress" | "complete" | "error";
  step?: string;
  status?: string;
  duration?: number;
  output?: Record<string, unknown>;
  error?: string;
  workflow?: string;
  subject?: string;
  totalSteps?: number;
  currentNodes?: string[];
  summary?: Record<string, unknown>;
}

const BUILTIN_TEMPLATES: TemplateInfo[] = [
  {
    id: "quick-explore",
    name: "⚡ Quick Explore",
    description: "Rapid ideation sprint: investigate, generate from 3 angles, and synthesize in under 2 minutes.",
    category: "rapid",
    tags: ["quick", "beginner", "exploration"],
  },
  {
    id: "deep-dive",
    name: "🔬 Deep Dive",
    description: "Comprehensive analysis with 5 angles, red-team challenge, structured debate, and expert review.",
    category: "advanced",
    tags: ["thorough", "analysis", "debate"],
  },
  {
    id: "competitive-analysis",
    name: "🎯 Competitive Analysis",
    description: "Market-focused competitive intelligence with differentiation ideas and wargaming scenarios.",
    category: "strategy",
    tags: ["competitive", "market", "strategy"],
  },
  {
    id: "product-launch",
    name: "🚀 Product Launch",
    description: "End-to-end product innovation from investigation through debate to PRD and tech spec.",
    category: "product",
    tags: ["product", "launch", "prd"],
  },
  {
    id: "patent-scan",
    name: "📜 Patent Scan",
    description: "IP-focused pipeline: prior art investigation, novel approach generation, and patentability assessment.",
    category: "ip",
    tags: ["patent", "ip", "novel"],
  },
];

export default function WorkflowsPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(null);
  const [subject, setSubject] = useState("");
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<StepProgress[]>([]);
  const [error, setError] = useState("");

  const runWorkflow = useCallback(async () => {
    if (!selectedTemplate || !subject.trim()) return;

    setRunning(true);
    setEvents([]);
    setError("");

    try {
      const res = await fetch("/api/workflow-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute",
          subject: subject.trim(),
          dslTemplateId: selectedTemplate.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Execution failed");
        setRunning(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError("No response stream");
        setRunning(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: StepProgress = JSON.parse(line.slice(6));
              setEvents((prev) => [...prev, event]);
            } catch {
              // Skip malformed events
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setRunning(false);
    }
  }, [selectedTemplate, subject]);

  const statusColor = (status?: string) => {
    switch (status) {
      case "completed": return "text-green-400";
      case "running": return "text-blue-400";
      case "failed": return "text-red-400";
      case "skipped": return "text-gray-500";
      default: return "text-gray-400";
    }
  };

  const statusIcon = (status?: string) => {
    switch (status) {
      case "completed": return "✓";
      case "running": return "⟳";
      case "failed": return "✕";
      case "skipped": return "–";
      default: return "○";
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <span>🔀</span> Workflow Builder
          </h1>
          <p className="text-gray-400 mt-1">Choose a template, enter a subject, and run an innovation workflow</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        {/* Template Gallery */}
        <section>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Built-in Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {BUILTIN_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(t)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedTemplate?.id === t.id
                    ? "border-blue-500 bg-blue-900/20 ring-1 ring-blue-500/50"
                    : "border-gray-700 bg-gray-900/50 hover:border-gray-600 hover:bg-gray-900"
                }`}
              >
                <h3 className="font-semibold text-sm mb-1">{t.name}</h3>
                <p className="text-xs text-gray-400 leading-relaxed">{t.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {t.tags?.map((tag) => (
                    <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Subject Input + Run */}
        <section className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-400 mb-2">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. AI-powered healthcare diagnostics"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-sm placeholder-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition"
            />
          </div>
          <button
            onClick={runWorkflow}
            disabled={running || !selectedTemplate || !subject.trim()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm font-medium transition whitespace-nowrap"
          >
            {running ? "⟳ Running..." : "▶ Run Workflow"}
          </button>
        </section>

        {/* Selected Template Info */}
        {selectedTemplate && (
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{selectedTemplate.name}</span>
                <span className="text-xs text-gray-500 ml-2">{selectedTemplate.category}</span>
              </div>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="text-gray-500 hover:text-white text-sm transition"
              >
                ✕ Clear
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
            <p className="text-red-400 text-sm">⚠ {error}</p>
          </div>
        )}

        {/* Execution Results */}
        {events.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Execution Progress</h2>
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl divide-y divide-gray-800">
              {events.map((event, i) => (
                <div key={i} className="px-4 py-3">
                  {event.type === "start" && (
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400">▶</span>
                      <span className="text-sm font-medium">
                        Starting <span className="text-blue-300">{event.workflow}</span>
                      </span>
                      <span className="text-xs text-gray-500 ml-auto">{event.totalSteps} steps</span>
                    </div>
                  )}
                  {event.type === "progress" && (
                    <div className="flex items-center gap-2">
                      <span className={statusColor(event.status)}>{statusIcon(event.status)}</span>
                      <span className="text-sm font-mono">{event.step}</span>
                      <span className={`text-xs ${statusColor(event.status)}`}>{event.status}</span>
                      {event.duration != null && (
                        <span className="text-xs text-gray-600 ml-auto">{event.duration}ms</span>
                      )}
                      {event.error && (
                        <span className="text-xs text-red-400 ml-2">{event.error}</span>
                      )}
                    </div>
                  )}
                  {event.type === "complete" && (
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">✓</span>
                      <span className="text-sm font-medium text-green-300">Workflow completed</span>
                      <span className={`text-xs ml-auto ${
                        event.summary && (event.summary as Record<string, unknown>).status === "completed"
                          ? "text-green-400"
                          : "text-yellow-400"
                      }`}>
                        {(event.summary as Record<string, unknown>)?.status as string ?? "done"}
                      </span>
                    </div>
                  )}
                  {event.type === "error" && (
                    <div className="flex items-center gap-2">
                      <span className="text-red-400">✕</span>
                      <span className="text-sm text-red-300">{event.error}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Detailed Output */}
        {events.some((e) => e.type === "complete") && (
          <section>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Full Output</h2>
            <pre className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-green-300 overflow-auto max-h-96">
              {JSON.stringify(
                events.find((e) => e.type === "complete")?.summary,
                null,
                2
              )}
            </pre>
          </section>
        )}
      </main>
    </div>
  );
}
