import { describe, it, expect, beforeEach } from "vitest";
import {
  parseVoiceCommand,
  buildNarrationSegments,
  getVoiceCommandHelp,
  registerSTTProvider,
  registerTTSProvider,
  getSTTProvider,
  getTTSProvider,
  listSTTProviders,
  listTTSProviders,
  clearVoiceProviders,
  createVoiceSession,
  getVoiceSession,
  transitionVoiceSession,
  addVoiceTranscript,
  queueNarration,
  dequeueNarration,
  structureThinkingAloud,
  endVoiceSession,
  listVoiceSessions,
  clearVoiceSessions,
  VOICE_COMMANDS,
  type VoiceTranscript,
  type NarrationSegment,
  type SpeechRecognitionProvider,
  type TextToSpeechProvider,
} from "../voice/index.js";

function makeTranscript(text: string, confidence = 0.95): VoiceTranscript {
  return {
    text,
    confidence,
    isFinal: true,
    timestamp: new Date().toISOString(),
  };
}

describe("voice", () => {
  beforeEach(() => {
    clearVoiceProviders();
    clearVoiceSessions();
  });

  // ---- parseVoiceCommand ----

  describe("parseVoiceCommand", () => {
    it("parses 'investigate' command", () => {
      const result = parseVoiceCommand(makeTranscript("investigate renewable energy"));
      expect(result).toBeDefined();
      expect(result!.command).toBe("investigate");
      expect(result!.argument).toBe("renewable energy");
    });

    it("parses 'look into' as investigate", () => {
      const result = parseVoiceCommand(makeTranscript("look into AI safety"));
      expect(result).toBeDefined();
      expect(result!.command).toBe("investigate");
      expect(result!.argument).toBe("AI safety");
    });

    it("parses 'research' as investigate", () => {
      const result = parseVoiceCommand(makeTranscript("research quantum computing"));
      expect(result!.command).toBe("investigate");
    });

    it("parses 'next angle' command", () => {
      const result = parseVoiceCommand(makeTranscript("next angle"));
      expect(result!.command).toBe("next-angle");
    });

    it("parses 'next' as next-angle", () => {
      const result = parseVoiceCommand(makeTranscript("next"));
      expect(result!.command).toBe("next-angle");
    });

    it("parses 'continue' as next-angle", () => {
      const result = parseVoiceCommand(makeTranscript("continue"));
      expect(result!.command).toBe("next-angle");
    });

    it("parses 'previous angle' command", () => {
      const result = parseVoiceCommand(makeTranscript("previous angle"));
      expect(result!.command).toBe("previous-angle");
    });

    it("parses 'go back' as previous-angle", () => {
      const result = parseVoiceCommand(makeTranscript("go back"));
      expect(result!.command).toBe("previous-angle");
    });

    it("parses 'score this' command", () => {
      const result = parseVoiceCommand(makeTranscript("score this"));
      expect(result!.command).toBe("score-this");
    });

    it("parses 'rate this' as score-this", () => {
      const result = parseVoiceCommand(makeTranscript("rate this"));
      expect(result!.command).toBe("score-this");
    });

    it("parses 'evaluate' as score-this", () => {
      const result = parseVoiceCommand(makeTranscript("evaluate"));
      expect(result!.command).toBe("score-this");
    });

    it("parses 'refine' command with argument", () => {
      const result = parseVoiceCommand(makeTranscript("refine the descriptions"));
      expect(result!.command).toBe("refine");
      expect(result!.argument).toBe("the descriptions");
    });

    it("parses 'export' command", () => {
      const result = parseVoiceCommand(makeTranscript("export"));
      expect(result!.command).toBe("export");
    });

    it("parses 'save' as export", () => {
      const result = parseVoiceCommand(makeTranscript("save results"));
      expect(result!.command).toBe("export");
    });

    it("parses 'download' as export", () => {
      const result = parseVoiceCommand(makeTranscript("download"));
      expect(result!.command).toBe("export");
    });

    it("parses 'summarize' command", () => {
      const result = parseVoiceCommand(makeTranscript("summarize"));
      expect(result!.command).toBe("summarize");
    });

    it("parses 'give me a summary' as summarize", () => {
      const result = parseVoiceCommand(makeTranscript("give me a summary"));
      expect(result!.command).toBe("summarize");
    });

    it("parses 'stop' command", () => {
      const result = parseVoiceCommand(makeTranscript("stop"));
      expect(result!.command).toBe("stop");
    });

    it("parses 'cancel' as stop", () => {
      const result = parseVoiceCommand(makeTranscript("cancel"));
      expect(result!.command).toBe("stop");
    });

    it("parses 'help' command", () => {
      const result = parseVoiceCommand(makeTranscript("help"));
      expect(result!.command).toBe("help");
    });

    it("parses 'what can I say' as help", () => {
      const result = parseVoiceCommand(makeTranscript("what can I say"));
      expect(result!.command).toBe("help");
    });

    it("returns undefined for unrecognized command", () => {
      const result = parseVoiceCommand(makeTranscript("hello world"));
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty transcript", () => {
      const result = parseVoiceCommand(makeTranscript(""));
      expect(result).toBeUndefined();
    });

    it("preserves confidence from transcript", () => {
      const result = parseVoiceCommand(makeTranscript("help", 0.8));
      expect(result!.confidence).toBe(0.8);
    });

    it("is case-insensitive", () => {
      const result = parseVoiceCommand(makeTranscript("INVESTIGATE blockchain"));
      expect(result!.command).toBe("investigate");
    });

    it("trims whitespace from transcript", () => {
      const result = parseVoiceCommand(makeTranscript("  help  "));
      expect(result!.command).toBe("help");
    });
  });

  // ---- buildNarrationSegments ----

  describe("buildNarrationSegments", () => {
    it("builds segments from complete data", () => {
      const segments = buildNarrationSegments({
        subject: "AI Innovation",
        summary: "A comprehensive summary",
        topIdeas: [
          { title: "Idea 1", description: "Desc 1" },
          { title: "Idea 2", description: "Desc 2" },
        ],
        themes: ["automation", "efficiency"],
        recommendation: "Focus on automation",
      });

      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0].type).toBe("heading");
      expect(segments[0].text).toContain("AI Innovation");
    });

    it("includes section titles for ideas", () => {
      const segments = buildNarrationSegments({
        topIdeas: [{ title: "Idea 1", description: "Desc 1" }],
      });
      expect(segments.some((s) => s.text.includes("top 1 ideas"))).toBe(true);
    });

    it("includes theme text", () => {
      const segments = buildNarrationSegments({
        themes: ["AI", "ML"],
      });
      expect(segments.some((s) => s.text.includes("AI, ML"))).toBe(true);
    });

    it("includes recommendation", () => {
      const segments = buildNarrationSegments({
        recommendation: "Do this thing",
      });
      const recSeg = segments.find((s) => s.type === "summary");
      expect(recSeg).toBeDefined();
      expect(recSeg!.text).toContain("Do this thing");
    });

    it("returns empty array for empty data", () => {
      const segments = buildNarrationSegments({});
      expect(segments).toEqual([]);
    });

    it("has appropriate pause durations", () => {
      const segments = buildNarrationSegments({
        subject: "Test",
        summary: "Summary",
        topIdeas: [{ title: "I", description: "D" }],
        recommendation: "R",
      });
      // Headings should have longer pauses
      const heading = segments.find((s) => s.type === "heading");
      expect(heading!.pauseAfterMs).toBeGreaterThanOrEqual(600);
    });

    it("skips topIdeas section if empty array", () => {
      const segments = buildNarrationSegments({ topIdeas: [] });
      expect(segments.some((s) => s.text.includes("top"))).toBe(false);
    });

    it("skips themes section if empty array", () => {
      const segments = buildNarrationSegments({ themes: [] });
      expect(segments).toHaveLength(0);
    });
  });

  // ---- getVoiceCommandHelp ----

  describe("getVoiceCommandHelp", () => {
    it("returns help text covering all commands", () => {
      const help = getVoiceCommandHelp();
      expect(help).toContain("Investigate");
      expect(help).toContain("Next angle");
      expect(help).toContain("Previous angle");
      expect(help).toContain("Score this");
      expect(help).toContain("Refine");
      expect(help).toContain("Export");
      expect(help).toContain("Summarize");
      expect(help).toContain("Stop");
      expect(help).toContain("Help");
    });

    it("mentions all voice commands", () => {
      const help = getVoiceCommandHelp().toLowerCase();
      for (const cmd of VOICE_COMMANDS) {
        const searchTerm = cmd.replace("-", " ");
        expect(help).toContain(searchTerm);
      }
    });
  });

  // ---- Provider Registration ----

  describe("STT/TTS Provider Registry", () => {
    const mockSTTProvider: SpeechRecognitionProvider = {
      id: "test-stt",
      name: "Test STT",
      start: () => {},
      stop: () => {},
      isListening: () => false,
      onTranscript: () => {},
      onError: () => {},
    };

    const mockTTSProvider: TextToSpeechProvider = {
      id: "test-tts",
      name: "Test TTS",
      speak: async () => {},
      stop: () => {},
      isSpeaking: () => false,
      listVoices: () => [{ id: "v1", name: "Voice 1", locale: "en-US" }],
    };

    it("registers and retrieves STT provider", () => {
      registerSTTProvider(mockSTTProvider);
      const provider = getSTTProvider("test-stt");
      expect(provider).toBeDefined();
      expect(provider!.name).toBe("Test STT");
    });

    it("registers and retrieves TTS provider", () => {
      registerTTSProvider(mockTTSProvider);
      const provider = getTTSProvider("test-tts");
      expect(provider).toBeDefined();
      expect(provider!.name).toBe("Test TTS");
    });

    it("returns undefined for unregistered provider", () => {
      expect(getSTTProvider("nonexistent")).toBeUndefined();
      expect(getTTSProvider("nonexistent")).toBeUndefined();
    });

    it("lists all registered STT providers", () => {
      registerSTTProvider(mockSTTProvider);
      const providers = listSTTProviders();
      expect(providers).toHaveLength(1);
      expect(providers[0].id).toBe("test-stt");
    });

    it("lists all registered TTS providers", () => {
      registerTTSProvider(mockTTSProvider);
      const providers = listTTSProviders();
      expect(providers).toHaveLength(1);
    });

    it("clearVoiceProviders empties both registries", () => {
      registerSTTProvider(mockSTTProvider);
      registerTTSProvider(mockTTSProvider);
      clearVoiceProviders();
      expect(listSTTProviders()).toHaveLength(0);
      expect(listTTSProviders()).toHaveLength(0);
    });

    it("overwrites provider with same id", () => {
      registerSTTProvider(mockSTTProvider);
      const updated = { ...mockSTTProvider, name: "Updated STT" };
      registerSTTProvider(updated);
      expect(getSTTProvider("test-stt")!.name).toBe("Updated STT");
      expect(listSTTProviders()).toHaveLength(1);
    });
  });

  // ---- Voice Session Management ----

  describe("createVoiceSession", () => {
    it("creates a session with default config", () => {
      const session = createVoiceSession();
      expect(session.id).toMatch(/^vsess_/);
      expect(session.state).toBe("idle");
      expect(session.config.engine).toBe("none");
      expect(session.config.locale).toBe("en-US");
      expect(session.transcripts).toEqual([]);
      expect(session.commands).toEqual([]);
      expect(session.narrationQueue).toEqual([]);
      expect(session.thinkingAloudBuffer).toEqual([]);
      expect(session.startedAt).toBeTruthy();
      expect(session.lastActivityAt).toBeTruthy();
    });

    it("creates a session with custom config", () => {
      const session = createVoiceSession({
        engine: "whisper",
        locale: "fr-FR",
        narrationEnabled: true,
        speechRate: 1.5,
      });
      expect(session.config.engine).toBe("whisper");
      expect(session.config.locale).toBe("fr-FR");
      expect(session.config.narrationEnabled).toBe(true);
      expect(session.config.speechRate).toBe(1.5);
    });

    it("generates unique session ids", () => {
      const s1 = createVoiceSession();
      const s2 = createVoiceSession();
      expect(s1.id).not.toBe(s2.id);
    });

    it("stores session retrievable by getVoiceSession", () => {
      const session = createVoiceSession();
      const retrieved = getVoiceSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(session.id);
    });
  });

  describe("getVoiceSession", () => {
    it("returns undefined for non-existent session", () => {
      expect(getVoiceSession("nonexistent")).toBeUndefined();
    });
  });

  describe("transitionVoiceSession", () => {
    it("transitions from idle to listening", () => {
      const session = createVoiceSession();
      const result = transitionVoiceSession(session.id, "listening");
      expect(result).toBe(true);
      expect(getVoiceSession(session.id)!.state).toBe("listening");
    });

    it("rejects invalid transition from idle to speaking", () => {
      const session = createVoiceSession();
      const result = transitionVoiceSession(session.id, "speaking");
      expect(result).toBe(false);
      expect(getVoiceSession(session.id)!.state).toBe("idle");
    });

    it("returns false for non-existent session", () => {
      expect(transitionVoiceSession("nonexistent", "listening")).toBe(false);
    });

    it("cannot transition from ended state", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "ended");
      expect(transitionVoiceSession(session.id, "idle")).toBe(false);
    });

    it("updates lastActivityAt on valid transition", () => {
      const session = createVoiceSession();
      const before = session.lastActivityAt;
      transitionVoiceSession(session.id, "listening");
      const after = getVoiceSession(session.id)!.lastActivityAt;
      expect(after).toBeTruthy();
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
    });

    it("supports rapid state transitions through valid path", () => {
      const session = createVoiceSession();
      expect(transitionVoiceSession(session.id, "listening")).toBe(true);
      expect(transitionVoiceSession(session.id, "processing")).toBe(true);
      expect(transitionVoiceSession(session.id, "speaking")).toBe(true);
      expect(transitionVoiceSession(session.id, "listening")).toBe(true);
      expect(getVoiceSession(session.id)!.state).toBe("listening");
    });

    it("transitions from error back to listening", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "listening");
      transitionVoiceSession(session.id, "error");
      expect(transitionVoiceSession(session.id, "listening")).toBe(true);
    });

    it("transitions from paused to listening", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "listening");
      transitionVoiceSession(session.id, "paused");
      expect(transitionVoiceSession(session.id, "listening")).toBe(true);
    });
  });

  describe("addVoiceTranscript", () => {
    it("adds transcript and parses command", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "listening");
      const cmd = addVoiceTranscript(session.id, makeTranscript("investigate AI"));
      expect(cmd).toBeDefined();
      expect(cmd!.command).toBe("investigate");
      expect(getVoiceSession(session.id)!.transcripts).toHaveLength(1);
      expect(getVoiceSession(session.id)!.commands).toHaveLength(1);
    });

    it("returns undefined for non-command transcript", () => {
      const session = createVoiceSession();
      const cmd = addVoiceTranscript(session.id, makeTranscript("hello world"));
      expect(cmd).toBeUndefined();
      expect(getVoiceSession(session.id)!.transcripts).toHaveLength(1);
      expect(getVoiceSession(session.id)!.commands).toHaveLength(0);
    });

    it("returns undefined for non-existent session", () => {
      expect(addVoiceTranscript("nonexistent", makeTranscript("help"))).toBeUndefined();
    });

    it("buffers text in thinking-aloud mode instead of parsing command", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "listening");
      transitionVoiceSession(session.id, "thinking-aloud");
      const cmd = addVoiceTranscript(session.id, makeTranscript("investigate AI"));
      expect(cmd).toBeUndefined();
      expect(getVoiceSession(session.id)!.thinkingAloudBuffer).toHaveLength(1);
      expect(getVoiceSession(session.id)!.thinkingAloudBuffer[0].text).toBe("investigate AI");
    });

    it("updates lastActivityAt", () => {
      const session = createVoiceSession();
      const before = session.lastActivityAt;
      addVoiceTranscript(session.id, makeTranscript("test"));
      expect(
        new Date(getVoiceSession(session.id)!.lastActivityAt).getTime()
      ).toBeGreaterThanOrEqual(new Date(before).getTime());
    });
  });

  describe("queueNarration / dequeueNarration", () => {
    it("queues and dequeues narration segments in order", () => {
      const session = createVoiceSession();
      const segments: NarrationSegment[] = [
        { text: "First", type: "heading", pauseAfterMs: 500 },
        { text: "Second", type: "body", pauseAfterMs: 300 },
      ];
      expect(queueNarration(session.id, segments)).toBe(true);
      expect(dequeueNarration(session.id)!.text).toBe("First");
      expect(dequeueNarration(session.id)!.text).toBe("Second");
      expect(dequeueNarration(session.id)).toBeUndefined();
    });

    it("returns false for non-existent session on queue", () => {
      expect(queueNarration("nonexistent", [])).toBe(false);
    });

    it("returns undefined for non-existent session on dequeue", () => {
      expect(dequeueNarration("nonexistent")).toBeUndefined();
    });

    it("handles empty segments array", () => {
      const session = createVoiceSession();
      expect(queueNarration(session.id, [])).toBe(true);
      expect(dequeueNarration(session.id)).toBeUndefined();
    });
  });

  describe("structureThinkingAloud", () => {
    it("returns empty array for empty buffer", () => {
      const session = createVoiceSession();
      expect(structureThinkingAloud(session.id)).toEqual([]);
    });

    it("returns empty array for non-existent session", () => {
      expect(structureThinkingAloud("nonexistent")).toEqual([]);
    });

    it("structures buffer into themes by keywords", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "listening");
      transitionVoiceSession(session.id, "thinking-aloud");
      addVoiceTranscript(session.id, makeTranscript("I think we could build a better engine."));
      addVoiceTranscript(
        session.id,
        makeTranscript("What if we used solar power. Maybe try wind too.")
      );

      const themes = structureThinkingAloud(session.id);
      expect(themes.length).toBeGreaterThan(0);
      const allThemeNames = themes.map((t) => t.theme);
      expect(
        allThemeNames.some((t) => ["could", "think", "what if", "maybe", "general"].includes(t))
      ).toBe(true);
    });

    it("marks buffer entries as structured", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "listening");
      transitionVoiceSession(session.id, "thinking-aloud");
      addVoiceTranscript(session.id, makeTranscript("I think this idea is good."));

      structureThinkingAloud(session.id);
      const buf = getVoiceSession(session.id)!.thinkingAloudBuffer;
      expect(buf.every((b) => b.structured === true)).toBe(true);
    });

    it("groups general sentences without keywords under general theme", () => {
      const session = createVoiceSession();
      transitionVoiceSession(session.id, "listening");
      transitionVoiceSession(session.id, "thinking-aloud");
      addVoiceTranscript(session.id, makeTranscript("The sky is blue."));

      const themes = structureThinkingAloud(session.id);
      expect(themes.some((t) => t.theme === "general")).toBe(true);
    });
  });

  describe("endVoiceSession", () => {
    it("ends a session and sets state to ended", () => {
      const session = createVoiceSession();
      const ended = endVoiceSession(session.id);
      expect(ended).toBeDefined();
      expect(ended!.state).toBe("ended");
    });

    it("returns undefined for non-existent session", () => {
      expect(endVoiceSession("nonexistent")).toBeUndefined();
    });

    it("updates lastActivityAt", () => {
      const session = createVoiceSession();
      const ended = endVoiceSession(session.id);
      expect(new Date(ended!.lastActivityAt).getTime()).toBeGreaterThanOrEqual(
        new Date(session.startedAt).getTime()
      );
    });

    it("cannot transition after end", () => {
      const session = createVoiceSession();
      endVoiceSession(session.id);
      expect(transitionVoiceSession(session.id, "listening")).toBe(false);
    });
  });

  describe("listVoiceSessions / clearVoiceSessions", () => {
    it("lists only active (non-ended) sessions", () => {
      const s1 = createVoiceSession();
      const s2 = createVoiceSession();
      endVoiceSession(s1.id);
      const active = listVoiceSessions();
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(s2.id);
    });

    it("returns empty when no sessions exist", () => {
      expect(listVoiceSessions()).toHaveLength(0);
    });

    it("clearVoiceSessions removes all sessions", () => {
      createVoiceSession();
      createVoiceSession();
      clearVoiceSessions();
      expect(listVoiceSessions()).toHaveLength(0);
    });

    it("handles concurrent sessions independently", () => {
      const s1 = createVoiceSession();
      const s2 = createVoiceSession();
      transitionVoiceSession(s1.id, "listening");
      transitionVoiceSession(s2.id, "listening");
      transitionVoiceSession(s1.id, "processing");
      expect(getVoiceSession(s1.id)!.state).toBe("processing");
      expect(getVoiceSession(s2.id)!.state).toBe("listening");
    });
  });
});
