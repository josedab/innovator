/**
 * @description Version diff view for comparing changes between idea iterations or evolution steps.
 */
"use client";

import { useState } from "react";
import type {
  IdeaVersion,
  SideBySideComparison,
  SideBySideField,
  TimelineEntry,
} from "@innovator/core/types";

interface VersionDiffViewProps {
  ideaId: string;
  versions: IdeaVersion[];
  comparison?: SideBySideComparison;
  timeline?: TimelineEntry[];
}

type Tab = "timeline" | "side-by-side" | "branches";

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function DiffSegment({ type, value }: { type: "equal" | "added" | "removed"; value: string }) {
  if (type === "added") return <span className="bg-green-100 text-green-800">{value}</span>;
  if (type === "removed")
    return <span className="bg-red-100 text-red-800 line-through">{value}</span>;
  return <span>{value}</span>;
}

function TimelineTab({ timeline }: { timeline: TimelineEntry[] }) {
  if (timeline.length === 0) {
    return <p className="text-sm text-gray-500">No timeline entries available.</p>;
  }
  return (
    <ol
      className="relative border-l-2 border-gray-200 ml-4 space-y-4"
      aria-label="Version timeline"
    >
      {timeline.map((entry) => (
        <li key={entry.versionId} className="ml-4">
          <div className="absolute -left-[9px] w-4 h-4 rounded-full border-2 border-white bg-blue-500" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
              {entry.branchName}
            </span>
            {entry.isMerge && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                merge
              </span>
            )}
            <span className="text-xs text-gray-400">{timeAgo(entry.timestamp)}</span>
          </div>
          {entry.author && <p className="text-xs text-gray-500 mt-0.5">by {entry.author}</p>}
          {entry.message && (
            <p className="text-sm text-gray-700 mt-1 truncate max-w-md">{entry.message}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

function SideBySideTab({ comparison }: { comparison: SideBySideComparison }) {
  return (
    <div className="space-y-3" aria-label="Side-by-side comparison">
      <div className="grid grid-cols-2 gap-4 text-xs font-mono text-gray-500 border-b pb-1">
        <span className="truncate">{comparison.versionIdA}</span>
        <span className="truncate">{comparison.versionIdB}</span>
      </div>
      {comparison.fields.map((f: SideBySideField) => (
        <div key={f.field} className="border rounded p-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">{f.field}</h4>
          {!f.changed ? (
            <p className="text-sm text-gray-600">{f.valueA || "—"}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div
                className="text-sm bg-red-50 rounded p-2 whitespace-pre-wrap"
                aria-label={`${f.field} version A`}
              >
                {f.valueA || "—"}
              </div>
              <div
                className="text-sm bg-green-50 rounded p-2 whitespace-pre-wrap"
                aria-label={`${f.field} version B`}
              >
                {f.diff.map((seg, i) => (
                  <DiffSegment key={i} type={seg.type} value={seg.value} />
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BranchesTab({ versions }: { versions: IdeaVersion[] }) {
  const branches = new Map<string, IdeaVersion[]>();
  for (const v of versions) {
    const list = branches.get(v.branchName) ?? [];
    list.push(v);
    branches.set(v.branchName, list);
  }

  return (
    <ul className="space-y-2" aria-label="Branch list">
      {Array.from(branches.entries()).map(([name, branchVersions]) => {
        const head = branchVersions[branchVersions.length - 1];
        return (
          <li key={name} className="flex items-center justify-between border rounded p-3">
            <div>
              <span className="font-medium text-sm">{name}</span>
              <p className="text-xs text-gray-500 truncate max-w-xs">{head.title}</p>
            </div>
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded-full">
              {branchVersions.length} version{branchVersions.length !== 1 ? "s" : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const TABS: { id: Tab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "side-by-side", label: "Side-by-Side" },
  { id: "branches", label: "Branches" },
];

export default function VersionDiffView({
  ideaId,
  versions,
  comparison,
  timeline,
}: VersionDiffViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("timeline");

  return (
    <section className="border rounded-lg p-4 my-4" aria-label={`Version diff for idea ${ideaId}`}>
      <h3 className="text-lg font-semibold mb-3">🔀 Version Comparison</h3>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4" role="tablist" aria-label="Diff view tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
              activeTab === tab.id
                ? "bg-white border border-b-white -mb-px text-blue-600"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div role="tabpanel" aria-label={`${activeTab} panel`}>
        {activeTab === "timeline" && <TimelineTab timeline={timeline ?? []} />}
        {activeTab === "side-by-side" &&
          (comparison ? (
            <SideBySideTab comparison={comparison} />
          ) : (
            <p className="text-sm text-gray-500">Select two versions to compare.</p>
          ))}
        {activeTab === "branches" && <BranchesTab versions={versions} />}
      </div>
    </section>
  );
}
