"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type SessionState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "thinking-aloud"
  | "paused"
  | "error"
  | "ended";

interface TranscriptEntry {
  text: string;
  timestamp: string;
  type: "user" | "system" | "command";
}

export default function VoicePage() {
  const [sessionState, setSessionState] = useState<SessionState>("idle");
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [thinkingAloud, setThinkingAloud] = useState(false);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(50).fill(0));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // Waveform animation
  useEffect(() => {
    if (sessionState !== "listening" && sessionState !== "thinking-aloud") {
      setWaveformData(new Array(50).fill(0));
      return;
    }

    const animate = () => {
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        const subset = Array.from(dataArray.slice(0, 50)).map((v) => v / 255);
        setWaveformData(subset);
      } else {
        // Simulated waveform when no analyser available
        setWaveformData((prev) =>
          prev.map(() => Math.random() * 0.3 + (sessionState === "listening" ? 0.1 : 0))
        );
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [sessionState]);

  const startListening = useCallback(async () => {
    try {
      // Request microphone access for waveform
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Start Web Speech API
      const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionCtor) {
        setTranscripts((prev) => [
          ...prev,
          {
            text: "Speech recognition not supported in this browser. Try Chrome or Edge.",
            timestamp: new Date().toISOString(),
            type: "system",
          },
        ]);
        setSessionState("error");
        return;
      }

      const recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const text = result[0].transcript.trim();
            setTranscripts((prev) => [
              ...prev,
              {
                text,
                timestamp: new Date().toISOString(),
                type: isCommand(text) ? "command" : "user",
              },
            ]);
            setCurrentTranscript("");
          } else {
            interim += result[0].transcript;
          }
        }
        if (interim) setCurrentTranscript(interim);
      };

      recognition.onerror = () => {
        setSessionState("error");
      };

      recognition.onend = () => {
        if (sessionState === "listening" || sessionState === "thinking-aloud") {
          recognition.start();
        }
      };

      recognition.start();
      recognitionRef.current = recognition;
      setSessionState("listening");

      setTranscripts((prev) => [
        ...prev,
        {
          text: "Voice session started. Say commands like 'investigate [topic]' or switch to 'thinking aloud' mode.",
          timestamp: new Date().toISOString(),
          type: "system",
        },
      ]);
    } catch (err) {
      setSessionState("error");
      setTranscripts((prev) => [
        ...prev,
        {
          text: `Microphone error: ${err instanceof Error ? err.message : "Unknown error"}`,
          timestamp: new Date().toISOString(),
          type: "system",
        },
      ]);
    }
  }, [sessionState]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    analyserRef.current = null;
    setSessionState("idle");
    setTranscripts((prev) => [
      ...prev,
      {
        text: "Voice session paused.",
        timestamp: new Date().toISOString(),
        type: "system",
      },
    ]);
  }, []);

  const toggleThinkingAloud = useCallback(() => {
    const newMode = !thinkingAloud;
    setThinkingAloud(newMode);
    setSessionState(newMode ? "thinking-aloud" : "listening");
    setTranscripts((prev) => [
      ...prev,
      {
        text: newMode
          ? "Thinking aloud mode ON — speak freely, ideas will be captured and structured."
          : "Thinking aloud mode OFF — returning to command mode.",
        timestamp: new Date().toISOString(),
        type: "system",
      },
    ]);
  }, [thinkingAloud]);

  const isCommand = (text: string): boolean => {
    const commands = [
      "investigate",
      "next",
      "previous",
      "score",
      "refine",
      "export",
      "summarize",
      "stop",
      "help",
    ];
    return commands.some((cmd) => text.toLowerCase().startsWith(cmd));
  };

  const stateColors: Record<SessionState, string> = {
    idle: "#6B7280",
    listening: "#10B981",
    processing: "#3B82F6",
    speaking: "#8B5CF6",
    "thinking-aloud": "#F59E0B",
    paused: "#6B7280",
    error: "#EF4444",
    ended: "#6B7280",
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Voice Innovation Session
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Speak to innovate — use voice commands or think aloud
          </p>
        </div>

        {/* Status & Waveform */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full animate-pulse"
                style={{ backgroundColor: stateColors[sessionState] }}
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                {sessionState.replace("-", " ")}
              </span>
            </div>
            <div className="flex gap-2">
              {sessionState === "idle" || sessionState === "error" ? (
                <button
                  onClick={startListening}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                >
                  🎤 Start Session
                </button>
              ) : (
                <>
                  <button
                    onClick={toggleThinkingAloud}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      thinkingAloud
                        ? "bg-amber-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    💭 Think Aloud
                  </button>
                  <button
                    onClick={stopListening}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
                  >
                    ⏹ Stop
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Waveform Visualizer */}
          <div className="flex items-end justify-center gap-[2px] h-16 bg-gray-100 dark:bg-gray-700/50 rounded-lg px-4">
            {waveformData.map((value, i) => (
              <div
                key={i}
                className="w-1 rounded-full transition-all duration-75"
                style={{
                  height: `${Math.max(2, value * 60)}px`,
                  backgroundColor: stateColors[sessionState],
                  opacity: 0.5 + value * 0.5,
                }}
              />
            ))}
          </div>

          {/* Current transcript (interim) */}
          {currentTranscript && (
            <div className="mt-3 text-sm text-gray-500 dark:text-gray-400 italic">
              {currentTranscript}...
            </div>
          )}
        </div>

        {/* Transcript View */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Transcript</h2>
          </div>
          <div className="p-4 max-h-96 overflow-y-auto space-y-3">
            {transcripts.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Start a voice session to begin capturing transcripts.
              </p>
            ) : (
              transcripts.map((entry, i) => (
                <div
                  key={i}
                  className={`flex gap-3 ${entry.type === "system" ? "justify-center" : ""}`}
                >
                  {entry.type === "system" ? (
                    <span className="text-xs text-gray-400 italic">{entry.text}</span>
                  ) : (
                    <div
                      className={`px-3 py-2 rounded-lg text-sm max-w-[80%] ${
                        entry.type === "command"
                          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {entry.type === "command" && (
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 block mb-1">
                          ⚡ Command
                        </span>
                      )}
                      {entry.text}
                      <span className="text-[10px] text-gray-400 block mt-1">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Voice Commands Reference */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Voice Commands
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              { cmd: "Investigate [topic]", desc: "Start research" },
              { cmd: "Next angle", desc: "Next creativity lens" },
              { cmd: "Score this", desc: "Evaluate ideas" },
              { cmd: "Refine", desc: "Improve current ideas" },
              { cmd: "Summarize", desc: "Get summary" },
              { cmd: "Export", desc: "Save results" },
            ].map((item) => (
              <div key={item.cmd} className="text-xs">
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  &quot;{item.cmd}&quot;
                </span>
                <span className="text-gray-500 ml-1">— {item.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Type declarations for Web Speech API
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
  // Minimal type for SpeechRecognition
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: any) => void) | null;
    onerror: ((event: any) => void) | null;
    onend: (() => void) | null;
  }

  var SpeechRecognition: { new (): SpeechRecognition };
}
