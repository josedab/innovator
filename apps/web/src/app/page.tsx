/**
 * Main page component for the Innovator web app.
 *
 * Implements a stage-based flow:
 *   input → investigating → explored → innovating → results
 *
 * Also supports an "auto" stage that runs all angles via SSE.
 * API requests use a 60-second timeout (AbortSignal.timeout) to prevent
 * the UI from hanging indefinitely on slow or unresponsive LLM calls.
 */
"use client";

import { useReducer, useRef } from "react";
import { SubjectInput } from "@/components/SubjectInput";
import { InvestigationView } from "@/components/InvestigationView";
import { AngleSelector } from "@/components/AngleSelector";
import { InnovationResults } from "@/components/InnovationResults";
import { AutoModePanel } from "@/components/AutoModePanel";
import { appReducer, initialState } from "./appReducer";
import type { Investigation, AngleResult, Synthesis, AngleId } from "@innovator/core/types";

export default function Home() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { stage, subject, investigation, selectedAngles, angleResults, synthesis, error } = state;
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleInvestigate = async (subjectText: string) => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    dispatch({ type: "START_INVESTIGATE", subject: subjectText });

    try {
      const res = await fetch("/api/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subjectText }),
        signal: AbortSignal.any([abortControllerRef.current.signal, AbortSignal.timeout(60_000)]),
      });

      if (!res.ok) {
        const text = await res.text().then((t) => t.slice(0, 1000));
        throw new Error(text || "Investigation failed");
      }

      let data: Investigation;
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid response from server");
      }
      dispatch({ type: "INVESTIGATION_SUCCESS", investigation: data });
    } catch (err) {
      dispatch({
        type: "INVESTIGATION_ERROR",
        error: err instanceof Error ? err.message : "Investigation failed",
      });
    }
  };

  const handleInnovate = async (angles: AngleId[]) => {
    if (!investigation) return;
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    dispatch({ type: "START_INNOVATE", angles });

    try {
      const res = await fetch("/api/innovate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, investigation, angles, synthesize: true }),
        signal: AbortSignal.any([abortControllerRef.current.signal, AbortSignal.timeout(60_000)]),
      });

      if (!res.ok) {
        const text = await res.text().then((t) => t.slice(0, 1000));
        throw new Error(text || "Innovation generation failed");
      }

      let data: { angleResults: AngleResult[]; synthesis?: Synthesis };
      try {
        data = await res.json();
      } catch {
        throw new Error("Invalid response from server");
      }
      dispatch({
        type: "INNOVATION_SUCCESS",
        angleResults: data.angleResults,
        synthesis: data.synthesis ?? null,
      });
    } catch (err) {
      dispatch({
        type: "INNOVATION_ERROR",
        error: err instanceof Error ? err.message : "Innovation generation failed",
      });
    }
  };

  const handleAutoMode = (subjectText: string) => {
    dispatch({ type: "START_AUTO", subject: subjectText });
  };

  const handleAutoComplete = (results: AngleResult[], synth: Synthesis | null) => {
    dispatch({ type: "AUTO_COMPLETE", angleResults: results, synthesis: synth });
  };

  const handleReset = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    dispatch({ type: "RESET" });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {error && (
        <div
          role="alert"
          className="mb-6 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200"
        >
          <p className="font-medium">Error</p>
          <p className="text-sm mt-1">{error}</p>
          <p className="text-xs mt-2 text-red-600 dark:text-red-400">
            Common causes: check that{" "}
            <code className="bg-red-100 dark:bg-red-900 px-1 rounded">gh auth login</code> is active
            and your Copilot subscription is valid.
          </p>
        </div>
      )}

      {stage === "input" && (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3">💡 What do you want to innovate on?</h1>
            <p className="text-lg text-neutral-600 dark:text-neutral-400 max-w-2xl">
              Enter any subject — a technology, product, process, or idea — and we&apos;ll
              investigate it and explore innovation angles using AI.
            </p>
          </div>
          <SubjectInput onSubmit={handleInvestigate} onAutoMode={handleAutoMode} />
        </div>
      )}

      {stage === "investigating" && (
        <div
          role="status"
          aria-live="polite"
          aria-busy={true}
          className="flex flex-col items-center justify-center min-h-[60vh]"
        >
          <div className="animate-pulse text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-2xl font-semibold mb-2">Investigating...</h2>
            <p className="text-neutral-500">
              Analyzing &quot;{subject}&quot; to find key aspects, challenges, and opportunities
            </p>
          </div>
        </div>
      )}

      {stage === "explored" && investigation && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Investigation: {subject}</h2>
            <button
              onClick={handleReset}
              aria-label="Start over"
              className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
            >
              Start over
            </button>
          </div>
          <InvestigationView investigation={investigation} />
          <div className="mt-8">
            <AngleSelector onSubmit={handleInnovate} />
          </div>
        </div>
      )}

      {stage === "innovating" && (
        <div
          role="status"
          aria-live="polite"
          aria-busy={true}
          className="flex flex-col items-center justify-center min-h-[60vh]"
        >
          <div className="animate-pulse text-center">
            <div className="text-5xl mb-4">⚡</div>
            <h2 className="text-2xl font-semibold mb-2">Generating Innovations...</h2>
            <p className="text-neutral-500">
              Exploring {selectedAngles.length} angle
              {selectedAngles.length !== 1 ? "s" : ""} for &quot;{subject}&quot;
            </p>
          </div>
        </div>
      )}

      {stage === "results" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Innovation Results: {subject}</h2>
            <button
              onClick={handleReset}
              aria-label="Start over"
              className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 underline"
            >
              Start over
            </button>
          </div>
          <InnovationResults angleResults={angleResults} synthesis={synthesis} />
        </div>
      )}

      {stage === "auto" && (
        <AutoModePanel subject={subject} onComplete={handleAutoComplete} onReset={handleReset} />
      )}
    </div>
  );
}
