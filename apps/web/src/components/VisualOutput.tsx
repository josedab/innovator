/**
 * @description Visual output component for rendering Mermaid diagrams, idea maps,
 * comparison charts, and export options.
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ---- Types ----

interface VisualArtifact {
  id: string;
  type: "chart" | "diagram" | "mindmap" | "matrix";
  format: "mermaid" | "svg" | "json";
  content: string;
  title: string;
  metadata?: Record<string, unknown>;
}

interface IdeaNode {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  angle: string;
  score: number;
  connections: string[];
}

interface IdeaMapData {
  nodes: IdeaNode[];
  width: number;
  height: number;
  title: string;
}

interface ChartDataPoint {
  label: string;
  value: number;
  color: string;
}

interface VisualOutputProps {
  artifacts: VisualArtifact[];
  className?: string;
}

// ---- Subcomponents ----

function MermaidRenderer({ content, title }: { content: string; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function renderMermaid() {
      if (!containerRef.current) return;

      try {
        // Dynamically import mermaid for client-side rendering (optional dependency)
        const mermaid = (await import(/* webpackIgnore: true */ "mermaid" as string)).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
        });

        const { svg } = await mermaid.render(
          `mermaid-${Date.now()}`,
          content
        );

        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setRendered(true);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to render diagram. Showing raw syntax.");
        }
      }
    }

    renderMermaid();
    return () => { cancelled = true; };
  }, [content]);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</h4>
      <div
        ref={containerRef}
        className="p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 overflow-auto"
      >
        {!rendered && !error && (
          <div className="text-sm text-neutral-400 animate-pulse">Rendering diagram…</div>
        )}
      </div>
      {error && (
        <pre className="p-3 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 overflow-auto whitespace-pre-wrap">
          {content}
        </pre>
      )}
    </div>
  );
}

function IdeaMapRenderer({ data, title }: { data: IdeaMapData; title: string }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</h4>
      <div
        className="relative rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 overflow-hidden"
        style={{ width: "100%", height: `${Math.min(data.height, 500)}px` }}
      >
        {data.nodes.map((node) => {
          const scaledX = (node.x / data.width) * 100;
          const scaledY = (node.y / data.height) * 100;

          return (
            <div
              key={node.id}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 transition-all hover:scale-110 hover:z-10"
              style={{
                left: `${scaledX}%`,
                top: `${scaledY}%`,
              }}
            >
              <div
                className="rounded-xl p-2 shadow-md border border-neutral-200 dark:border-neutral-700 cursor-default"
                style={{
                  backgroundColor: `${node.color}20`,
                  borderColor: node.color,
                  minWidth: `${node.size * 2}px`,
                  maxWidth: "160px",
                }}
              >
                <p
                  className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate text-center"
                  title={node.label}
                >
                  {node.label}
                </p>
                <p className="text-[10px] text-neutral-500 dark:text-neutral-400 text-center mt-0.5">
                  {node.angle} · {(node.score * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComparisonChartRenderer({
  data,
  title,
}: {
  data: ChartDataPoint[];
  title: string;
}) {
  const maxValue = Math.max(...data.map((d) => d.value), 0.01);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{title}</h4>
      <div className="space-y-2 p-4 rounded-lg bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700">
        {data.map((point, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-neutral-600 dark:text-neutral-400 w-32 truncate text-right">
              {point.label}
            </span>
            <div className="flex-1 h-6 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${(point.value / maxValue) * 100}%`,
                  backgroundColor: point.color,
                }}
              />
            </div>
            <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 w-12 text-right">
              {(point.value * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Tab types ----

type TabId = "diagrams" | "ideamaps" | "charts" | "exports";

const TAB_CONFIG: { id: TabId; label: string; icon: string }[] = [
  { id: "diagrams", label: "Diagrams", icon: "📊" },
  { id: "ideamaps", label: "Idea Maps", icon: "🗺️" },
  { id: "charts", label: "Charts", icon: "📈" },
  { id: "exports", label: "Export", icon: "📤" },
];

// ---- Main Component ----

export function VisualOutput({ artifacts, className = "" }: VisualOutputProps) {
  const [activeTab, setActiveTab] = useState<TabId>("diagrams");
  const [exporting, setExporting] = useState(false);

  const diagrams = artifacts.filter((a) => a.format === "mermaid");
  const ideaMaps = artifacts.filter(
    (a) => a.format === "json" && (a.type === "mindmap" || a.metadata?.nodeCount)
  );
  const charts = artifacts.filter(
    (a) => a.format === "json" && a.type === "chart"
  );

  // ---- Export handlers ----

  const handleExport = useCallback(
    async (format: "figma" | "miro" | "svg") => {
      setExporting(true);
      try {
        if (format === "svg") {
          // Export Mermaid diagrams as SVG by extracting rendered SVG from DOM
          const svgElements = document.querySelectorAll("[data-mermaid-svg]");
          if (svgElements.length === 0) {
            const svgContent = diagrams.map((d) => d.content).join("\n\n");
            downloadText(svgContent, "innovation-diagrams.txt", "text/plain");
          } else {
            const svgContent = Array.from(svgElements)
              .map((el) => el.outerHTML)
              .join("\n");
            downloadText(svgContent, "innovation-diagrams.svg", "image/svg+xml");
          }
          return;
        }

        const action = format === "figma" ? "export_figma" : "export_miro";
        const response = await fetch("/api/visual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, artifacts }),
        });

        if (!response.ok) throw new Error("Export failed");

        const data = (await response.json()) as { export: Record<string, unknown> };
        const blob = new Blob([JSON.stringify(data.export, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `innovation-${format}-export.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // Export failed silently
      } finally {
        setExporting(false);
      }
    },
    [artifacts, diagrams]
  );

  if (artifacts.length === 0) {
    return (
      <div className={`p-8 text-center rounded-xl border border-neutral-200 dark:border-neutral-700 ${className}`}>
        <div className="text-4xl mb-2">📊</div>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No visualizations generated yet. Run an investigation to see results.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-neutral-100 dark:bg-neutral-800">
        {TAB_CONFIG.map((tab) => {
          const count =
            tab.id === "diagrams"
              ? diagrams.length
              : tab.id === "ideamaps"
                ? ideaMaps.length
                : tab.id === "charts"
                  ? charts.length
                  : artifacts.length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition
                ${
                  activeTab === tab.id
                    ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 shadow-sm"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300"
                }
              `}
            >
              <span>{tab.icon}</span>
              {tab.label}
              {count > 0 && tab.id !== "exports" && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-[10px]">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="min-h-[200px]">
        {activeTab === "diagrams" && (
          <div className="space-y-6">
            {diagrams.length === 0 ? (
              <EmptyState message="No diagrams generated" />
            ) : (
              diagrams.map((artifact) => (
                <MermaidRenderer
                  key={artifact.id}
                  content={artifact.content}
                  title={artifact.title}
                />
              ))
            )}
          </div>
        )}

        {activeTab === "ideamaps" && (
          <div className="space-y-6">
            {ideaMaps.length === 0 ? (
              <EmptyState message="No idea maps generated" />
            ) : (
              ideaMaps.map((artifact) => {
                try {
                  const data = JSON.parse(artifact.content) as IdeaMapData;
                  return (
                    <IdeaMapRenderer
                      key={artifact.id}
                      data={data}
                      title={artifact.title}
                    />
                  );
                } catch {
                  return null;
                }
              })
            )}
          </div>
        )}

        {activeTab === "charts" && (
          <div className="space-y-6">
            {charts.length === 0 ? (
              <EmptyState message="No charts generated" />
            ) : (
              charts.map((artifact) => {
                try {
                  const data = JSON.parse(artifact.content) as ChartDataPoint[];
                  if (!Array.isArray(data)) return null;
                  return (
                    <ComparisonChartRenderer
                      key={artifact.id}
                      data={data}
                      title={artifact.title}
                    />
                  );
                } catch {
                  return null;
                }
              })
            )}
          </div>
        )}

        {activeTab === "exports" && (
          <div className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/50">
            <h4 className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-4">
              Export Visualizations
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ExportButton
                icon="🎨"
                label="Figma JSON"
                description="Import into Figma as frames"
                onClick={() => handleExport("figma")}
                disabled={exporting}
              />
              <ExportButton
                icon="📋"
                label="Miro Board"
                description="Import as Miro widgets"
                onClick={() => handleExport("miro")}
                disabled={exporting}
              />
              <ExportButton
                icon="🖼️"
                label="SVG Export"
                description="Download as SVG file"
                onClick={() => handleExport("svg")}
                disabled={exporting}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Helper Components ----

function EmptyState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-neutral-400 dark:text-neutral-500">{message}</p>
    </div>
  );
}

function ExportButton({
  icon,
  label,
  description,
  onClick,
  disabled,
}: {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-purple-400 dark:hover:border-purple-500 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{label}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{description}</p>
    </button>
  );
}

// ---- Utilities ----

function downloadText(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
