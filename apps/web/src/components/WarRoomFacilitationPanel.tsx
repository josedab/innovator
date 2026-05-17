/**
 * @description War Room Facilitation Panel — AI-assisted session facilitation with
 * phase timing, participation monitoring, consensus detection, and groupthink alerts.
 */
"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface FacilitationAlert {
  id: string;
  type: string;
  severity: "info" | "warning" | "action-required";
  message: string;
  suggestion: string;
}

interface ParticipationStat {
  userId: string;
  displayName: string;
  ideasSubmitted: number;
  votesGiven: number;
  participationScore: number;
}

interface ConsensusResult {
  hasConsensus: boolean;
  consensusLevel: number;
  topIdeas: Array<{ ideaId: string; votes: number; avgScore: number }>;
  recommendation: string;
}

interface TimerState {
  phase: string;
  durationMinutes: number;
  elapsedMs: number;
  remainingMs: number;
  isOvertime: boolean;
  progress: number;
}

interface Props {
  roomId: string;
}

export default function WarRoomFacilitationPanel({ roomId }: Props) {
  const [alerts, setAlerts] = useState<FacilitationAlert[]>([]);
  const [participation, setParticipation] = useState<ParticipationStat[]>([]);
  const [consensus, setConsensus] = useState<ConsensusResult | null>(null);
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [groupthinkRisk, setGroupthinkRisk] = useState(0);
  const [balance, setBalance] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/war-room?roomId=${roomId}&view=facilitation-report`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts ?? []);
        setParticipation(data.participation ?? []);
        setGroupthinkRisk(data.groupthinkRisk ?? 0);
        setBalance(data.participationBalance ?? 0);
      }
    } catch {
      /* ignore */
    }
  }, [roomId]);

  const fetchConsensus = useCallback(async () => {
    try {
      const res = await fetch(`/api/war-room?roomId=${roomId}&view=consensus`);
      if (res.ok) setConsensus(await res.json());
    } catch {
      /* ignore */
    }
  }, [roomId]);

  const fetchTimer = useCallback(async () => {
    try {
      const res = await fetch(`/api/war-room?roomId=${roomId}&view=timer`);
      if (res.ok) {
        const data = await res.json();
        setTimer(data.timer);
      }
    } catch {
      /* ignore */
    }
  }, [roomId]);

  useEffect(() => {
    fetchReport();
    fetchConsensus();
    fetchTimer();
    // Poll every 5 seconds
    const interval = setInterval(() => {
      fetchReport();
      fetchTimer();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchReport, fetchConsensus, fetchTimer]);

  const startTimer = useCallback(
    async (phase: string, minutes: number) => {
      await fetch("/api/war-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start-timer", roomId, phase, durationMinutes: minutes }),
      });
      fetchTimer();
    },
    [roomId, fetchTimer]
  );

  const stopTimer = useCallback(async () => {
    await fetch("/api/war-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "stop-timer", roomId }),
    });
    setTimer(null);
  }, [roomId]);

  const formatTime = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="p-4 space-y-6 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-bold flex items-center gap-2">
        🤖 AI Facilitation
        <span className="text-sm font-normal text-gray-500">Room: {roomId.slice(0, 8)}…</span>
      </h3>

      {/* Timer */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex justify-between items-center">
          <h4 className="font-semibold">⏱ Phase Timer</h4>
          {timer ? (
            <button onClick={stopTimer} className="text-red-600 text-sm hover:underline">
              Stop
            </button>
          ) : (
            <div className="flex gap-2">
              {["ideation", "scoring", "synthesis"].map((phase) => (
                <button
                  key={phase}
                  onClick={() => startTimer(phase, phase === "ideation" ? 25 : 10)}
                  className="text-xs bg-blue-50 px-2 py-1 rounded hover:bg-blue-100"
                >
                  {phase}
                </button>
              ))}
            </div>
          )}
        </div>
        {timer && (
          <div className="mt-3">
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">{timer.phase}</span>
              <span className={timer.isOvertime ? "text-red-600 font-bold" : ""}>
                {timer.isOvertime ? "OVERTIME " : ""}
                {formatTime(timer.remainingMs)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${timer.isOvertime ? "bg-red-500" : timer.progress > 0.8 ? "bg-yellow-500" : "bg-blue-500"}`}
                style={{ width: `${Math.min(100, timer.progress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold">⚠ Alerts</h4>
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg text-sm ${
                alert.severity === "action-required"
                  ? "bg-red-50 border-red-200"
                  : alert.severity === "warning"
                    ? "bg-yellow-50 border-yellow-200"
                    : "bg-blue-50 border-blue-200"
              } border`}
            >
              <div className="font-medium">{alert.message}</div>
              <div className="text-gray-600 mt-1">💡 {alert.suggestion}</div>
            </div>
          ))}
        </div>
      )}

      {/* Health Indicators */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">Groupthink Risk</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-full bg-gray-200 rounded-full h-2 flex-1">
              <div
                className={`h-2 rounded-full ${groupthinkRisk > 0.5 ? "bg-red-500" : groupthinkRisk > 0.3 ? "bg-yellow-500" : "bg-green-500"}`}
                style={{ width: `${groupthinkRisk * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold">{Math.round(groupthinkRisk * 100)}%</span>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-3">
          <div className="text-xs text-gray-500">Participation Balance</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-full bg-gray-200 rounded-full h-2 flex-1">
              <div
                className={`h-2 rounded-full ${balance > 0.7 ? "bg-green-500" : balance > 0.4 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${balance * 100}%` }}
              />
            </div>
            <span className="text-sm font-bold">{Math.round(balance * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Participation */}
      {participation.length > 0 && (
        <div>
          <h4 className="font-semibold mb-2">👥 Participation</h4>
          <div className="space-y-1">
            {participation.map((p) => (
              <div key={p.userId} className="flex items-center gap-2 text-sm">
                <span className="w-24 truncate">{p.displayName}</span>
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${p.participationScore * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {p.ideasSubmitted}💡 {p.votesGiven}🗳
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Consensus */}
      {consensus && (
        <div className="bg-white border rounded-lg p-3">
          <h4 className="font-semibold mb-2">🎯 Consensus</h4>
          <div className="flex items-center gap-2 mb-2">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${consensus.hasConsensus ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}
            >
              {consensus.hasConsensus ? "Consensus Reached" : "No Consensus Yet"}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round(consensus.consensusLevel * 100)}% agreement
            </span>
          </div>
          <p className="text-sm text-gray-600">{consensus.recommendation}</p>
          <button onClick={fetchConsensus} className="text-xs text-blue-600 hover:underline mt-1">
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
