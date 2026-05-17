/**
 * @description Sentinel Batch Approval Panel — review and approve/reject multiple
 * sentinel automation actions at once with suggested decisions.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface BatchReviewItem {
  approval: {
    id: string;
    ruleId: string;
    ruleName: string;
    signalId: string;
    signalTitle: string;
    proposedActions: Array<{ type: string }>;
    status: string;
    requestedAt: string;
  };
  signal: { id: string; title: string; relevanceScore: number };
  rule: { id: string; name: string; priority: number };
  suggestedDecision: "approve" | "reject";
  reason: string;
}

interface ConversionStage {
  stage: string;
  count: number;
  conversionRate: number;
}

type View = "approvals" | "funnel" | "rules";

export default function SentinelBatchApproval() {
  const [view, setView] = useState<View>("approvals");
  const [items, setItems] = useState<BatchReviewItem[]>([]);
  const [funnel, setFunnel] = useState<ConversionStage[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [appRes, funnelRes] = await Promise.all([
        fetch("/api/sentinel?view=pending-approvals"),
        fetch("/api/sentinel?view=conversion-funnel"),
      ]);
      if (appRes.ok) {
        const data = await appRes.json();
        setItems(data.items ?? []);
      }
      if (funnelRes.ok) {
        const data = await funnelRes.json();
        setFunnel(data.funnel ?? []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBatchDecision = useCallback(
    async (decision: "approved" | "rejected") => {
      if (selected.size === 0) return;
      await fetch("/api/sentinel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "batch-review",
          approvalIds: Array.from(selected),
          decision,
        }),
      });
      setSelected(new Set());
      fetchData();
    },
    [selected, fetchData]
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.approval.id)));
    }
  };

  if (loading) return <div className="p-6 text-center">Loading sentinel data…</div>;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold">🛡 Sentinel Automation</h2>

      <div className="flex gap-2 border-b pb-2">
        {(["approvals", "funnel", "rules"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded-t text-sm ${view === v ? "bg-blue-100 font-semibold" : "text-gray-600"}`}
          >
            {v === "approvals"
              ? `📋 Approvals (${items.length})`
              : v === "funnel"
                ? "📊 Conversion Funnel"
                : "⚙ Rules"}
          </button>
        ))}
      </div>

      {/* Batch Approvals */}
      {view === "approvals" && (
        <div className="space-y-4">
          {items.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No pending approvals.</p>
          ) : (
            <>
              <div className="flex justify-between items-center">
                <button onClick={selectAll} className="text-sm text-blue-600 hover:underline">
                  {selected.size === items.length ? "Deselect All" : "Select All"}
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleBatchDecision("approved")}
                    disabled={selected.size === 0}
                    className="bg-green-600 text-white px-3 py-1 rounded text-sm disabled:opacity-40"
                  >
                    ✓ Approve ({selected.size})
                  </button>
                  <button
                    onClick={() => handleBatchDecision("rejected")}
                    disabled={selected.size === 0}
                    className="bg-red-600 text-white px-3 py-1 rounded text-sm disabled:opacity-40"
                  >
                    ✗ Reject ({selected.size})
                  </button>
                </div>
              </div>

              {items.map((item) => (
                <div
                  key={item.approval.id}
                  className={`border rounded-lg p-4 ${selected.has(item.approval.id) ? "border-blue-400 bg-blue-50" : "bg-white"}`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selected.has(item.approval.id)}
                      onChange={() => toggleSelect(item.approval.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">{item.approval.signalTitle}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        Rule: {item.rule.name} (priority: {item.rule.priority}) • Actions:{" "}
                        {item.approval.proposedActions.map((a) => a.type).join(", ")}
                      </div>
                      <div className="text-sm mt-2">
                        <span
                          className={`px-2 py-0.5 rounded text-xs ${item.suggestedDecision === "approve" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                        >
                          AI suggests: {item.suggestedDecision}
                        </span>
                        <span className="text-gray-500 ml-2">{item.reason}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Conversion Funnel */}
      {view === "funnel" && (
        <div className="space-y-3">
          <h3 className="font-semibold">Signal → Idea Conversion Funnel</h3>
          {funnel.length === 0 ? (
            <p className="text-gray-500">No conversion data yet.</p>
          ) : (
            <div className="space-y-2">
              {funnel.map((stage, _i) => {
                const maxCount = Math.max(...funnel.map((s) => s.count), 1);
                const widthPct = Math.max(5, (stage.count / maxCount) * 100);
                return (
                  <div key={stage.stage} className="flex items-center gap-3">
                    <span className="text-sm w-40 text-right">{stage.stage}</span>
                    <div className="flex-1">
                      <div
                        className="bg-blue-500 rounded h-6 flex items-center px-2"
                        style={{ width: `${widthPct}%` }}
                      >
                        <span className="text-white text-xs font-bold">{stage.count}</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 w-16">
                      {Math.round(stage.conversionRate * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
