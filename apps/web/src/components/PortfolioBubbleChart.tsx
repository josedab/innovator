/**
 * @description Portfolio Bubble Chart — interactive visualization of innovation tracks
 * plotted by impact (x) vs progress (y) with horizon-based coloring.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface BubbleItem {
  id: string;
  title: string;
  x: number;
  y: number;
  size: number;
  color: string;
  horizon: string;
  stage: string;
  label: string;
}

interface ScorecardData {
  scorecard: {
    horizons: Record<
      string,
      { count: number; percentage: number; targetPercentage: number; gap: number }
    >;
    overallBalance: number;
  };
  risk: { expectedValue: number; successProbability: number; valueAtRisk95: number };
  recommendations: Array<{ title: string; description: string; impact: string }>;
}

type View = "bubble" | "scorecard" | "report";

export default function PortfolioBubbleChart() {
  const [view, setView] = useState<View>("bubble");
  const [bubbles, setBubbles] = useState<BubbleItem[]>([]);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [selectedBubble, setSelectedBubble] = useState<BubbleItem | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [bubbleRes, scRes] = await Promise.all([
        fetch("/api/portfolio?view=bubble-chart"),
        fetch("/api/portfolio?view=scorecard"),
      ]);
      if (bubbleRes.ok) {
        const data = await bubbleRes.json();
        setBubbles(data.bubbles ?? []);
      }
      if (scRes.ok) {
        const data = await scRes.json();
        setScorecard(data);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchData();
    });
  }, [fetchData]);

  const handleBoardReport = useCallback(async () => {
    const res = await fetch("/api/portfolio?view=board-report&format=markdown");
    if (res.ok) {
      setReportMarkdown(await res.text());
      setView("report");
    }
  }, []);

  if (loading) return <div className="p-6 text-center">Loading portfolio…</div>;

  const horizonLabels: Record<string, string> = {
    "h1-core": "🟦 H1 Core",
    "h2-adjacent": "🟨 H2 Adjacent",
    "h3-transformational": "🟥 H3 Transformational",
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Innovation Portfolio Map</h2>
        <div className="flex gap-2">
          {(["bubble", "scorecard", "report"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => (v === "report" ? handleBoardReport() : setView(v))}
              className={`px-3 py-1 rounded text-sm ${view === v ? "bg-blue-100 font-semibold" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {v === "bubble" ? "📊 Map" : v === "scorecard" ? "📋 Scorecard" : "📄 Board Report"}
            </button>
          ))}
        </div>
      </div>

      {/* Bubble Chart */}
      {view === "bubble" && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            {Object.entries(horizonLabels).map(([key, label]) => (
              <span key={key}>
                {label} ({bubbles.filter((b) => b.horizon === key).length})
              </span>
            ))}
          </div>

          {bubbles.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">
              No portfolio items yet. Add ideas to see the portfolio map.
            </p>
          ) : (
            <div className="relative bg-gray-50 border rounded-lg" style={{ height: 400 }}>
              <div className="absolute bottom-0 left-12 right-4 text-center text-xs text-gray-400">
                Impact →
              </div>
              <div
                className="absolute left-0 top-0 bottom-12 flex items-center text-xs text-gray-400"
                style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
              >
                Progress →
              </div>
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  className="absolute rounded-full cursor-pointer transition-transform hover:scale-110"
                  style={{
                    left: `${(b.x / 10) * 85 + 8}%`,
                    bottom: `${b.y * 85 + 8}%`,
                    width: b.size,
                    height: b.size,
                    backgroundColor: b.color,
                    opacity: 0.75,
                  }}
                  title={`${b.title} (${b.stage})`}
                  onClick={() => setSelectedBubble(b)}
                />
              ))}
            </div>
          )}

          {selectedBubble && (
            <div className="bg-white border rounded-lg p-4 shadow">
              <div className="flex justify-between">
                <h3 className="font-semibold">{selectedBubble.title}</h3>
                <button
                  onClick={() => setSelectedBubble(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                <div>
                  <span className="text-gray-500">Stage:</span> {selectedBubble.stage}
                </div>
                <div>
                  <span className="text-gray-500">Horizon:</span> {selectedBubble.horizon}
                </div>
                <div>
                  <span className="text-gray-500">Impact:</span> {selectedBubble.x}/10
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scorecard */}
      {view === "scorecard" && scorecard && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border rounded-lg p-4">
              <div className="text-sm text-gray-500">Balance Score</div>
              <div className="text-2xl font-bold">
                {Math.round(scorecard.scorecard.overallBalance * 100)}%
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-sm text-gray-500">Success Probability</div>
              <div className="text-2xl font-bold">
                {Math.round(scorecard.risk.successProbability * 100)}%
              </div>
            </div>
            <div className="bg-white border rounded-lg p-4">
              <div className="text-sm text-gray-500">Value at Risk (95%)</div>
              <div className="text-2xl font-bold">{scorecard.risk.valueAtRisk95.toFixed(0)}</div>
            </div>
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="p-2 text-left">Horizon</th>
                <th className="p-2">Actual</th>
                <th className="p-2">Target</th>
                <th className="p-2">Gap</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(scorecard.scorecard.horizons).map(([h, d]) => (
                <tr key={h} className="border-t">
                  <td className="p-2">{horizonLabels[h] ?? h}</td>
                  <td className="p-2 text-center">{Math.round(d.percentage * 100)}%</td>
                  <td className="p-2 text-center">{Math.round(d.targetPercentage * 100)}%</td>
                  <td
                    className="p-2 text-center"
                    style={{ color: Math.abs(d.gap) > 0.1 ? "#dc2626" : "#16a34a" }}
                  >
                    {d.gap > 0 ? "+" : ""}
                    {Math.round(d.gap * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {scorecard.recommendations.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Recommendations</h3>
              <ul className="space-y-1">
                {scorecard.recommendations.map((r, i) => (
                  <li key={i} className="text-sm">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs mr-2 ${r.impact === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}
                    >
                      {r.impact}
                    </span>
                    <strong>{r.title}:</strong> {r.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Board Report */}
      {view === "report" && (
        <div className="space-y-4">
          <pre className="bg-white border rounded-lg p-4 whitespace-pre-wrap text-sm font-mono overflow-auto max-h-96">
            {reportMarkdown}
          </pre>
          <button
            onClick={() => {
              const blob = new Blob([reportMarkdown], { type: "text/markdown" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "board-report.md";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Download Board Report
          </button>
        </div>
      )}
    </div>
  );
}
