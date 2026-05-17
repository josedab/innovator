/**
 * @description Visual editor for creating and editing directed acyclic graph (DAG) workflows.
 */
"use client";

import { useState, useCallback } from "react";

interface DAGNode {
  id: string;
  type: "investigate" | "generate" | "score" | "filter" | "synthesize" | "custom";
  name: string;
  angles?: string[];
  filter?: { minFeasibility?: number; minImpact?: number; maxResults?: number };
  continueOnError?: boolean;
}

interface DAGEdge {
  from: string;
  to: string;
  condition?: string;
}

interface DAGTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
}

const NODE_TYPES = [
  { type: "investigate" as const, label: "🔍 Investigate", color: "bg-blue-600" },
  { type: "generate" as const, label: "💡 Generate", color: "bg-green-600" },
  { type: "score" as const, label: "📊 Score", color: "bg-yellow-600" },
  { type: "filter" as const, label: "🔽 Filter", color: "bg-orange-600" },
  { type: "synthesize" as const, label: "🧬 Synthesize", color: "bg-purple-600" },
  { type: "custom" as const, label: "⚙️ Custom", color: "bg-gray-600" },
];

const AVAILABLE_ANGLES = [
  "scamper",
  "first-principles",
  "cross-domain",
  "constraints",
  "inversion",
  "perspectives",
  "what-if",
  "trend-collision",
];

export default function DAGEditorPanel() {
  const [nodes, setNodes] = useState<DAGNode[]>([
    { id: "investigate", type: "investigate", name: "Investigation" },
  ]);
  const [_edges, setEdges] = useState<DAGEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState("My Workflow");
  const [yamlOutput, setYamlOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [_templates, setTemplates] = useState<DAGTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const addNode = useCallback((type: DAGNode["type"]) => {
    const id = `${type}-${Date.now()}`;
    const newNode: DAGNode = {
      id,
      type,
      name: NODE_TYPES.find((nt) => nt.type === type)?.label.split(" ")[1] ?? type,
    };
    setNodes((prev) => {
      const updated = [...prev, newNode];
      // Auto-connect to the previous last node
      if (prev.length > 0) {
        const lastId = prev[prev.length - 1].id;
        setEdges((prevEdges) => [...prevEdges, { from: lastId, to: id }]);
      }
      return updated;
    });
  }, []);

  const removeNode = useCallback(
    (id: string) => {
      setNodes((prev) => prev.filter((n) => n.id !== id));
      setEdges((prev) => prev.filter((e) => e.from !== id && e.to !== id));
      if (selectedNode === id) setSelectedNode(null);
    },
    [selectedNode]
  );

  const updateNode = useCallback((id: string, updates: Partial<DAGNode>) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
  }, []);

  const generateYAML = useCallback(() => {
    const stages = nodes.map((node) => {
      const stage: Record<string, unknown> = {
        id: node.id,
        name: node.name,
        type: node.type,
      };
      if (node.angles?.length) stage.angles = node.angles;
      if (node.filter) stage.filter = node.filter;
      if (node.continueOnError) stage.continueOnError = true;
      return stage;
    });

    const workflow = {
      name: workflowName,
      version: "1.0.0",
      stages,
      synthesisRules: { strategy: "top-n", maxIdeas: 10 },
      outputFormat: { format: "json", includeScores: true },
    };

    setYamlOutput(JSON.stringify(workflow, null, 2));
  }, [nodes, workflowName]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline-dag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "compile", description: "list templates" }),
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } catch {
      // Fall back to built-in templates
    }
    setShowTemplates(true);
  }, []);

  const applyTemplate = useCallback((templateNodes: DAGNode[], templateEdges: DAGEdge[]) => {
    setNodes(templateNodes);
    setEdges(templateEdges);
    setShowTemplates(false);
  }, []);

  const runWorkflow = useCallback(async () => {
    setLoading(true);
    generateYAML();
    try {
      const res = await fetch("/api/pipeline-dag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "compile",
          description: `Run workflow: ${workflowName}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setYamlOutput(JSON.stringify(data, null, 2));
      }
    } catch {
      // Error handled in UI
    } finally {
      setLoading(false);
    }
  }, [generateYAML, workflowName]);

  const selected = nodes.find((n) => n.id === selectedNode);

  return (
    <div className="bg-gray-950 text-white rounded-xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🔀</span>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="bg-transparent text-lg font-semibold border-none outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadTemplates()}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
          >
            📋 Templates
          </button>
          <button
            onClick={generateYAML}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition"
          >
            📄 Export JSON
          </button>
          <button
            onClick={runWorkflow}
            disabled={loading || nodes.length === 0}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 rounded-lg text-sm font-medium transition"
          >
            {loading ? "Running..." : "▶ Run"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 min-h-[500px]">
        {/* Node Palette */}
        <div className="col-span-2 border-r border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Add Nodes</h3>
          <div className="space-y-2">
            {NODE_TYPES.map((nt) => (
              <button
                key={nt.type}
                onClick={() => addNode(nt.type)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${nt.color} bg-opacity-20 hover:bg-opacity-40 transition`}
              >
                {nt.label}
              </button>
            ))}
          </div>
        </div>

        {/* DAG Canvas */}
        <div className="col-span-7 p-6 overflow-auto">
          <div className="space-y-3">
            {nodes.map((node, i) => {
              const nodeType = NODE_TYPES.find((nt) => nt.type === node.type);
              return (
                <div key={node.id}>
                  {/* Edge connector */}
                  {i > 0 && (
                    <div className="flex justify-center py-1">
                      <div className="w-px h-6 bg-gray-700" />
                      <span className="text-gray-600 text-xs px-1">→</span>
                      <div className="w-px h-6 bg-gray-700" />
                    </div>
                  )}
                  <div
                    onClick={() => setSelectedNode(node.id)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition ${
                      selectedNode === node.id
                        ? "border-blue-500 bg-blue-900/20"
                        : "border-gray-700 hover:border-gray-600 bg-gray-900/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-2 h-2 rounded-full ${nodeType?.color ?? "bg-gray-600"}`}
                      />
                      <span className="font-medium">{node.name}</span>
                      <span className="text-xs text-gray-500 font-mono">{node.type}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {node.angles && (
                        <span className="text-xs text-gray-500">{node.angles.length} angles</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNode(node.id);
                        }}
                        className="text-gray-600 hover:text-red-400 text-sm transition"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {nodes.length === 0 && (
              <div className="text-center text-gray-600 py-20">
                <p className="text-lg mb-2">No nodes yet</p>
                <p className="text-sm">Add nodes from the palette or load a template</p>
              </div>
            )}
          </div>
        </div>

        {/* Properties Panel */}
        <div className="col-span-3 border-l border-gray-800 p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase mb-3">Properties</h3>
          {selected ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  value={selected.name}
                  onChange={(e) => updateNode(selected.id, { name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <span className="text-sm font-mono text-gray-300">{selected.type}</span>
              </div>
              {selected.type === "generate" && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Angles</label>
                  <div className="space-y-1">
                    {AVAILABLE_ANGLES.map((angle) => (
                      <label key={angle} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.angles?.includes(angle) ?? false}
                          onChange={(e) => {
                            const current = selected.angles ?? [];
                            const updated = e.target.checked
                              ? [...current, angle]
                              : current.filter((a) => a !== angle);
                            updateNode(selected.id, { angles: updated });
                          }}
                          className="rounded"
                        />
                        {angle}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {selected.type === "filter" && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Min Feasibility</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={selected.filter?.minFeasibility ?? 0}
                      onChange={(e) =>
                        updateNode(selected.id, {
                          filter: { ...selected.filter, minFeasibility: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Min Impact</label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={selected.filter?.minImpact ?? 0}
                      onChange={(e) =>
                        updateNode(selected.id, {
                          filter: { ...selected.filter, minImpact: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Max Results</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={selected.filter?.maxResults ?? 10}
                      onChange={(e) =>
                        updateNode(selected.id, {
                          filter: { ...selected.filter, maxResults: Number(e.target.value) },
                        })
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.continueOnError ?? false}
                    onChange={(e) => updateNode(selected.id, { continueOnError: e.target.checked })}
                    className="rounded"
                  />
                  Continue on error
                </label>
              </div>
            </div>
          ) : (
            <p className="text-gray-600 text-sm">Select a node to edit properties</p>
          )}
        </div>
      </div>

      {/* Template Modal */}
      {showTemplates && (
        <div className="border-t border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Starter Templates</h3>
            <button
              onClick={() => setShowTemplates(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                id: "quick-ideation",
                name: "Quick Ideation Sprint",
                desc: "Fast 3-angle brainstorming",
                cat: "ideation",
              },
              {
                id: "deep-research",
                name: "Deep Research Pipeline",
                desc: "Comprehensive 8-angle analysis",
                cat: "research",
              },
              {
                id: "competitive-analysis",
                name: "Competitive Analysis",
                desc: "Find gaps and differentiators",
                cat: "strategy",
              },
              {
                id: "product-innovation",
                name: "Product Innovation",
                desc: "User-centered feature ideation",
                cat: "product",
              },
              {
                id: "moonshot-workshop",
                name: "Moonshot Workshop",
                desc: "Bold, paradigm-breaking ideas",
                cat: "moonshot",
              },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  // Load template nodes
                  const templateNodes: DAGNode[] = [
                    { id: "investigate", type: "investigate", name: "Investigation" },
                    {
                      id: "generate",
                      type: "generate",
                      name: "Generation",
                      angles: ["scamper", "first-principles"],
                    },
                    { id: "score", type: "score", name: "Scoring" },
                    { id: "filter", type: "filter", name: "Filter", filter: { maxResults: 10 } },
                    { id: "synthesize", type: "synthesize", name: "Synthesis" },
                  ];
                  const templateEdges: DAGEdge[] = [
                    { from: "investigate", to: "generate" },
                    { from: "generate", to: "score" },
                    { from: "score", to: "filter" },
                    { from: "filter", to: "synthesize" },
                  ];
                  setWorkflowName(t.name);
                  applyTemplate(templateNodes, templateEdges);
                }}
                className="text-left p-4 bg-gray-900 rounded-xl border border-gray-700 hover:border-blue-500 transition"
              >
                <h4 className="font-medium mb-1">{t.name}</h4>
                <p className="text-xs text-gray-400">{t.desc}</p>
                <span className="text-xs text-gray-600 mt-2 inline-block">{t.cat}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* YAML/JSON Output */}
      {yamlOutput && (
        <div className="border-t border-gray-800 p-6">
          <h3 className="text-sm font-semibold text-gray-400 mb-2">Workflow Configuration</h3>
          <pre className="bg-gray-900 rounded-lg p-4 text-sm text-green-300 overflow-auto max-h-60">
            {yamlOutput}
          </pre>
        </div>
      )}
    </div>
  );
}
