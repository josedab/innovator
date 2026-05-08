"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * ARIA live region component for streaming pipeline updates.
 * Announces stage transitions and results to screen readers.
 */
export function StreamingAnnouncer({
  stage,
  message,
  politeness = "polite",
}: {
  stage?: string;
  message?: string;
  politeness?: "polite" | "assertive";
}) {
  return (
    <div role="status" aria-live={politeness} aria-atomic="true" className="sr-only">
      {stage && <span>Pipeline stage: {stage}. </span>}
      {message && <span>{message}</span>}
    </div>
  );
}

/**
 * Hook for managing streaming announcements.
 * Debounces rapid updates to avoid overwhelming screen readers.
 */
export function useStreamingAnnouncements() {
  const [announcement, setAnnouncement] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((message: string, debounceMs = 500) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setAnnouncement(message), debounceMs);
  }, []);

  const announceStage = useCallback((stage: string, detail?: string) => {
    const messages: Record<string, string> = {
      investigating: "Now investigating the subject. Please wait.",
      generating: `Generating ideas${detail ? ` for ${detail}` : ""}. This may take a moment.`,
      synthesizing: "Synthesizing results from all angles.",
      scoring: "Scoring and ranking generated ideas.",
      complete: "Pipeline complete. Results are now available.",
      error: `An error occurred${detail ? `: ${detail}` : ". Please try again."}.`,
    };
    setAnnouncement(messages[stage] ?? `Stage: ${stage}`);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const AnnouncerRegion = () => (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {announcement}
    </div>
  );

  return { announce, announceStage, AnnouncerRegion };
}

/**
 * Progress announcer for long-running operations.
 * Announces percentage milestones to screen readers.
 */
export function ProgressAnnouncer({
  progress,
  label,
  milestones = [25, 50, 75, 100],
}: {
  progress: number;
  label: string;
  milestones?: number[];
}) {
  const lastMilestone = useRef(0);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    for (const milestone of milestones) {
      if (progress >= milestone && lastMilestone.current < milestone) {
        lastMilestone.current = milestone;
        setAnnouncement(`${label}: ${milestone}% complete`);
      }
    }
  }, [progress, label, milestones]);

  return (
    <>
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      />
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
