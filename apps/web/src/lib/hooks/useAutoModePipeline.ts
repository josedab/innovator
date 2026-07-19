"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AngleResult, PipelineProgress, Synthesis } from "@innovator/core/types";
import { createPipelineProgressParser } from "@/lib/auto-mode-sse";

interface UseAutoModePipelineOptions {
  subject: string;
  onComplete: (results: AngleResult[], synthesis: Synthesis | null) => void;
}

const SSE_TIMEOUT_MS = 5 * 60 * 1000;

export function useAutoModePipeline({ subject, onComplete }: UseAutoModePipelineOptions) {
  const [progress, setProgress] = useState<PipelineProgress>({
    stage: "investigating",
    completedAngles: [],
    totalAngles: 8,
    angleResults: [],
  });
  const [started, setStarted] = useState(false);
  const [partialContent, setPartialContent] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopAndKeep = useCallback(() => {
    abortControllerRef.current?.abort();
    setProgress((previous) => {
      if (previous.angleResults.length > 0) {
        onComplete(previous.angleResults, previous.synthesis ?? null);
      }
      return { ...previous, stage: "complete", stoppedEarly: true };
    });
  }, [onComplete]);

  const runPipeline = useCallback(
    async (signal: AbortSignal) => {
      try {
        const response = await fetch("/api/auto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject }),
          signal,
        });

        if (!response.ok) {
          const text = await response.text().then((value) => value.slice(0, 1000));
          setProgress((previous) => ({
            ...previous,
            stage: "error",
            error: text || "Auto mode failed",
          }));
          return;
        }

        const reader = response.body?.getReader();
        const parser = createPipelineProgressParser();
        if (!reader) {
          setProgress((previous) => ({
            ...previous,
            stage: "error",
            error: "No response stream",
          }));
          return;
        }

        let receivedComplete = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const data of parser.push(value)) {
            try {
              setProgress(data);

              if (data.partialIdea) {
                setPartialContent(data.partialIdea.content);
              } else {
                setPartialContent("");
              }

              if (data.stage === "complete") {
                receivedComplete = true;
                onComplete(data.angleResults, data.synthesis ?? null);
                return;
              }
              if (data.stage === "error") {
                return;
              }
            } catch {
              // Preserve the prior per-frame error isolation, including callback failures.
            }
          }
        }

        if (!receivedComplete) {
          setProgress((previous) => ({
            ...previous,
            stage: "error",
            error: "Connection lost before pipeline completed. Please try again.",
          }));
        }
      } catch (error) {
        if (signal.aborted) return;
        setProgress((previous) => ({
          ...previous,
          stage: "error",
          error: error instanceof Error ? error.message : "Auto mode failed",
        }));
      }
    },
    [subject, onComplete]
  );

  useEffect(() => {
    if (!started) {
      setStarted(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const timeout = setTimeout(() => controller.abort(), SSE_TIMEOUT_MS);
      runPipeline(controller.signal).finally(() => clearTimeout(timeout));

      return () => {
        clearTimeout(timeout);
        controller.abort();
      };
    }
  }, [started, runPipeline]);

  return { progress, partialContent, handleStopAndKeep };
}
