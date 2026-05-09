"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/* Debate types matching @innovator/core/types contracts */
interface DebateArgument { point: string; evidence: string; strength: number }
interface DebateRound {
  round: number;
  proArguments: DebateArgument[];
  conArguments: DebateArgument[];
  proRebuttal?: string;
  conRebuttal?: string;
}
interface DebateVerdict {
  winner: "pro" | "con" | "nuanced";
  confidence: number;
  summary: string;
  keyInsight: string;
  conditions: string[];
}
interface DebateQuality {
  argumentDepth: number;
  evidenceQuality: number;
  balanceScore: number;
  insightNovelty: number;
  overall: number;
}
interface DebateResult {
  idea: string;
  rounds: DebateRound[];
  verdict: DebateVerdict;
  quality: DebateQuality;
  totalRounds: number;
}
interface DebateArenaProps {
  ideas: Array<{ title: string; description: string; potentialImpact: string }>;
  investigation?: { summary: string; challenges: string[]; opportunities: string[] };
  onClose?: () => void;
}
interface Vote { up: number; down: number }
interface ForkedArgument { side: "pro" | "con"; sourceRound: number; sourcePoint: string; userArgument: string }
interface CustomArgument { side: "pro" | "con"; text: string }

const vk = (r: number, s: "pro" | "con", i: number) => `${r}-${s}-${i}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const VERDICT_CLS: Record<string, string> = {
  pro: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  con: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  nuanced: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
};
const sideBadge = (s: "pro" | "con") =>
  s === "pro"
    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";

/** Interactive debate arena with split-panel view, voting, and forking. */
export function DebateArena({ ideas, investigation, onClose }: DebateArenaProps) {
  const [result, setResult] = useState<DebateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRound, setExpandedRound] = useState<number | null>(null);
  const [votes, setVotes] = useState<Record<string, Vote>>({});
  const [forkedArgs, setForkedArgs] = useState<ForkedArgument[]>([]);
  const [customArgs, setCustomArgs] = useState<CustomArgument[]>([]);
  const [forkTarget, setForkTarget] = useState<{ round: number; side: "pro" | "con"; point: string } | null>(null);
  const [forkText, setForkText] = useState("");
  const [customSide, setCustomSide] = useState<"pro" | "con">("pro");
  const [customText, setCustomText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const runDebate = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideas, investigation }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error((await res.text()) || `Request failed (${res.status})`);
      const data: DebateResult = await res.json();
      setResult(data);
      setExpandedRound(0);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Debate failed");
    } finally {
      setLoading(false);
    }
  }, [ideas, investigation]);

  const handleVote = useCallback((key: string, dir: "up" | "down") => {
    setVotes((prev) => {
      const cur = prev[key] ?? { up: 0, down: 0 };
      return { ...prev, [key]: { ...cur, [dir]: cur[dir] + 1 } };
    });
  }, []);

  const submitFork = useCallback(() => {
    if (!forkTarget || !forkText.trim()) return;
    setForkedArgs((p) => [...p, { side: forkTarget.side, sourceRound: forkTarget.round, sourcePoint: forkTarget.point, userArgument: forkText.trim() }]);
    setForkTarget(null);
    setForkText("");
  }, [forkTarget, forkText]);

  const addCustomArg = useCallback(() => {
    if (!customText.trim()) return;
    setCustomArgs((p) => [...p, { side: customSide, text: customText.trim() }]);
    setCustomText("");
  }, [customSide, customText]);

  // Loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-300 border-t-indigo-600" />
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Running debate analysis…</p>
        {onClose && <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition">Cancel</button>}
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-red-200 bg-red-50 p-8 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        <div className="flex gap-3">
          <button onClick={runDebate} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition">Retry</button>
          {onClose && <button onClick={onClose} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 transition">Close</button>}
        </div>
      </div>
    );
  }

  // Start
  if (!result) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-8 dark:border-neutral-700 dark:bg-neutral-900">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Debate Arena</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center max-w-md">
          Analyze {ideas.length} idea{ideas.length !== 1 ? "s" : ""} through structured pro/con debate rounds.
        </p>
        <button onClick={runDebate} className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700 transition">Start Debate</button>
        {onClose && <button onClick={onClose} className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition">Cancel</button>}
      </div>
    );
  }

  // Results
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-neutral-200">Debate: {result.idea}</h3>
        {onClose && <button onClick={onClose} aria-label="Close debate" className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition">✕</button>}
      </div>

      {/* Rounds */}
      {result.rounds.map((round) => {
        const isOpen = expandedRound === round.round;
        return (
          <div key={round.round} className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
            <button onClick={() => setExpandedRound(isOpen ? null : round.round)} aria-expanded={isOpen} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800 transition">
              <span>Round {round.round + 1}</span>
              <span>{isOpen ? "▼" : "▶"}</span>
            </button>
            {isOpen && (
              <div className="grid md:grid-cols-2 gap-0 border-t border-neutral-200 dark:border-neutral-700">
                <div className="border-r border-neutral-200 dark:border-neutral-700 bg-green-50/50 dark:bg-green-900/10 p-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-green-700 dark:text-green-400">Pro</h4>
                  {round.proArguments.map((arg, i) => (
                    <ArgCard key={i} arg={arg} side="pro" k={vk(round.round, "pro", i)} votes={votes[vk(round.round, "pro", i)]} onVote={handleVote} onFork={() => setForkTarget({ round: round.round, side: "pro", point: arg.point })} />
                  ))}
                  {round.proRebuttal && <p className="text-xs italic text-green-700 dark:text-green-400 border-t border-green-200 dark:border-green-800 pt-2">Rebuttal: {round.proRebuttal}</p>}
                </div>
                <div className="bg-red-50/50 dark:bg-red-900/10 p-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">Con</h4>
                  {round.conArguments.map((arg, i) => (
                    <ArgCard key={i} arg={arg} side="con" k={vk(round.round, "con", i)} votes={votes[vk(round.round, "con", i)]} onVote={handleVote} onFork={() => setForkTarget({ round: round.round, side: "con", point: arg.point })} />
                  ))}
                  {round.conRebuttal && <p className="text-xs italic text-red-700 dark:text-red-400 border-t border-red-200 dark:border-red-800 pt-2">Rebuttal: {round.conRebuttal}</p>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Fork dialog */}
      {forkTarget && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3 dark:border-indigo-800 dark:bg-indigo-900/20">
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            Forking from <span className="font-medium">{forkTarget.side}</span>: &ldquo;{forkTarget.point}&rdquo;
          </p>
          <textarea value={forkText} onChange={(e) => setForkText(e.target.value)} placeholder="Add your branching argument…" rows={2} className="w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm dark:border-indigo-700 dark:bg-neutral-900 dark:text-neutral-200" />
          <div className="flex gap-2">
            <button onClick={submitFork} disabled={!forkText.trim()} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition">Fork</button>
            <button onClick={() => { setForkTarget(null); setForkText(""); }} className="rounded-lg border border-neutral-300 px-4 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-400 dark:hover:bg-neutral-800 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Forked branch */}
      {forkedArgs.length > 0 && (
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-2 dark:border-purple-800 dark:bg-purple-900/20">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">Forked Branch</h4>
          {forkedArgs.map((f, i) => (
            <div key={i} className="rounded-lg border border-purple-200 bg-white p-3 text-sm dark:border-purple-700 dark:bg-neutral-900">
              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-2 ${sideBadge(f.side)}`}>{f.side}</span>
              <span className="text-neutral-700 dark:text-neutral-300">{f.userArgument}</span>
              <p className="text-xs text-neutral-500 mt-1">↳ from round {f.sourceRound + 1}</p>
            </div>
          ))}
        </div>
      )}

      {/* Inject custom argument */}
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 space-y-3 dark:border-neutral-700 dark:bg-neutral-900">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400">Add Argument</h4>
        <div className="flex gap-2">
          <select value={customSide} onChange={(e) => setCustomSide(e.target.value as "pro" | "con")} className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
            <option value="pro">Pro</option>
            <option value="con">Con</option>
          </select>
          <input type="text" value={customText} onChange={(e) => setCustomText(e.target.value)} placeholder="Type your argument…" onKeyDown={(e) => e.key === "Enter" && addCustomArg()} className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200" />
          <button onClick={addCustomArg} disabled={!customText.trim()} className="rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40 dark:bg-neutral-600 dark:hover:bg-neutral-500 transition">Add</button>
        </div>
        {customArgs.length > 0 && (
          <div className="space-y-1.5">
            {customArgs.map((c, i) => (
              <p key={i} className="text-sm text-neutral-700 dark:text-neutral-300">
                <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium mr-2 ${sideBadge(c.side)}`}>{c.side}</span>
                {c.text}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Verdict */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 space-y-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Verdict</h4>
          <span className={`rounded-full px-3 py-0.5 text-xs font-medium ${VERDICT_CLS[result.verdict.winner]}`}>{result.verdict.winner}</span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">{pct(result.verdict.confidence)} confidence</span>
        </div>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{result.verdict.summary}</p>
        <p className="text-sm italic text-neutral-600 dark:text-neutral-400">Key insight: {result.verdict.keyInsight}</p>
        {result.verdict.conditions.length > 0 && (
          <ul className="list-disc pl-5 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            {result.verdict.conditions.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </div>

      {/* Quality scores */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
        <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 mb-3">Quality Scores</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {([["Depth", result.quality.argumentDepth], ["Evidence", result.quality.evidenceQuality], ["Balance", result.quality.balanceScore], ["Novelty", result.quality.insightNovelty], ["Overall", result.quality.overall]] as [string, number][]).map(([label, score]) => (
            <div key={label} className="text-center">
              <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{score}/10</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Single argument card with voting and fork action. */
function ArgCard({ arg, side, k, votes, onVote, onFork }: {
  arg: DebateArgument; side: "pro" | "con"; k: string; votes?: Vote;
  onVote: (key: string, dir: "up" | "down") => void; onFork: () => void;
}) {
  const up = votes?.up ?? 0;
  const down = votes?.down ?? 0;
  const border = side === "pro" ? "border-green-200 dark:border-green-800" : "border-red-200 dark:border-red-800";
  return (
    <div className={`rounded-lg border ${border} bg-white p-3 space-y-1.5 dark:bg-neutral-900`}>
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{arg.point}</p>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{arg.evidence}</p>
      <div className="flex items-center gap-3 pt-1">
        <span className="text-xs text-neutral-500">Strength: {arg.strength}/10</span>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => onVote(k, "up")} aria-label="Upvote" className="rounded px-1.5 py-0.5 text-xs hover:bg-green-100 dark:hover:bg-green-900/30 transition">▲ {up}</button>
          <button onClick={() => onVote(k, "down")} aria-label="Downvote" className="rounded px-1.5 py-0.5 text-xs hover:bg-red-100 dark:hover:bg-red-900/30 transition">▼ {down}</button>
          <button onClick={onFork} aria-label="Fork argument" className="rounded px-1.5 py-0.5 text-xs text-indigo-600 hover:bg-indigo-100 dark:text-indigo-400 dark:hover:bg-indigo-900/30 transition">⑂</button>
        </div>
      </div>
    </div>
  );
}
