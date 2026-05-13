/**
 * @description Browse, search, and install industry vertical packs for domain-specific innovation.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

// ---- Types (client-safe, no core imports) ----

interface PackMetadata {
  tags: string[];
  icon: string;
  color: string;
}

interface PackSummary {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  angleCount: number;
  complianceRuleCount: number;
  glossaryTermCount: number;
  metadata: PackMetadata;
  installed: boolean;
}

interface PackAngle {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

interface RubricCriterion {
  name: string;
  description: string;
  weight: number;
}

interface ComplianceRule {
  id: string;
  name: string;
  regulation: string;
  severity: string;
  description: string;
}

interface PackDetail {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  domainAngles: PackAngle[];
  evaluationRubrics: Array<{
    id: string;
    name: string;
    criteria: RubricCriterion[];
    passingScore: number;
  }>;
  complianceRules: ComplianceRule[];
  glossary: Record<string, string>;
  metadata: PackMetadata;
}

type DomainFilter = "all" | "healthcare" | "fintech" | "climate";
type TabView = "browse" | "community";

/**
 * Vertical Pack Browser — grid of industry vertical packs with search,
 * filtering, expand-to-details, and install/activate actions.
 */
export function VerticalPackBrowser() {
  const [packs, setPacks] = useState<PackSummary[]>([]);
  const [expandedPack, setExpandedPack] = useState<PackDetail | null>(null);
  const [expandedInstalled, setExpandedInstalled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [domainFilter, setDomainFilter] = useState<DomainFilter>("all");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabView>("browse");
  const [installing, setInstalling] = useState<string | null>(null);

  const fetchPacks = useCallback(async () => {
    setLoading(true);
    try {
      const body: Record<string, string> = { action: "list" };
      if (search) body.search = search;
      if (domainFilter !== "all") body.tag = domainFilter;
      const res = await fetch("/api/verticals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setPacks(data.packs ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [search, domainFilter]);

  useEffect(() => {
    fetchPacks();
  }, [fetchPacks]);

  const handleExpand = async (packId: string) => {
    if (expandedPack?.id === packId) {
      setExpandedPack(null);
      return;
    }
    const res = await fetch("/api/verticals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", packId }),
    });
    if (res.ok) {
      const data = await res.json();
      setExpandedPack(data.pack);
      setExpandedInstalled(data.installed ?? false);
    }
  };

  const handleInstall = async (packId: string) => {
    setInstalling(packId);
    try {
      const res = await fetch("/api/verticals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", packId }),
      });
      if (res.ok) {
        setPacks((prev) =>
          prev.map((p) => (p.id === packId ? { ...p, installed: true } : p))
        );
        if (expandedPack?.id === packId) {
          setExpandedInstalled(true);
        }
      }
    } finally {
      setInstalling(null);
    }
  };

  const domainFilters: { label: string; value: DomainFilter }[] = [
    { label: "All", value: "all" },
    { label: "🏥 Healthcare", value: "healthcare" },
    { label: "💰 Fintech", value: "fintech" },
    { label: "🌍 Climate", value: "climate" },
  ];

  const severityColor: Record<string, string> = {
    critical: "text-red-400",
    high: "text-orange-400",
    medium: "text-yellow-400",
    low: "text-green-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neutral-100">
          Industry Vertical Packs
        </h2>
        <div className="flex gap-2">
          {(["browse", "community"] as TabView[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {t === "browse" ? "Browse Packs" : "Community"}
            </button>
          ))}
        </div>
      </div>

      {tab === "community" ? (
        <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-8 text-center">
          <p className="text-4xl mb-4">🌐</p>
          <h3 className="text-lg font-semibold text-neutral-200 mb-2">
            Community Packs — Coming Soon
          </h3>
          <p className="text-neutral-400 text-sm max-w-md mx-auto">
            Share your industry-specific vertical packs with the community.
            Submit domain angles, rubrics, and compliance rules for peer review.
          </p>
        </div>
      ) : (
        <>
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Search packs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-4 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-100 placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              {domainFilters.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setDomainFilter(f.value)}
                  className={`px-3 py-2 rounded-lg text-sm transition ${
                    domainFilter === f.value
                      ? "bg-blue-600 text-white"
                      : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pack Grid */}
          {loading ? (
            <div className="text-center py-12 text-neutral-500">
              Loading packs...
            </div>
          ) : packs.length === 0 ? (
            <div className="text-center py-12 text-neutral-500">
              No packs found matching your criteria.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {packs.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => handleExpand(pack.id)}
                  aria-label={`View ${pack.name} details`}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    expandedPack?.id === pack.id
                      ? "border-blue-500 bg-neutral-800/80 shadow-lg shadow-blue-500/10"
                      : "border-neutral-700 bg-neutral-900 hover:border-neutral-600 hover:bg-neutral-800/50"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-3xl">{pack.metadata.icon}</span>
                    {pack.installed && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/50 text-green-400 border border-green-800">
                        Installed
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-100 mb-1">
                    {pack.name}
                  </h3>
                  <p className="text-sm text-neutral-400 mb-3 line-clamp-2">
                    {pack.description}
                  </p>
                  <div className="flex gap-3 text-xs text-neutral-500">
                    <span>{pack.angleCount} angles</span>
                    <span>•</span>
                    <span>{pack.complianceRuleCount} rules</span>
                    <span>•</span>
                    <span>{pack.glossaryTermCount} terms</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Expanded Detail View */}
          {expandedPack && (
            <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-6 space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-neutral-100 flex items-center gap-2">
                    <span className="text-2xl">{expandedPack.metadata.icon}</span>
                    {expandedPack.name}
                    <span className="text-xs text-neutral-500 font-normal">
                      v{expandedPack.version}
                    </span>
                  </h3>
                  <p className="text-sm text-neutral-400 mt-1">
                    {expandedPack.description}
                  </p>
                </div>
                <button
                  onClick={() => handleInstall(expandedPack.id)}
                  disabled={expandedInstalled || installing === expandedPack.id}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    expandedInstalled
                      ? "bg-green-900/40 text-green-400 border border-green-800 cursor-default"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  }`}
                >
                  {expandedInstalled
                    ? "✓ Installed"
                    : installing === expandedPack.id
                    ? "Installing..."
                    : "Install Pack"}
                </button>
              </div>

              {/* Domain Angles */}
              <section>
                <h4 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide mb-3">
                  Domain Angles
                </h4>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {expandedPack.domainAngles.map((angle) => (
                    <div
                      key={angle.id}
                      className="p-3 rounded-lg bg-neutral-800 border border-neutral-700"
                    >
                      <p className="font-medium text-sm text-neutral-200">
                        {angle.icon && <span className="mr-1">{angle.icon}</span>}
                        {angle.name}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1 line-clamp-2">
                        {angle.description}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Evaluation Rubric */}
              {expandedPack.evaluationRubrics.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide mb-3">
                    Evaluation Rubric
                  </h4>
                  {expandedPack.evaluationRubrics.map((rubric) => (
                    <div key={rubric.id} className="space-y-2">
                      <p className="text-sm text-neutral-400">
                        {rubric.name} — passing score: {rubric.passingScore}/10
                      </p>
                      <div className="space-y-1">
                        {rubric.criteria.map((c) => (
                          <div
                            key={c.name}
                            className="flex items-center justify-between p-2 rounded bg-neutral-800 border border-neutral-700"
                          >
                            <span className="text-sm text-neutral-200">{c.name}</span>
                            <span className="text-xs text-blue-400 font-mono">
                              {(c.weight * 100).toFixed(0)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Compliance Rules */}
              {expandedPack.complianceRules.length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide mb-3">
                    Compliance Rules
                  </h4>
                  <div className="space-y-2">
                    {expandedPack.complianceRules.map((rule) => (
                      <div
                        key={rule.id}
                        className="p-3 rounded-lg bg-neutral-800 border border-neutral-700"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-neutral-200">
                            {rule.name}
                          </span>
                          <span
                            className={`text-xs font-mono uppercase ${
                              severityColor[rule.severity] ?? "text-neutral-500"
                            }`}
                          >
                            {rule.severity}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500">
                          {rule.regulation}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Glossary Preview */}
              {Object.keys(expandedPack.glossary).length > 0 && (
                <section>
                  <h4 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide mb-3">
                    Domain Glossary ({Object.keys(expandedPack.glossary).length} terms)
                  </h4>
                  <div className="grid sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                    {Object.entries(expandedPack.glossary)
                      .slice(0, 12)
                      .map(([term, definition]) => (
                        <div
                          key={term}
                          className="p-2 rounded bg-neutral-800 border border-neutral-700"
                        >
                          <span className="text-xs font-semibold text-blue-400">
                            {term}
                          </span>
                          <p className="text-xs text-neutral-500 mt-0.5 line-clamp-2">
                            {definition}
                          </p>
                        </div>
                      ))}
                  </div>
                  {Object.keys(expandedPack.glossary).length > 12 && (
                    <p className="text-xs text-neutral-600 mt-2">
                      + {Object.keys(expandedPack.glossary).length - 12} more terms
                    </p>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
