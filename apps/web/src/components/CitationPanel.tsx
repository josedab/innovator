/**
 * @description Panel for displaying and managing source citations linked to generated ideas.
 */
"use client";

import { useState } from "react";

interface Citation {
  id: string;
  sourceId: string;
  claim: string;
  sourceTitle: string;
  sourceUrl?: string;
  status: "verified" | "unverified" | "contradicted" | "pending";
  confidence: number;
  excerpt?: string;
  verifiedAt?: string;
}

interface CitationSource {
  id: string;
  type: string;
  title: string;
  url?: string;
  addedAt: string;
}

const STATUS_CONFIG = {
  verified: {
    icon: "✅",
    label: "Verified",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  unverified: {
    icon: "❓",
    label: "Unverified",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  contradicted: {
    icon: "❌",
    label: "Contradicted",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  pending: {
    icon: "⏳",
    label: "Pending",
    color: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

export default function CitationPanel({
  sessionId: _sessionId,
  citations,
  sources,
  onVerify,
  onAddSource,
}: {
  sessionId: string;
  citations: Citation[];
  sources: CitationSource[];
  onVerify?: (citationId: string) => void;
  onAddSource?: (source: { type: string; title: string; content: string; url?: string }) => void;
}) {
  const [activeTab, setActiveTab] = useState<"citations" | "sources">("citations");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceContent, setNewSourceContent] = useState("");
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);

  const handleAddSource = () => {
    if (!newSourceTitle || !newSourceContent) return;
    onAddSource?.({
      type: newSourceUrl ? "url" : "text",
      title: newSourceTitle,
      content: newSourceContent,
      url: newSourceUrl || undefined,
    });
    setNewSourceUrl("");
    setNewSourceTitle("");
    setNewSourceContent("");
  };

  const stats = {
    total: citations.length,
    verified: citations.filter((c) => c.status === "verified").length,
    unverified: citations.filter((c) => c.status === "unverified").length,
    contradicted: citations.filter((c) => c.status === "contradicted").length,
  };

  return (
    <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">📎 Citations & Sources</h3>
          <div className="flex gap-2 text-xs">
            <span className={STATUS_CONFIG.verified.color + " px-2 py-0.5 rounded-full"}>
              {stats.verified} verified
            </span>
            <span className={STATUS_CONFIG.unverified.color + " px-2 py-0.5 rounded-full"}>
              {stats.unverified} unverified
            </span>
            {stats.contradicted > 0 && (
              <span className={STATUS_CONFIG.contradicted.color + " px-2 py-0.5 rounded-full"}>
                {stats.contradicted} contradicted
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab("citations")}
            className={`px-3 py-1 rounded text-sm transition ${
              activeTab === "citations"
                ? "bg-blue-600 text-white"
                : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          >
            Citations ({citations.length})
          </button>
          <button
            onClick={() => setActiveTab("sources")}
            className={`px-3 py-1 rounded text-sm transition ${
              activeTab === "sources"
                ? "bg-blue-600 text-white"
                : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          >
            Sources ({sources.length})
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {activeTab === "citations" ? (
          citations.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-4">
              No citations yet. Add sources and run grounding to extract citations.
            </p>
          ) : (
            <div className="space-y-3">
              {citations.map((citation) => {
                const cfg = STATUS_CONFIG[citation.status];
                const isExpanded = expandedCitation === citation.id;
                return (
                  <div
                    key={citation.id}
                    className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                          <span className="text-xs text-neutral-400">
                            {Math.round(citation.confidence * 100)}% confidence
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2">{citation.claim}</p>
                        <p className="text-xs text-neutral-500 mt-1">
                          Source: {citation.sourceTitle}
                          {citation.sourceUrl && (
                            <a
                              href={citation.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 text-blue-500 hover:underline"
                            >
                              ↗
                            </a>
                          )}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => setExpandedCitation(isExpanded ? null : citation.id)}
                          className="text-xs px-2 py-1 rounded border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                        >
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                        <button
                          onClick={() => onVerify?.(citation.id)}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                        >
                          Verify
                        </button>
                      </div>
                    </div>
                    {isExpanded && citation.excerpt && (
                      <div className="mt-2 p-2 bg-neutral-50 dark:bg-neutral-800 rounded text-xs">
                        <p className="text-neutral-500 mb-1">Source excerpt:</p>
                        <p className="italic">&ldquo;{citation.excerpt}&rdquo;</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="space-y-4">
            {/* Add Source Form */}
            <div className="p-3 rounded-lg border border-dashed border-neutral-300 dark:border-neutral-600">
              <h4 className="text-sm font-medium mb-2">➕ Add Source</h4>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newSourceTitle}
                  onChange={(e) => setNewSourceTitle(e.target.value)}
                  placeholder="Source title..."
                  className="w-full px-3 py-2 border rounded text-sm dark:bg-neutral-800 dark:border-neutral-600"
                />
                <input
                  type="url"
                  value={newSourceUrl}
                  onChange={(e) => setNewSourceUrl(e.target.value)}
                  placeholder="URL (optional)..."
                  className="w-full px-3 py-2 border rounded text-sm dark:bg-neutral-800 dark:border-neutral-600"
                />
                <textarea
                  value={newSourceContent}
                  onChange={(e) => setNewSourceContent(e.target.value)}
                  placeholder="Paste source content or key claims..."
                  rows={3}
                  className="w-full px-3 py-2 border rounded text-sm dark:bg-neutral-800 dark:border-neutral-600 resize-none"
                />
                <button
                  onClick={handleAddSource}
                  disabled={!newSourceTitle || !newSourceContent}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  Add Source
                </button>
              </div>
            </div>

            {/* Source List */}
            {sources.map((source) => (
              <div
                key={source.id}
                className="p-3 rounded-lg border border-neutral-200 dark:border-neutral-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{source.title}</p>
                    <p className="text-xs text-neutral-500">
                      {source.type} • Added {new Date(source.addedAt).toLocaleDateString()}
                    </p>
                  </div>
                  {source.url && (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-500 hover:underline"
                    >
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
