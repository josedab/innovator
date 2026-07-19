"use client";

import { useCallback, useRef, type Dispatch } from "react";
import type { AngleId, AngleResult, Investigation, Synthesis } from "@innovator/core/types";
import type { AppAction } from "@/app/appReducer";
import { saveSession } from "@/lib/session-storage";

interface UseInnovationFlowOptions {
  dispatch: Dispatch<AppAction>;
  subject: string;
  investigation: Investigation | null;
}

export function useInnovationFlow({ dispatch, subject, investigation }: UseInnovationFlowOptions) {
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleInvestigate = useCallback(
    async (subjectText: string) => {
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
          const text = await res.text().then((value) => value.slice(0, 1000));
          throw new Error(text || "Investigation failed");
        }

        let data: Investigation;
        try {
          data = await res.json();
        } catch {
          throw new Error("Invalid response from server");
        }
        dispatch({ type: "INVESTIGATION_SUCCESS", investigation: data });
      } catch (error) {
        dispatch({
          type: "INVESTIGATION_ERROR",
          error: error instanceof Error ? error.message : "Investigation failed",
        });
      }
    },
    [dispatch]
  );

  const handleInnovate = useCallback(
    async (angles: AngleId[]) => {
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
          const text = await res.text().then((value) => value.slice(0, 1000));
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
        saveSession(subject, data.angleResults, data.synthesis ?? null);
      } catch (error) {
        dispatch({
          type: "INNOVATION_ERROR",
          error: error instanceof Error ? error.message : "Innovation generation failed",
        });
      }
    },
    [dispatch, investigation, subject]
  );

  const handleReset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    dispatch({ type: "RESET" });
  }, [dispatch]);

  return { handleInvestigate, handleInnovate, handleReset };
}
