"use client";

import { useState, useMemo } from "react";

interface RunRecord {
  id: string;
  subject: string;
  model?: string;
  angles: string[];
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

interface TimelineSnapshot {
  id: string;
  runId: string;
  stage: string;
  angleId?: string;
  timestamp: string;
  promptIndex: number;
}

interface BranchInfo {
  id: string;
  parentRunId: string;
  parentSnapshotId: string;
  branchedAt: string;
  label?: string;
  runId?: string;
}

export default function ReplayPage() {
  const [runs] = useState<RunRecord[]>([]);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineSnapshot[]>([]);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [scrubberIndex, setScrubberIndex] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareRunId, setCompareRunId] = useState<string | null>(null);

  const currentSnapshot = useMemo(() => timeline[scrubberIndex], [timeline, scrubberIndex]);

  const stageColors: Record<string, string> = {
    investigation: "#3B82F6",
    generation: "#10B981",
    synthesis: "#F59E0B",
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Innovation Replay</h1>
            <p className="text-sm text-gray-500 mt-1">
              Browse past sessions, scrub through timelines, and branch from any point
            </p>
          </div>
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              compareMode
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600"
            }`}
          >
            {compareMode ? "Exit Compare" : "Compare Branches"}
          </button>
        </div>

        {/* Session List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Sessions ({runs.length})
            </h2>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {runs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <p className="text-lg mb-2">No recorded sessions yet</p>
                <p className="text-sm">
                  Run an innovation pipeline to start recording replayable sessions.
                </p>
              </div>
            ) : (
              runs.map((run) => (
                <button
                  key={run.id}
                  onClick={() => {
                    setSelectedRun(run.id);
                    setScrubberIndex(0);
                  }}
                  className={`w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                    selectedRun === run.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {run.subject}
                      </span>
                      <div className="flex gap-2 mt-1">
                        {run.angles.slice(0, 3).map((angle) => (
                          <span
                            key={angle}
                            className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400"
                          >
                            {angle}
                          </span>
                        ))}
                        {run.angles.length > 3 && (
                          <span className="text-xs text-gray-400">
                            +{run.angles.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <div>{new Date(run.createdAt).toLocaleDateString()}</div>
                      {run.model && <div className="text-xs">{run.model}</div>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Timeline Scrubber */}
        {selectedRun && timeline.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Timeline</h2>

            {/* Scrubber */}
            <div className="relative mb-6">
              <input
                type="range"
                min={0}
                max={timeline.length - 1}
                value={scrubberIndex}
                onChange={(e) => setScrubberIndex(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
              />
              <div className="flex justify-between mt-2">
                {timeline.map((snap, i) => (
                  <button
                    key={snap.id}
                    onClick={() => setScrubberIndex(i)}
                    className="flex flex-col items-center"
                    title={`${snap.stage}${snap.angleId ? ` (${snap.angleId})` : ""}`}
                  >
                    <div
                      className={`w-3 h-3 rounded-full transition-transform ${
                        i === scrubberIndex ? "scale-150 ring-2 ring-offset-2 ring-blue-500" : ""
                      }`}
                      style={{ backgroundColor: stageColors[snap.stage] ?? "#6B7280" }}
                    />
                    <span className="text-[10px] text-gray-400 mt-1">{snap.stage.slice(0, 3)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Current Snapshot Info */}
            {currentSnapshot && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="px-3 py-1 rounded-full text-sm font-medium text-white"
                    style={{ backgroundColor: stageColors[currentSnapshot.stage] ?? "#6B7280" }}
                  >
                    {currentSnapshot.stage}
                  </span>
                  <span className="text-sm text-gray-500">
                    Step {currentSnapshot.promptIndex + 1} of {timeline.length}
                  </span>
                </div>
                {currentSnapshot.angleId && (
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Angle: {currentSnapshot.angleId}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(currentSnapshot.timestamp).toLocaleString()}
                </p>

                <div className="mt-3 flex gap-2">
                  <button
                    className="px-3 py-1.5 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700"
                    title="Create a branch from this point"
                  >
                    Branch from here
                  </button>
                  <button className="px-3 py-1.5 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-md text-sm hover:bg-gray-300 dark:hover:bg-gray-500">
                    Replay from here
                  </button>
                </div>
              </div>
            )}

            {/* Branches */}
            {branches.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Branches ({branches.length})
                </h3>
                <div className="space-y-2">
                  {branches.map((branch) => (
                    <div
                      key={branch.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <div className="w-2 h-2 bg-purple-500 rounded-full" />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          {branch.label ?? `Branch ${branch.id.slice(-6)}`}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(branch.branchedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {compareMode && (
                        <button
                          onClick={() => setCompareRunId(branch.runId ?? null)}
                          className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs"
                        >
                          Compare
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Side-by-Side Comparison */}
        {compareMode && compareRunId && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Branch Comparison
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-sm text-gray-500 mb-2">Original</h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-sm">
                  <p className="text-gray-600 dark:text-gray-400">Run: {selectedRun}</p>
                </div>
              </div>
              <div>
                <h3 className="font-medium text-sm text-gray-500 mb-2">Branch</h3>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-sm">
                  <p className="text-gray-600 dark:text-gray-400">Run: {compareRunId}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
