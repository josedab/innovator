/**
 * @description Displays elapsed time since mount with a pulsing dot indicator.
 */
"use client";

import { useState, useEffect } from "react";

interface ElapsedTimerProps {
  estimateSeconds?: number;
}

export function ElapsedTimer({ estimateSeconds = 30 }: ElapsedTimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="flex items-center gap-2 text-sm text-neutral-500 mt-3">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      <span>{formatTime(elapsed)} elapsed</span>
      {elapsed < estimateSeconds && (
        <span className="text-neutral-400">· usually takes ~{estimateSeconds}s</span>
      )}
      {elapsed >= estimateSeconds && (
        <span className="text-amber-500">· taking longer than usual…</span>
      )}
    </div>
  );
}
